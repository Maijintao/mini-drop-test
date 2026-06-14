package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	CtxUID      = "uid"
	CtxUserName = "user_name"
)

// CheckLogin 鉴权中间件
// 前端 axios 拦截器会在 header 里带 Drop_user_uid / Drop_user_name
// 也兼容从 cookie 读取
func CheckLogin() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetHeader("Drop_user_uid")
		if uid == "" {
			uid, _ = c.Cookie("drop_user_uid")
		}
		userName := c.GetHeader("Drop_user_name")
		if userName == "" {
			userName, _ = c.Cookie("drop_user_name")
		}

		if uid == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code": 4010001,
				"data": gin.H{"location": "/login"},
			})
			c.Abort()
			return
		}

		c.Set(CtxUID, uid)
		c.Set(CtxUserName, userName)
		c.Next()
	}
}
