package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

// GetAgents Agent 列表（含组共享） — GET /api/v1/agents
func (s *APIServer) GetAgents(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = s.syncAgentsFromDrop(ctx, uid)

	// 查自己所在组的 gid 列表
	var user model.UserInfo
	s.Db.Where("uid = ?", uid).First(&user)

	var gids []uint
	s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)

	// 查自己 + 组内成员 + 未分配的本地 Agent
	var agents []model.AgentInfo
	query := s.Db.Where("uid = ? OR gid = 0", uid)
	if len(gids) > 0 {
		query = query.Or("uid IN (SELECT uid FROM group_members WHERE gid IN ?)", gids)
	}
	if err := query.Order("online DESC, updated_at DESC").Find(&agents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": agents,
	})
}

func (s *APIServer) syncAgentsFromDrop(ctx context.Context, ownerUID string) error {
	if s.GRPC == nil {
		return nil
	}

	resp, err := s.GRPC.ListAgents(ctx, &pb.ListAgentsRequest{})
	if err != nil {
		return err
	}
	if resp.GetCode() != 0 {
		return fmt.Errorf("list agents failed: %s", resp.GetMessage())
	}

	// 查询 owner 所在的第一个组的 GID
	var ownerGID uint
	var member model.GroupMember
	if err := s.Db.Where("uid = ?", ownerUID).First(&member).Error; err == nil {
		ownerGID = member.GID
	}

	now := time.Now()
	for _, remote := range resp.GetAgents() {
		ip := remote.GetIpAddr()
		if ip == "" {
			continue
		}
		hostname := remote.GetHostName()
		if hostname == "" {
			hostname = ip
		}

		agentUID := remote.GetUid()

		// 查该 Agent 归属用户的 GID
		agentGID := ownerGID
		var agentMember model.GroupMember
		if err := s.Db.Where("uid = ?", agentUID).First(&agentMember).Error; err == nil {
			agentGID = agentMember.GID
		}

		updates := map[string]interface{}{
			"hostname":       hostname,
			"online":         remote.GetOnline(),
			"version":        remote.GetAgentVersion(),
			"last_heartbeat": now,
			"uid":            agentUID,
			"gid":            agentGID,
		}

		var agent model.AgentInfo
		err := s.Db.Where("ip_addr = ?", ip).First(&agent).Error
		switch {
		case err == nil:
			// 检测在线状态变更，写入审计日志
			wasOnline := agent.Online
			nowOnline := remote.GetOnline()
			if wasOnline != nowOnline {
				reason := "Agent 恢复上线"
				if !nowOnline {
					reason = "Agent 离线（心跳超时）"
				}
				s.Db.Create(&model.AgentStateHistory{
					IPAddr:    ip,
					Hostname:  hostname,
					FromState: wasOnline,
					ToState:   nowOnline,
					Reason:    reason,
				})
			}
			if err := s.Db.Model(&agent).Updates(updates).Error; err != nil {
				return err
			}
		case err == gorm.ErrRecordNotFound:
			agent = model.AgentInfo{
				Hostname:      hostname,
				IPAddr:        ip,
				Online:        remote.GetOnline(),
				UID:           agentUID,
				GID:           agentGID,
				Version:       remote.GetAgentVersion(),
				Environment:   "default",
				LastHeartbeat: now,
			}
			if err := s.Db.Create(&agent).Error; err != nil {
				return err
			}
		default:
			return err
		}
	}

	return nil
}

// StatAgent 查询 Agent 当前资源占用 — GET /api/v1/agent/stat?ip=xxx
func (s *APIServer) canAccessAgentIP(uid, ip string) bool {
	if ip == "" {
		return false
	}
	var gids []uint
	_ = s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids).Error

	query := s.Db.Model(&model.AgentInfo{}).Where("ip_addr = ? AND (uid = ? OR gid = 0)", ip, uid)
	if len(gids) > 0 {
		query = query.Or("ip_addr = ? AND gid IN ?", ip, gids)
	}
	var count int64
	query.Count(&count)
	return count > 0
}

// GetAgentAuditLog 查询 Agent 状态变更审计日志 — GET /api/v1/agent/audit-log?ip=xxx&limit=50
func (s *APIServer) GetAgentAuditLog(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = s.syncAgentsFromDrop(ctx, uid)

	ip := c.Query("ip")
	limit := 50
	if l, err := fmt.Sscanf(c.DefaultQuery("limit", "50"), "%d", &limit); err != nil || l != 1 || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := s.Db.Model(&model.AgentStateHistory{}).Order("created_at DESC").Limit(limit)
	if ip != "" {
		if !s.canAccessAgentIP(uid, ip) {
			c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "agent not found"})
			return
		}
		query = query.Where("ip_addr = ?", ip)
	} else {
		var agents []model.AgentInfo
		agentQuery := s.Db.Where("uid = ? OR gid = 0", uid)
		var gids []uint
		_ = s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids).Error
		if len(gids) > 0 {
			agentQuery = agentQuery.Or("gid IN ?", gids)
		}
		agentQuery.Find(&agents)
		ips := make([]string, 0, len(agents))
		for _, agent := range agents {
			ips = append(ips, agent.IPAddr)
		}
		if len(ips) == 0 {
			c.JSON(http.StatusOK, gin.H{"code": CodeSuccess, "data": []model.AgentStateHistory{}})
			return
		}
		query = query.Where("ip_addr IN ?", ips)
	}

	var logs []model.AgentStateHistory
	query.Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": logs,
	})
}
func (s *APIServer) StatAgent(c *gin.Context) {
	ip := c.Query("ip")
	if ip == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "ip is required",
		})
		return
	}

	if s.GRPC == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server unavailable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	uid := c.GetString(middleware.CtxUID)
	_ = s.syncAgentsFromDrop(ctx, uid)
	if !s.canAccessAgentIP(uid, ip) {
		var totalAgents int64
		_ = s.Db.Model(&model.AgentInfo{}).Count(&totalAgents).Error
		if totalAgents > 0 {
			c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "agent not found"})
			return
		}
	}

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
