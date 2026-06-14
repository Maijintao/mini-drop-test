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
