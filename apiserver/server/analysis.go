package server

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

// TriggerAnalysis 触发分析 — POST /api/v1/tasks/:tid/analyze
func (s *APIServer) TriggerAnalysis(c *gin.Context) {
	tid := c.Param("tid")

	task, ok := s.checkTaskAccess(c, tid)
	if !ok {
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
	if s.AnalysisCmd.Command == "" || s.AnalysisCmd.ScriptPath == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": "analysis command not configured"})
		return
	}

	// 异步触发，不阻塞请求
	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		s.runAnalysis(tid, task.Type)
	}()

	c.JSON(http.StatusOK, gin.H{"code": CodeSuccess, "message": "analysis triggered"})
}

// runAnalysis 执行分析子进程
func (s *APIServer) runAnalysis(tid string, taskType int) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, cmdStr, args...)
	cmd.Env = s.analysisProcessEnv(tid)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err := cmd.Run()

	if err != nil {
		// 子进程超时或崩溃时兜底：如果子进程已自行设置终态则不覆盖
		var task model.HotmethodTask
		if dbErr := s.Db.Where("tid = ?", tid).First(&task).Error; dbErr == nil {
			if task.AnalysisStatus != AnalysisStatusSuccess && task.AnalysisStatus != AnalysisStatusFailed {
				failReason := fmt.Sprintf("analysis failed: %v, stderr: %s", err, stderr.String())
				s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Updates(map[string]interface{}{
					"analysis_status": AnalysisStatusFailed,
					"status_info":     failReason,
				})
				s.recordStateChange(tid, task.AnalysisStatus, AnalysisStatusFailed, failReason, ChangeTypeAnalysis)
			}
		}
		logger.Error("analysis failed", zap.String("tid", tid), zap.Error(err), zap.String("stderr", stderr.String()))
		return
	}

	// 子进程正常退出，状态由子进程自行设置，不重复写入
	logger.Info("analysis process exited", zap.String("tid", tid))
}

func (s *APIServer) analysisProcessEnv(tid string) []string {
	env := os.Environ()

	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		return env
	}

	env = append(env,
		"DROP_USER_UID="+task.UID,
		"DROP_USER_NAME="+task.UserName,
	)
	if s.AuthSecret != "" {
		env = append(env, "DROP_USER_TOKEN="+middleware.ComputeHMAC(task.UID, s.AuthSecret))
	}
	llm := s.getLLMConfig(task.UID)
	if llm.BaseURL != "" {
		env = append(env, "LLM_BASE_URL="+llm.BaseURL)
		env = append(env, "LLM_API_URL="+llm.BaseURL)
	}
	if llm.Token != "" {
		env = append(env, "LLM_TOKEN="+llm.Token)
		env = append(env, "LLM_API_KEY="+llm.Token)
	}
	if llm.Model != "" {
		env = append(env, "LLM_MODEL="+llm.Model)
	}
	return env
}
