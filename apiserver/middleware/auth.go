package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
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
// secret 非空时，额外验证 HMAC 签名（Drop_user_token header 或 drop_user_token cookie）
func CheckLogin(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := firstHeader(c, "Drop_user_uid", "Drop_User_Uid", "Drop-User-Uid")
		if uid == "" {
			uid, _ = c.Cookie("drop_user_uid")
		}
		userName := firstHeader(c, "Drop_user_name", "Drop_User_Name", "Drop-User-Name")
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

		// HMAC 签名验证
		if secret != "" {
			token := firstHeader(c, "Drop_user_token", "Drop_User_Token", "Drop-User-Token")
			if token == "" {
				token, _ = c.Cookie("drop_user_token")
			}
			if !verifyHMAC(uid, token, secret) {
				c.JSON(http.StatusUnauthorized, gin.H{
					"code":    4010002,
					"message": "invalid auth token",
				})
				c.Abort()
				return
			}
		}

		c.Set(CtxUID, uid)
		c.Set(CtxUserName, userName)
		c.Next()
	}
}

func firstHeader(c *gin.Context, keys ...string) string {
	for _, key := range keys {
		if value := c.GetHeader(key); value != "" {
			return value
		}
	}
	return ""
}

// ComputeHMAC 计算 uid 的 HMAC-SHA256 签名
func ComputeHMAC(uid, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(uid))
	return hex.EncodeToString(mac.Sum(nil))
}

func verifyHMAC(uid, token, secret string) bool {
	if token == "" {
		return false
	}
	expected := ComputeHMAC(uid, secret)
	return hmac.Equal([]byte(token), []byte(expected))
}
