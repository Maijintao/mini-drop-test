package server

import (
	"bytes"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"mini-drop/apiserver/model"
)

// TriggerAnalysis 触发分析 — POST /api/v1/tasks/:tid/analyze
func (s *APIServer) TriggerAnalysis(c *gin.Context) {
	tid := c.Param("tid")

	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "task not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
		return
	}

	if task.Status != TaskStatusSuccess {
		c.JSON(http.StatusBadRequest, gin.H{"code": CodeParamError, "message": "task not completed"})
		return
	}

	if task.AnalysisStatus == AnalysisStatusRunning {
		c.JSON(http.StatusConflict, gin.H{"code": CodeInternal, "message": "analysis already running"})
		return
	}

	// 异步触发，不阻塞请求
	go s.runAnalysis(tid, task.Type)

	c.JSON(http.StatusOK, gin.H{"code": CodeSuccess, "message": "analysis triggered"})
}

// runAnalysis 执行分析子进程
func (s *APIServer) runAnalysis(tid string, taskType int) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// 设为分析中
	s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Update("analysis_status", AnalysisStatusRunning)
	logger.Info("analysis started", zap.String("tid", tid))

	// 构造命令
	cmdStr := s.AnalysisCmd.Command
	scriptPath := s.AnalysisCmd.ScriptPath
	configPath := s.AnalysisCmd.ConfigPath

	args := []string{
		scriptPath,
		"--task-id", tid,
		"--task-type", strconv.Itoa(taskType),
	}
	if configPath != "" {
		args = append(args, "--config", configPath)
	}

	cmd := exec.Command(cmdStr, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err := cmd.Run()

	if err != nil {
		s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Updates(map[string]interface{}{
			"analysis_status": AnalysisStatusFailed,
			"status_info":     fmt.Sprintf("analysis failed: %v, stderr: %s", err, stderr.String()),
		})
		logger.Error("analysis failed", zap.String("tid", tid), zap.Error(err), zap.String("stderr", stderr.String()))
		return
	}

	s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Update("analysis_status", AnalysisStatusSuccess)
	logger.Info("analysis completed", zap.String("tid", tid))
}
