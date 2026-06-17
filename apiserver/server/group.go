package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

// ---------- 请求结构体 ----------

type CreateGroupReq struct {
	Name string `json:"name" binding:"required"`
}

type AddMemberReq struct {
	UID string `json:"uid" binding:"required"`
}

type AddAgentReq struct {
	AgentID uint `json:"agent_id" binding:"required"`
}

// ---------- handler ----------

// CreateGroup 创建用户组 — POST /api/v1/group
func (s *APIServer) CreateGroup(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	var req CreateGroupReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	group := &model.Group{
		Name:    req.Name,
		OwnerID: uid,
	}

	// 事务：创建组 + 创建者自动加入
	err := s.Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(group).Error; err != nil {
			return err
		}
		return tx.Create(&model.GroupMember{GID: group.GID, UID: uid}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": group,
	})
}

// GetGroups 获取用户所在的所有组 — GET /api/v1/groups
func (s *APIServer) GetGroups(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	var gids []uint
	s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)

	var groups []model.Group
	if len(gids) > 0 {
		s.Db.Where("gid IN ?", gids).Find(&groups)
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": groups,
	})
}

// DeleteGroup 删除用户组 — DELETE /api/v1/group/:gid
func (s *APIServer) DeleteGroup(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	gid := c.Param("gid")

	// 先查组是否存在
	var group model.Group
	if err := s.Db.Where("gid = ?", gid).First(&group).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "group not found",
		})
		return
	}

	// 校验是否 owner
	if group.OwnerID != uid {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    CodeForbidden,
			"message": "not group owner",
		})
		return
	}

	// 事务：删组 + 删成员
	if err := s.Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&group).Error; err != nil {
			return err
		}
		return tx.Where("gid = ?", gid).Delete(&model.GroupMember{}).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "deleted",
	})
}

// AddMember 添加组成员 — POST /api/v1/group/:gid/members
func (s *APIServer) AddMember(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	gid := c.Param("gid")

	var req AddMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	// 校验是否 owner
	var group model.Group
	if err := s.Db.Where("gid = ? AND owner_id = ?", gid, uid).First(&group).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    CodeForbidden,
			"message": "not group owner",
		})
		return
	}

	member := &model.GroupMember{
		GID: group.GID,
		UID: req.UID,
	}
	if err := s.Db.Create(member).Error; err != nil {
		// 区分唯一约束冲突（重复添加）和真实错误
		errStr := err.Error()
		if strings.Contains(errStr, "UNIQUE") || strings.Contains(errStr, "duplicate key") {
			c.JSON(http.StatusOK, gin.H{
				"code":    CodeSuccess,
				"message": "already a member",
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
		"code":    CodeSuccess,
		"message": "added",
	})
}

// RemoveMember 移除组成员 — DELETE /api/v1/group/:gid/members/:uid
func (s *APIServer) RemoveMember(c *gin.Context) {
	ownerUID := c.GetString(middleware.CtxUID)
	gid := c.Param("gid")
	targetUID := c.Param("uid")

	// 校验是否 owner
	var group model.Group
	if err := s.Db.Where("gid = ? AND owner_id = ?", gid, ownerUID).First(&group).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    CodeForbidden,
			"message": "not group owner",
		})
		return
	}

	// 不能移除自己
	if targetUID == ownerUID {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "cannot remove yourself",
		})
		return
	}

	s.Db.Where("gid = ? AND uid = ?", gid, targetUID).Delete(&model.GroupMember{})

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "removed",
	})
}

// GetGroupMembers 获取组成员列表 — GET /api/v1/group/:gid/members
func (s *APIServer) GetGroupMembers(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	gid := c.Param("gid")

	// 校验是否组内成员
	var count int64
	s.Db.Model(&model.GroupMember{}).Where("gid = ? AND uid = ?", gid, uid).Count(&count)
	if count == 0 {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    CodeForbidden,
			"message": "not a member of this group",
		})
		return
	}

	var members []model.GroupMember
	s.Db.Where("gid = ?", gid).Find(&members)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": members,
	})
}

// AddAgent 将 Agent 分配到组 — POST /api/v1/group/:gid/agents
func (s *APIServer) AddAgent(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	gid := c.Param("gid")

	var req AddAgentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	// 校验是否 owner
	var group model.Group
	if err := s.Db.Where("gid = ? AND owner_id = ?", gid, uid).First(&group).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    CodeForbidden,
			"message": "not group owner",
		})
		return
	}

	// 更新 Agent 的 GID
	result := s.Db.Model(&model.AgentInfo{}).Where("id = ?", req.AgentID).Update("gid", group.GID)
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
			"message": "agent not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "agent added to group",
	})
}
