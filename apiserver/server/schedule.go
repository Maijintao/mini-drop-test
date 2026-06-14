package server

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
)

// ScheduleManager 管理定时任务
type ScheduleManager struct {
	cron    *cron.Cron
	entries map[string]cron.EntryID // tid -> cron entry
	mu      sync.Mutex
}

func NewScheduleManager() *ScheduleManager {
	return &ScheduleManager{
		cron:    cron.New(),
		entries: make(map[string]cron.EntryID),
	}
}

func (sm *ScheduleManager) Start() {
	sm.cron.Start()
}

func (sm *ScheduleManager) Stop() {
	sm.cron.Stop()
}

// ---------- 请求结构体 ----------

type CreateScheduleReq struct {
	TaskName     string `json:"task_name" binding:"required"`
	Type         int    `json:"type"`
	ProfilerType int    `json:"profiler_type"`
	TargetIP     string `json:"target_ip" binding:"required"`
	PID          int32  `json:"pid" binding:"required"`
	Duration     uint64 `json:"duration" binding:"required"`
	Hz           uint32 `json:"hz"`
	Callgraph    string `json:"callgraph"`
	CronExpr     string `json:"cron_expr" binding:"required"` // cron 表达式
}

// ---------- handler ----------

// CreateScheduleTask 创建定时任务 — POST /api/v1/schedule/task
func (s *APIServer) CreateScheduleTask(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	userName := c.GetString(middleware.CtxUserName)

	var req CreateScheduleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	if req.Hz == 0 {
		req.Hz = 99
	}
	if req.Callgraph == "" {
		req.Callgraph = "dwarf"
	}

	// 创建一个"模板任务"标记为定时
	tid := "sched-" + req.TaskName
	task := &model.HotmethodTask{
		TID:          tid,
		Name:         "[定时] " + req.TaskName,
		Type:         req.Type,
		ProfilerType: req.ProfilerType,
		TargetIP:     req.TargetIP,
		RequestParams: mustMarshal(gin.H{
			"pid":        req.PID,
			"duration":   req.Duration,
			"hz":         req.Hz,
			"callgraph":  req.Callgraph,
			"subprocess": false,
			"cron_expr":  req.CronExpr,
		}),
		Status:   TaskStatusNew,
		UID:      uid,
		UserName: userName,
	}

	// 写库记录定时任务
	s.Db.Create(task)

	// 注册到 cron 调度器（MVP 阶段只记录，实际触发需集成 CreateTask 逻辑）
	sm := s.Schedule
	if sm != nil {
		sm.mu.Lock()
		entryID, err := sm.cron.AddFunc(req.CronExpr, func() {
			// 定时触发时自动创建一次采集任务
			// 实际实现中应调用 s.CreateTask 的内部版本
			_ = s
		})
		if err == nil {
			sm.entries[tid] = entryID
		}
		sm.mu.Unlock()
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"tid":       tid,
			"cron_expr": req.CronExpr,
			"message":   "schedule created",
		},
	})
}

// GetScheduleTasks 获取定时任务列表 — GET /api/v1/schedule/tasks
func (s *APIServer) GetScheduleTasks(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	var tasks []model.HotmethodTask
	s.Db.Where("uid = ? AND tid LIKE 'sched-%'", uid).
		Order("created_at DESC").
		Find(&tasks)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": tasks,
	})
}

// DeleteScheduleTask 删除定时任务 — DELETE /api/v1/schedule/task/:tid
func (s *APIServer) DeleteScheduleTask(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	tid := c.Param("tid")

	result := s.Db.Where("tid = ? AND uid = ?", tid, uid).Delete(&model.HotmethodTask{})
	if result.Error != nil || result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "schedule not found",
		})
		return
	}

	// 从 cron 调度器移除
	sm := s.Schedule
	if sm != nil {
		sm.mu.Lock()
		if entryID, ok := sm.entries[tid]; ok {
			sm.cron.Remove(entryID)
			delete(sm.entries, tid)
		}
		sm.mu.Unlock()
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "deleted",
	})
}
