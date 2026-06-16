package server

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

// ---------- 请求/响应结构体 ----------

type CreateTaskReq struct {
	Name         string `json:"name" binding:"required"`
	Type         int    `json:"type"`
	ProfilerType int    `json:"profiler_type"`
	TargetIP     string `json:"target_ip" binding:"required"`
	PID          int32  `json:"pid" binding:"required"`
	Duration     uint64 `json:"duration" binding:"required"`
	Hz           uint32 `json:"hz"`
	Callgraph    string `json:"callgraph"`
	Subprocess   bool   `json:"subprocess"`
	Event        string `json:"event"`
}

// ---------- handler ----------

// CreateTask 创建采集任务 — POST /api/v1/tasks
func (s *APIServer) CreateTask(c *gin.Context) {
	var req CreateTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	uid := c.GetString(middleware.CtxUID)
	userName := c.GetString(middleware.CtxUserName)
	tid := uuid.New().String()[:12]

	// 默认值
	if req.Hz == 0 {
		req.Hz = 99
	}
	if req.Callgraph == "" {
		req.Callgraph = "dwarf"
	}

	// 1) 写库
	task := &model.HotmethodTask{
		TID:          tid,
		Name:         req.Name,
		Type:         req.Type,
		ProfilerType: req.ProfilerType,
		TargetIP:     req.TargetIP,
		RequestParams: datatypes.JSON(mustMarshal(gin.H{
			"pid":        req.PID,
			"duration":   req.Duration,
			"hz":         req.Hz,
			"callgraph":  req.Callgraph,
			"subprocess": req.Subprocess,
			"event":      req.Event,
		})),
		Status:     TaskStatusNew,
		UID:        uid,
		UserName:   userName,
		CreateTime: time.Now(),
	}
	if err := s.Db.Create(task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	// 2) 调 drop_server 下发任务
	pbReq := &pb.CreateTaskRequest{
		TargetIp: req.TargetIP,
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:       tid,
			TaskType:     uint32(req.Type),
			ProfilerType: uint32(req.ProfilerType),
			TimeoutSec:   uint32(req.Duration + 30),
			SampleArgv: &pb.RecordArgv{
				Hz:         req.Hz,
				Duration:   req.Duration,
				Pid:        req.PID,
				Callgraph:  req.Callgraph,
				Subprocess: req.Subprocess,
				Event:      req.Event,
			},
		},
	}

	if s.GRPC == nil {
		s.Db.Model(task).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "drop_server unavailable (gRPC not connected)",
		})
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server unavailable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := s.GRPC.CreateTask(ctx, pbReq)
	if err != nil {
		// 下发失败，回滚状态
		s.Db.Model(task).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "dispatch failed: " + err.Error(),
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "dispatch failed: " + err.Error(),
		})
		return
	}
	if resp.GetCode() != 0 {
		s.Db.Model(task).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "drop_server rejected: " + resp.GetMessage(),
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server rejected: " + resp.GetMessage(),
		})
		return
	}
	go s.waitTaskResult(tid, req.Duration+60)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{"tid": tid},
	})
}

// GetTasks 任务列表（分页，自己+组内共享） — GET /api/v1/tasks
func (s *APIServer) GetTasks(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)

	page := parseIntDefault(c.Query("page"), 1)
	size := parseIntDefault(c.Query("size"), 20)
	status := c.Query("status")
	keyword := c.Query("keyword")

	// 查自己所在组
	var gids []uint
	s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)

	query := s.Db.Where("uid = ?", uid)
	if len(gids) > 0 {
		query = query.Or("uid IN (SELECT uid FROM group_members WHERE gid IN ?)", gids)
	}

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		query = query.Where("name LIKE ? OR target_ip LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	query.Model(&model.HotmethodTask{}).Count(&total)

	var tasks []model.HotmethodTask
	query.Order("create_time DESC").
		Offset((page - 1) * size).
		Limit(size).
		Find(&tasks)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"total": total,
			"list":  tasks,
			"page":  page,
			"size":  size,
		},
	})
}

// GetTaskDetail 任务详情（含产出文件签名URL） — GET /api/v1/tasks/:tid
func (s *APIServer) GetTaskDetail(c *gin.Context) {
	tid := c.Param("tid")
	uid := c.GetString(middleware.CtxUID)

	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    CodeNotFound,
				"message": "task not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	// 权限校验：自己的任务 或 组内成员的任务
	if task.UID != uid {
		var gids []uint
		s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)
		allowed := false
		if len(gids) > 0 {
			var count int64
			s.Db.Model(&model.GroupMember{}).Where("uid = ? AND gid IN ?", task.UID, gids).Count(&count)
			if count > 0 {
				allowed = true
			}
		}
		if !allowed {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    CodeNotFound,
				"message": "task not found",
			})
			return
		}
	}

	// 查分析建议
	var suggestions []model.AnalysisSuggestion
	s.Db.Where("tid = ?", tid).Find(&suggestions)

	// 生成 COS 签名 URL（如果任务完成）
	var cosFiles []gin.H
	if task.Status == TaskStatusSuccess {
		// 尝试列出任务产出文件
		prefix := tid + "/"
		objects := s.listStorageObjects(c, prefix)
		for _, obj := range objects {
			url, err := s.Storage.PreSign(c, obj, 1*time.Hour)
			if err != nil {
				continue // 跳过签名失败的文件
			}
			cosFiles = append(cosFiles, gin.H{
				"key": obj,
				"url": url,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"task":        task,
			"suggestions": suggestions,
			"cos_files":   cosFiles,
		},
	})
}

// DeleteTask 软删除任务 — DELETE /api/v1/tasks/:tid
func (s *APIServer) DeleteTask(c *gin.Context) {
	tid := c.Param("tid")
	uid := c.GetString(middleware.CtxUID)

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
			"message": "task not found",
		})
		return
	}

	// 级联删分析建议
	s.Db.Where("tid = ?", tid).Delete(&model.AnalysisSuggestion{})

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "deleted",
	})
}

// RetryTask 用同参数重新建任务 — POST /api/v1/tasks/:tid/retry
func (s *APIServer) RetryTask(c *gin.Context) {
	tid := c.Param("tid")
	uid := c.GetString(middleware.CtxUID)

	var task model.HotmethodTask
	if err := s.Db.Where("tid = ? AND uid = ?", tid, uid).First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "task not found",
		})
		return
	}

	// 解析原任务参数
	var params map[string]interface{}
	if task.RequestParams != nil {
		params = mustUnmarshal(task.RequestParams)
	}

	// 提取参数
	var pid int32
	var duration uint64
	var hz uint32
	var callgraph string
	var subprocess bool
	var event string
	if v, ok := params["pid"].(float64); ok {
		pid = int32(v)
	}
	if v, ok := params["duration"].(float64); ok {
		duration = uint64(v)
	}
	if v, ok := params["hz"].(float64); ok {
		hz = uint32(v)
	}
	if v, ok := params["callgraph"].(string); ok {
		callgraph = v
	}
	if v, ok := params["subprocess"].(bool); ok {
		subprocess = v
	}
	if v, ok := params["event"].(string); ok {
		event = v
	}
	if hz == 0 {
		hz = 99
	}
	if callgraph == "" {
		callgraph = "dwarf"
	}

	// 直接创建新任务（不调 CreateTask，避免 body 解析问题）
	newTID := uuid.New().String()[:12]
	newTask := &model.HotmethodTask{
		TID:          newTID,
		Name:         task.Name,
		Type:         task.Type,
		ProfilerType: task.ProfilerType,
		TargetIP:     task.TargetIP,
		RequestParams: mustMarshal(gin.H{
			"pid": pid, "duration": duration, "hz": hz, "callgraph": callgraph,
			"subprocess": subprocess, "event": event,
		}),
		Status:     TaskStatusNew,
		UID:        uid,
		UserName:   c.GetString(middleware.CtxUserName),
		CreateTime: time.Now(),
	}
	if err := s.Db.Create(newTask).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	// gRPC 下发
	pbReq := &pb.CreateTaskRequest{
		TargetIp: task.TargetIP,
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:       newTID,
			TaskType:     uint32(task.Type),
			ProfilerType: uint32(task.ProfilerType),
			TimeoutSec:   uint32(duration + 30),
			SampleArgv: &pb.RecordArgv{
				Hz: hz, Duration: duration, Pid: pid, Callgraph: callgraph,
				Subprocess: subprocess, Event: event,
			},
		},
	}
	if s.GRPC == nil {
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "drop_server unavailable (gRPC not connected)",
		})
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server unavailable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := s.GRPC.CreateTask(ctx, pbReq); err != nil {
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "dispatch failed: " + err.Error(),
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "dispatch failed: " + err.Error(),
		})
		return
	}
	go s.waitTaskResult(newTID, duration+60)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{"tid": newTID},
	})
}

func (s *APIServer) waitTaskResult(tid string, timeoutSec uint64) {
	if s.GRPC == nil {
		return
	}
	if timeoutSec == 0 {
		timeoutSec = 120
	}

	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	s.Db.Model(&model.HotmethodTask{}).
		Where("tid = ?", tid).
		Updates(map[string]interface{}{
			"status":      TaskStatusRunning,
			"status_info": "dispatched to drop_server",
			"begin_time":   time.Now(),
		})
	s.recordStateChange(tid, TaskStatusNew, TaskStatusRunning, "dispatched to drop_server")

	for {
		if time.Now().After(deadline) {
			now := time.Now()
			s.Db.Model(&model.HotmethodTask{}).
				Where("tid = ?", tid).
				Updates(map[string]interface{}{
					"status":      TaskStatusFailed,
					"status_info": "timeout waiting for drop_server result",
					"end_time":    &now,
				})
			s.recordStateChange(tid, TaskStatusRunning, TaskStatusFailed, "timeout waiting for drop_server result")
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		resp, err := s.GRPC.FetchData(ctx, &pb.FetchDataRequest{TaskId: tid})
		cancel()
		if err == nil && resp.GetCode() == 0 {
			now := time.Now()
			s.Db.Model(&model.HotmethodTask{}).
				Where("tid = ?", tid).
				Updates(map[string]interface{}{
					"status":      TaskStatusSuccess,
					"status_info": "collector result ready: " + resp.GetCosKey(),
					"end_time":    &now,
				})
			s.recordStateChange(tid, TaskStatusRunning, TaskStatusSuccess, "collector result ready: "+resp.GetCosKey())
			return
		}
		if err == nil && resp.GetMessage() != "" && resp.GetMessage() != "Result not found" {
			now := time.Now()
			s.Db.Model(&model.HotmethodTask{}).
				Where("tid = ?", tid).
				Updates(map[string]interface{}{
					"status":      TaskStatusFailed,
					"status_info": resp.GetMessage(),
					"end_time":    &now,
				})
			s.recordStateChange(tid, TaskStatusRunning, TaskStatusFailed, resp.GetMessage())
			return
		}

		<-ticker.C
	}
}

// GetCOSFiles 列任务产出文件并签名 — GET /api/v1/cosfiles?tid=xxx
func (s *APIServer) GetCOSFiles(c *gin.Context) {
	tid := c.Query("tid")
	if tid == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": "tid is required",
		})
		return
	}

	// 权限校验：只有任务所有者或同组成员才能访问
	uid := c.GetString(middleware.CtxUID)
	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "task not found"})
		return
	}
	if task.UID != uid {
		var gids []uint
		s.Db.Model(&model.GroupMember{}).Where("uid = ?", uid).Pluck("gid", &gids)
		allowed := false
		if len(gids) > 0 {
			var count int64
			s.Db.Model(&model.GroupMember{}).Where("uid = ? AND gid IN ?", task.UID, gids).Count(&count)
			if count > 0 {
				allowed = true
			}
		}
		if !allowed {
			c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "task not found"})
			return
		}
	}

	prefix := tid + "/"
	objects := s.listStorageObjects(c, prefix)

	var files []gin.H
	for _, obj := range objects {
		url, err := s.Storage.PreSign(c, obj, 1*time.Hour)
		if err != nil {
			continue // 跳过签名失败的文件
		}
		files = append(files, gin.H{
			"key": obj,
			"url": url,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": files,
	})
}

// ---------- 工具函数 ----------

func (s *APIServer) listStorageObjects(c context.Context, prefix string) []string {
	keys, err := s.Storage.List(c, prefix)
	if err != nil {
		// fallback: 探测常见文件名
		known := []string{
			prefix + "perf.data",
			prefix + "flamegraph.svg",
			prefix + "top.json",
			prefix + "suggestions.md",
			prefix + "collapsed.txt",
		}
		for _, k := range known {
			exists, _ := s.Storage.IsExist(c, k)
			if exists {
				keys = append(keys, k)
			}
		}
	}
	return keys
}

// recordStateChange 记录状态迁移历史
func (s *APIServer) recordStateChange(tid string, fromState, toState int, reason string) {
	history := &model.TaskStateHistory{
		TID:       tid,
		FromState: fromState,
		ToState:   toState,
		Reason:    reason,
	}
	s.Db.Create(history)
}
