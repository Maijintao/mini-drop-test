package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

const (
	llmBaseURLKey = "llm.base_url"
	llmTokenKey   = "llm.token"
	llmModelKey   = "llm.model"
)

type LLMConfig struct {
	BaseURL string `json:"base_url"`
	Token   string `json:"token,omitempty"`
	Model   string `json:"model"`
}

// GetLLMSettings 获取当前用户 LLM 设置。token 不返回明文。
func (s *APIServer) GetLLMSettings(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	cfg := s.getLLMConfig(uid)
	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"base_url":         cfg.BaseURL,
			"model":            cfg.Model,
			"token_configured": cfg.Token != "",
			"token_masked":     maskToken(cfg.Token),
		},
	})
}

// UpdateLLMSettings 更新当前用户 LLM 设置。token 为空时保留旧 token。
func (s *APIServer) UpdateLLMSettings(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	var req struct {
		BaseURL    string `json:"base_url"`
		Token      string `json:"token"`
		Model      string `json:"model"`
		ClearToken bool   `json:"clear_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": CodeParamError, "message": err.Error()})
		return
	}

	baseURL := strings.TrimSpace(req.BaseURL)
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}
	if baseURL != "" && !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		c.JSON(http.StatusBadRequest, gin.H{"code": CodeParamError, "message": "base_url must start with http:// or https://"})
		return
	}

	if err := s.setUserConfig(uid, llmBaseURLKey, baseURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
		return
	}
	if err := s.setUserConfig(uid, llmModelKey, model); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
		return
	}
	if req.ClearToken {
		if err := s.setUserConfig(uid, llmTokenKey, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
			return
		}
	} else if req.Token != "" {
		if err := s.setUserConfig(uid, llmTokenKey, strings.TrimSpace(req.Token)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
			return
		}
	}

	cfg := s.getLLMConfig(uid)
	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"base_url":         cfg.BaseURL,
			"model":            cfg.Model,
			"token_configured": cfg.Token != "",
			"token_masked":     maskToken(cfg.Token),
		},
	})
}

func (s *APIServer) getLLMConfig(uid string) LLMConfig {
	return LLMConfig{
		BaseURL: s.getUserConfig(uid, llmBaseURLKey),
		Token:   s.getUserConfig(uid, llmTokenKey),
		Model:   defaultString(s.getUserConfig(uid, llmModelKey), "gpt-4o-mini"),
	}
}

func (s *APIServer) getUserConfig(uid, key string) string {
	var cfg model.UserConfig
	if err := s.Db.Where("uid = ? AND key = ?", uid, key).First(&cfg).Error; err != nil {
		return ""
	}
	return cfg.Value
}

func (s *APIServer) setUserConfig(uid, key, value string) error {
	var cfg model.UserConfig
	err := s.Db.Where("uid = ? AND key = ?", uid, key).First(&cfg).Error
	if err == nil {
		return s.Db.Model(&cfg).Update("value", value).Error
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	return s.Db.Create(&model.UserConfig{UID: uid, Key: key, Value: value}).Error
}

func maskToken(token string) string {
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return "********"
	}
	return token[:4] + "..." + token[len(token)-4:]
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
