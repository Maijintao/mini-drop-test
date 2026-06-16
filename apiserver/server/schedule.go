package server

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

// ScheduleManager 管理定时任务
type ScheduleManager struct {
	cron    *cron.Cron
	entries map[string]cron.EntryID // tid -> cron entry
	mu      sync.Mutex
	db      *gorm.DB
	api     *APIServer // 反向引用，用于执行定时任务
}

func NewScheduleManager(db *gorm.DB) *ScheduleManager {
	return &ScheduleManager{
		cron:    cron.New(),
		entries: make(map[string]cron.EntryID),
		db:      db,
	}
}

func (sm *ScheduleManager) Start() {
	sm.cron.Start()
	sm.loadFromDB()
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
	if err := s.Db.Create(task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "create schedule failed: " + err.Error(),
		})
		return
	}

	// 注册到 cron 调度器
	sm := s.Schedule
	if sm != nil {
		sm.mu.Lock()
		// 捕获 task 值供闭包使用
		capturedTask := *task
		entryID, err := sm.cron.AddFunc(req.CronExpr, func() {
			sm.executeScheduledTask(capturedTask)
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

// executeScheduledTask 定时任务触发时的通用逻辑
func (sm *ScheduleManager) executeScheduledTask(task model.HotmethodTask) {
	if sm.api == nil {
		return
	}
	s := sm.api

	var params map[string]interface{}
	if task.RequestParams != nil {
		json.Unmarshal(task.RequestParams, &params)
	}

	pid, _ := params["pid"].(float64)
	duration, _ := params["duration"].(float64)
	hz, _ := params["hz"].(float64)
	callgraph, _ := params["callgraph"].(string)

	newTid := uuid.New().String()[:12]
	newTask := &model.HotmethodTask{
		TID:          newTid,
		Name:         "[定时触发] " + task.Name,
		Type:         task.Type,
		ProfilerType: task.ProfilerType,
		TargetIP:     task.TargetIP,
		RequestParams: datatypes.JSON(task.RequestParams),
		Status:       TaskStatusNew,
		UID:          task.UID,
		UserName:     task.UserName,
		CreateTime:   time.Now(),
	}
	if err := s.Db.Create(newTask).Error; err != nil {
		return
	}

	if s.GRPC == nil {
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "cron dispatch failed: drop_server unavailable",
		})
		return
	}

	pbReq := &pb.CreateTaskRequest{
		TargetIp: task.TargetIP,
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:       newTid,
			TaskType:     uint32(task.Type),
			ProfilerType: uint32(task.ProfilerType),
			TimeoutSec:   uint32(uint64(duration) + 30),
			SampleArgv: &pb.RecordArgv{
				Hz:        uint32(hz),
				Duration:  uint64(duration),
				Pid:       int32(pid),
				Callgraph: callgraph,
			},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s.GRPC.CreateTask(ctx, pbReq); err != nil {
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "cron dispatch failed: " + err.Error(),
		})
		return
	}
	go s.waitTaskResult(context.Background(), newTid, uint64(duration)+60)
}

// loadFromDB 从数据库加载定时任务，重启后恢复
func (sm *ScheduleManager) loadFromDB() {
	if sm.db == nil {
		return
	}

	var tasks []model.HotmethodTask
	sm.db.Where("tid LIKE 'sched-%'").Find(&tasks)

	for _, task := range tasks {
		var params map[string]interface{}
		if task.RequestParams != nil {
			json.Unmarshal(task.RequestParams, &params)
		}
		cronExpr, _ := params["cron_expr"].(string)
		if cronExpr == "" {
			continue
		}

		sm.mu.Lock()
		capturedTask := task
		entryID, err := sm.cron.AddFunc(cronExpr, func() {
			sm.executeScheduledTask(capturedTask)
		})
		if err == nil {
			sm.entries[task.TID] = entryID
		}
		sm.mu.Unlock()
	}
}
