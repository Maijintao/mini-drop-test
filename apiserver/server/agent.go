package server

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

// GetAgents Agent 列表（含组共享） — GET /api/v1/agents
func (s *APIServer) GetAgents(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	// 查自己所在组的 gid 列表
	var user model.UserInfo
	s.Db.Where("uid = ?", uid).First(&user)

	var gids []uint
	s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)

	// 查自己 + 组内成员的 Agent
	var agents []model.AgentInfo
	query := s.Db.Where("uid = ?", uid)
	if len(gids) > 0 {
		query = s.Db.Where("uid = ? OR gid IN ?", uid, gids)
	}
	query.Order("online DESC, updated_at DESC").Find(&agents)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": agents,
	})
}

// StatAgent 查询 Agent 当前资源占用 — GET /api/v1/agent/stat?ip=xxx
func (s *APIServer) StatAgent(c *gin.Context) {
	ip := c.Query("ip")
	if ip == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "ip is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := s.GRPC.StatAgent(ctx, &pb.StatAgentRequest{IpAddr: ip})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": resp,
	})
}
