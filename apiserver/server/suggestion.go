package server

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-drop/apiserver/model"
)

// GetSuggestions 获取任务的分析建议 — GET /api/v1/tasks/:tid/suggestions
func (s *APIServer) GetSuggestions(c *gin.Context) {
	tid := c.Param("tid")

	if _, ok := s.checkTaskAccess(c, tid); !ok {
		return
	}

	var suggestions []model.AnalysisSuggestion
	if err := s.Db.Where("tid = ?", tid).Order("id ASC").Find(&suggestions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": suggestions,
	})
}

// CreateSuggestion 写入分析建议 — POST /api/v1/tasks/:tid/suggestions
func (s *APIServer) CreateSuggestion(c *gin.Context) {
	tid := c.Param("tid")

	if _, ok := s.checkTaskAccess(c, tid); !ok {
		return
	}

	var req struct {
		Func         string `json:"func" binding:"required"`
		Suggestion   string `json:"suggestion"`
		AISuggestion string `json:"ai_suggestion"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	var suggestion model.AnalysisSuggestion
	err := s.Db.Where("tid = ? AND func = ?", tid, req.Func).First(&suggestion).Error
	if err == nil {
		suggestion.Suggestion = req.Suggestion
		suggestion.AISuggestion = req.AISuggestion
		suggestion.Status = AnalysisStatusSuccess
		err = s.Db.Save(&suggestion).Error
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		suggestion = model.AnalysisSuggestion{
			TID:          tid,
			Func:         req.Func,
			Suggestion:   req.Suggestion,
			AISuggestion: req.AISuggestion,
			Status:       AnalysisStatusSuccess,
		}
		err = s.Db.Create(&suggestion).Error
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": &suggestion,
	})
}

// UpdateAnalysisStatus 更新任务分析状态 — PUT /api/v1/tasks/:tid/analysis_status
func (s *APIServer) UpdateAnalysisStatus(c *gin.Context) {
	tid := c.Param("tid")

	if _, ok := s.checkTaskAccess(c, tid); !ok {
		return
	}

	var req struct {
		AnalysisStatus int    `json:"analysis_status"`
		StatusInfo     string `json:"status_info"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	// 查询当前分析状态用于审计
	var currentTask model.HotmethodTask
	s.Db.Where("tid = ?", tid).First(&currentTask)

	statusInfo := req.StatusInfo
	if currentTask.StatusInfo != "" &&
		strings.Contains(currentTask.StatusInfo, "collector result ready: ") &&
		!strings.Contains(statusInfo, "collector result ready: ") {
		if statusInfo == "" {
			statusInfo = currentTask.StatusInfo
		} else {
			statusInfo = currentTask.StatusInfo + "; " + statusInfo
		}
	}

	result := s.Db.Model(&model.HotmethodTask{}).
		Where("tid = ?", tid).
		Updates(map[string]interface{}{
			"analysis_status": req.AnalysisStatus,
			"status_info":     statusInfo,
		})

	// 记录分析状态变更审计
	if result.Error == nil && result.RowsAffected > 0 && currentTask.AnalysisStatus != req.AnalysisStatus {
		s.recordStateChange(tid, currentTask.AnalysisStatus, req.AnalysisStatus, req.StatusInfo, ChangeTypeAnalysis)
	}

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": result.Error.Error(),
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "task not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "updated",
	})
}
