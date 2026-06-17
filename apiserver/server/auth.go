package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

// AuthCheck 鉴权检查 — GET /api/v1/auth/check
func (s *APIServer) AuthCheck(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	// 查找用户（必须已注册）
	var user model.UserInfo
	if err := s.Db.Where("uid = ?", uid).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    4010003,
			"message": "user not found, please register first",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"uid":       user.UID,
			"user_name": user.Name,
		},
	})
}

// Register 注册 — POST /api/v1/auth/register
func (s *APIServer) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "username and password are required",
		})
		return
	}

	username := strings.TrimSpace(req.Username)
	password := req.Password

	if len(username) < 2 || len(username) > 32 {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "username must be 2-32 characters",
		})
		return
	}
	if len(password) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "password must be at least 4 characters",
		})
		return
	}

	// 检查用户名是否已存在
	uid := "user-" + username
	var existing model.UserInfo
	if err := s.Db.Where("uid = ?", uid).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"code":    4090001,
			"message": "username already exists",
		})
		return
	}

	// 哈希密码
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "failed to hash password",
		})
		return
	}

	user := model.UserInfo{
		UID:          uid,
		Name:         username,
		PasswordHash: string(hash),
	}
	if err := s.Db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "failed to create user: " + err.Error(),
		})
		return
	}

	token := middleware.ComputeHMAC(uid, s.AuthSecret)

	c.SetCookie("drop_user_uid", uid, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_name", username, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_token", token, 86400*7, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"uid":       uid,
			"user_name": username,
			"token":     token,
		},
	})
}

// Login 登录 — POST /api/v1/auth/login
func (s *APIServer) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "username and password are required",
		})
		return
	}

	uid := "user-" + strings.TrimSpace(req.Username)

	var user model.UserInfo
	if err := s.Db.Where("uid = ?", uid).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    4010004,
			"message": "invalid username or password",
		})
		return
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    4010004,
			"message": "invalid username or password",
		})
		return
	}

	token := middleware.ComputeHMAC(uid, s.AuthSecret)

	c.SetCookie("drop_user_uid", uid, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_name", user.Name, 86400*7, "/", "", false, false)
	c.SetCookie("drop_user_token", token, 86400*7, "/", "", false, false)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"uid":       uid,
			"user_name": user.Name,
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
