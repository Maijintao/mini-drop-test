package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

// AuthCheck 鉴权检查 — GET /api/v1/auth/check
func (s *APIServer) AuthCheck(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	userName := c.GetString(middleware.CtxUserName)

	// 确保用户存在于 DB，不存在则自动创建
	var user model.UserInfo
	if err := s.Db.Where("uid = ?", uid).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			user = model.UserInfo{
				UID:  uid,
				Name: userName,
			}
			if createErr := s.Db.Create(&user).Error; createErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"code":    CodeInternal,
					"message": "auto-create user failed: " + createErr.Error(),
				})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"uid":       uid,
			"user_name": userName,
		},
	})
}

// Login 登录端点 — POST /api/v1/auth/login
// 生成 HMAC token 返回给前端，前端存 cookie 后续请求带上
func (s *APIServer) Login(c *gin.Context) {
	var req struct {
		UID      string `json:"uid" binding:"required"`
		UserName string `json:"user_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "uid is required",
		})
		return
	}

	token := middleware.ComputeHMAC(req.UID, s.AuthSecret)

	// 同时设置 cookie，兼容纯 cookie 模式
	c.SetCookie("drop_user_uid", req.UID, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_name", req.UserName, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_token", token, 86400*7, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"uid":       req.UID,
			"user_name": req.UserName,
			"token":     token,
		},
	})
}

// GetUsers 获取当前用户信息 — GET /api/v1/users
func (s *APIServer) GetUsers(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	var user model.UserInfo
	if err := s.Db.Where("uid = ?", uid).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    CodeNotFound,
				"message": "user not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": user,
	})
}
