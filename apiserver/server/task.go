package server

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
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

func isValidTaskProfilerCombination(taskType int, profilerType int) bool {
	valid := map[int]int{
		0:  0, // CPU / perf
		1:  1, // Java / async-profiler
		4:  4, // Python / memray
		6:  3, // eBPF / bpftrace
		10: 2, // pprof CPU
		11: 2, // pprof Heap
		12: 5, // Java Heap
	}
	want, ok := valid[taskType]
	return ok && profilerType == want
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
	if !s.canAccessAgentIP(uid, req.TargetIP) {
		c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "agent not found"})
		return
	}
	if !isValidTaskProfilerCombination(req.Type, req.ProfilerType) {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": fmt.Sprintf("invalid task_type/profiler_type combination: type=%d profiler_type=%d", req.Type, req.ProfilerType),
		})
		return
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
	s.recordStateChange(tid, -1, TaskStatusNew, "task created and pending dispatch", ChangeTypeTask)

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
		s.recordStateChange(tid, TaskStatusNew, TaskStatusFailed, "drop_server unavailable (gRPC not connected)", ChangeTypeTask)
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
		s.recordStateChange(tid, TaskStatusNew, TaskStatusFailed, "dispatch failed: "+err.Error(), ChangeTypeTask)
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
		s.recordStateChange(tid, TaskStatusNew, TaskStatusFailed, "drop_server rejected: "+resp.GetMessage(), ChangeTypeTask)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server rejected: " + resp.GetMessage(),
		})
		return
	}

	// 下发成功后仍保持 PENDING，等待 drop_server/Agent 上报真实 RUNNING/UPLOADING 状态。
	s.updateTaskStatusInfo(tid, "queued in drop_server")

	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		s.waitTaskResult(context.Background(), tid, req.Duration+60)
	}()

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

	var stateHistory []model.TaskStateHistory
	s.Db.Where("tid = ? AND change_type = ?", tid, ChangeTypeTask).
		Order("created_at ASC").
		Find(&stateHistory)

	// 生成 COS 签名 URL（如果任务完成）
	cosFiles := make([]gin.H, 0)
	if task.Status == TaskStatusSuccess {
		// 列出任务产出文件（agent 前缀 + analysis 前缀）
		var objects []string
		for _, prefix := range []string{"profiler/" + tid + "/", tid + "/"} {
			objects = append(objects, s.listStorageObjects(c, prefix)...)
		}
		if key := extractCollectorResultKey(task.StatusInfo); key != "" {
			objects = appendUnique(objects, key)
		}
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
			"task":          task,
			"suggestions":   suggestions,
			"cos_files":     cosFiles,
			"state_history": stateHistory,
		},
	})
}

// GetTaskStateHistory 查询任务状态迁移历史 — GET /api/v1/tasks/:tid/state_history
func (s *APIServer) GetTaskStateHistory(c *gin.Context) {
	tid := c.Param("tid")
	if _, ok := s.checkTaskAccess(c, tid); !ok {
		return
	}

	var history []model.TaskStateHistory
	if err := s.Db.Where("tid = ?", tid).Order("created_at ASC").Find(&history).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": CodeInternal, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": history,
	})
}

// DeleteTask 软删除任务 — DELETE /api/v1/tasks/:tid
func (s *APIServer) DeleteTask(c *gin.Context) {
	tid := c.Param("tid")

	if _, ok := s.checkTaskAccess(c, tid); !ok {
		return
	}

	// 事务：软删 task + 硬删 suggestion/tag；状态迁移历史保留用于审计。
	var rowsAffected int64
	err := s.Db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("tid = ?", tid).Delete(&model.HotmethodTask{})
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		if rowsAffected == 0 {
			return nil // 由外层处理 not found
		}
		if err := tx.Where("tid = ?", tid).Delete(&model.AnalysisSuggestion{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tid = ?", tid).Delete(&model.Tag{}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "task not found",
		})
		return
	}

	// 事务提交后再删 MinIO 文件（非事务性存储）
	if s.Storage != nil {
		for _, prefix := range []string{"profiler/" + tid + "/", tid + "/"} {
			keys, err := s.Storage.List(c, prefix)
			if err == nil {
				for _, key := range keys {
					s.Storage.Delete(c, key)
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "deleted",
	})
}

// RetryTask 用同参数重新建任务 — POST /api/v1/tasks/:tid/retry
func (s *APIServer) RetryTask(c *gin.Context) {
	tid := c.Param("tid")
	uid := c.GetString(middleware.CtxUID)

	task, ok := s.checkTaskAccess(c, tid)
	if !ok {
		return
	}

	// 解析原任务参数
	var params map[string]interface{}
	if task.RequestParams != nil {
		var err error
		params, err = unmarshalParams(task.RequestParams)
		if err != nil {
			log.Printf("WARN: unmarshal task params failed: %v", err)
		}
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
	if !isValidTaskProfilerCombination(task.Type, task.ProfilerType) {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": fmt.Sprintf("invalid task_type/profiler_type combination: type=%d profiler_type=%d", task.Type, task.ProfilerType),
		})
		return
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
	s.recordStateChange(newTID, -1, TaskStatusNew, "retry task created and pending dispatch", ChangeTypeTask)

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
		s.recordStateChange(newTID, TaskStatusNew, TaskStatusFailed, "drop_server unavailable (gRPC not connected)", ChangeTypeTask)
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
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "dispatch failed: " + err.Error(),
		})
		s.recordStateChange(newTID, TaskStatusNew, TaskStatusFailed, "dispatch failed: "+err.Error(), ChangeTypeTask)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "dispatch failed: " + err.Error(),
		})
		return
	}
	if resp.GetCode() != 0 {
		s.Db.Model(newTask).Updates(map[string]interface{}{
			"status":      TaskStatusFailed,
			"status_info": "drop_server rejected: " + resp.GetMessage(),
		})
		s.recordStateChange(newTID, TaskStatusNew, TaskStatusFailed, "drop_server rejected: "+resp.GetMessage(), ChangeTypeTask)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server rejected: " + resp.GetMessage(),
		})
		return
	}

	// 下发成功后仍保持 PENDING，等待 drop_server/Agent 上报真实 RUNNING/UPLOADING 状态。
	s.updateTaskStatusInfo(newTID, "queued in drop_server")

	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		s.waitTaskResult(context.Background(), newTID, duration+60)
	}()

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{"tid": newTID},
	})
}

func (s *APIServer) waitTaskResult(ctx context.Context, tid string, timeoutSec uint64) {
	if s.GRPC == nil {
		return
	}
	if timeoutSec == 0 {
		timeoutSec = 120
	}

	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			now := time.Now()
			s.transitionTaskStatus(tid, TaskStatusFailed, "cancelled: "+ctx.Err().Error(), map[string]interface{}{"end_time": &now})
			return
		default:
		}

		if time.Now().After(deadline) {
			now := time.Now()
			s.transitionTaskStatus(tid, TaskStatusFailed, "timeout waiting for drop_server result", map[string]interface{}{"end_time": &now})
			return
		}

		fetchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		resp, err := s.GRPC.FetchData(fetchCtx, &pb.FetchDataRequest{TaskId: tid})
		cancel()
		isStatusMessage := false
		if err == nil {
			if status, reason, ok := parseDropStatusMessage(resp.GetMessage()); ok {
				isStatusMessage = true
				s.syncDropTaskStatus(tid, status, reason)
				if status == TaskStatusSuccess || status == TaskStatusFailed {
					return
				}
			}
		}
		if err == nil && resp.GetCode() == 0 {
			now := time.Now()
			cosKey, storeErr := s.persistFetchedResultFile(context.Background(), tid, resp)
			if storeErr != nil {
				s.ensureTaskReached(tid, TaskStatusRunning, "collector ran before result was fetched")
				s.transitionTaskStatus(tid, TaskStatusFailed, storeErr.Error(), map[string]interface{}{"end_time": &now})
				return
			}
			s.ensureTaskReached(tid, TaskStatusRunning, "collector ran before result was fetched")
			s.ensureTaskReached(tid, TaskStatusUploading, "collector uploaded result")
			reason := "collector result ready"
			if cosKey != "" {
				reason += ": " + cosKey
			}
			s.transitionTaskStatus(tid, TaskStatusSuccess, reason, map[string]interface{}{"end_time": &now})

			// 自动触发分析
			var task model.HotmethodTask
			if err := s.Db.Where("tid = ?", tid).First(&task).Error; err == nil {
				s.WG.Add(1)
				go func() {
					defer s.WG.Done()
					s.runAnalysis(tid, task.Type)
				}()
			}
			return
		}
		if err == nil && !isStatusMessage && resp.GetMessage() != "" && resp.GetMessage() != "Result not found" {
			now := time.Now()
			s.ensureTaskReached(tid, TaskStatusRunning, "collector started before failure")
			s.transitionTaskStatus(tid, TaskStatusFailed, resp.GetMessage(), map[string]interface{}{"end_time": &now})
			return
		}

		<-ticker.C
	}
}

func (s *APIServer) persistFetchedResultFile(ctx context.Context, tid string, resp *pb.FetchDataResponse) (string, error) {
	if resp.GetCosKey() != "" {
		return resp.GetCosKey(), nil
	}

	file := resp.GetFile()
	if file == nil || len(file.GetContent()) == 0 {
		return "", fmt.Errorf("collector result missing artifact: no cos_key or embedded file")
	}
	if s.Storage == nil {
		return "", fmt.Errorf("collector returned embedded file but storage is not configured")
	}

	name := file.GetName()
	if name == "" {
		name = tid + ".data"
	}
	key := "profiler/" + tid + "/" + name
	content := file.GetContent()
	if err := s.Storage.Put(ctx, key, bytes.NewReader(content), int64(len(content)), "application/octet-stream"); err != nil {
		return "", fmt.Errorf("store embedded collector result failed: %w", err)
	}
	return key, nil
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

	// 列出任务产出文件（agent 前缀 + analysis 前缀）
	var objects []string
	for _, prefix := range []string{"profiler/" + tid + "/", tid + "/"} {
		objects = append(objects, s.listStorageObjects(c, prefix)...)
	}
	if key := extractCollectorResultKey(task.StatusInfo); key != "" {
		objects = appendUnique(objects, key)
	}

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
	if s.Storage == nil {
		return nil
	}
	keys, err := s.Storage.List(c, prefix)
	if err != nil {
		// fallback: 探测常见文件名
		known := []string{
			prefix + "perf.data",
			prefix + "flamegraph.svg",
			prefix + "top.json",
			prefix + "suggestions.md",
			prefix + "attribution_report.md",
			prefix + "attribution_evidence.json",
			prefix + "attribution_tool_calls.json",
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

func extractCollectorResultKey(statusInfo string) string {
	const marker = "collector result ready: "
	idx := strings.LastIndex(statusInfo, marker)
	if idx < 0 {
		return ""
	}
	key := strings.TrimSpace(statusInfo[idx+len(marker):])
	if key == "" || strings.ContainsAny(key, "\r\n") {
		return ""
	}
	return key
}

func appendUnique(items []string, item string) []string {
	for _, existing := range items {
		if existing == item {
			return items
		}
	}
	return append(items, item)
}

// recordStateChange 记录状态迁移历史
func (s *APIServer) recordStateChange(tid string, fromState, toState int, reason string, changeType int) {
	history := &model.TaskStateHistory{
		TID:        tid,
		FromState:  fromState,
		ToState:    toState,
		Reason:     reason,
		ChangeType: changeType,
	}
	if err := s.Db.Create(history).Error; err != nil {
		log.Printf("ERROR: record state change failed tid=%s from=%d to=%d type=%d: %v", tid, fromState, toState, changeType, err)
	}
}

func (s *APIServer) updateTaskStatusInfo(tid string, reason string) {
	s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Update("status_info", reason)
}

func normalizeTaskStatus(status int) int {
	switch status {
	case TaskStatusDispatched:
		return TaskStatusNew
	case TaskStatusTimeout:
		return TaskStatusFailed
	default:
		return status
	}
}

func parseDropStatusMessage(message string) (int, string, bool) {
	if !strings.HasPrefix(message, "STATUS:") {
		return 0, "", false
	}
	parts := strings.SplitN(message, ":", 3)
	if len(parts) != 3 {
		return 0, "", false
	}
	status, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, "", false
	}
	return normalizeTaskStatus(status), parts[2], true
}

func (s *APIServer) transitionTaskStatus(tid string, toState int, reason string, updates map[string]interface{}) {
	toState = normalizeTaskStatus(toState)
	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		return
	}
	if updates == nil {
		updates = map[string]interface{}{}
	}
	updates["status"] = toState
	updates["status_info"] = reason
	if toState == TaskStatusRunning && task.BeginTime == nil {
		now := time.Now()
		updates["begin_time"] = &now
	}
	fromState := normalizeTaskStatus(task.Status)
	if err := s.Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&task).Updates(updates).Error; err != nil {
			return err
		}
		if fromState != toState {
			history := &model.TaskStateHistory{
				TID:        tid,
				FromState:  fromState,
				ToState:    toState,
				Reason:     reason,
				ChangeType: ChangeTypeTask,
			}
			if err := tx.Create(history).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		log.Printf("ERROR: transition task status failed tid=%s from=%d to=%d: %v", tid, task.Status, toState, err)
	}
}

func (s *APIServer) syncDropTaskStatus(tid string, status int, reason string) {
	status = normalizeTaskStatus(status)
	if status == TaskStatusSuccess {
		now := time.Now()
		s.transitionTaskStatus(tid, status, reason, map[string]interface{}{"end_time": &now})
		return
	}
	if status == TaskStatusFailed {
		now := time.Now()
		s.transitionTaskStatus(tid, status, reason, map[string]interface{}{"end_time": &now})
		return
	}
	s.transitionTaskStatus(tid, status, reason, nil)
}

func (s *APIServer) ensureTaskReached(tid string, state int, reason string) {
	state = normalizeTaskStatus(state)
	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		return
	}
	if normalizeTaskStatus(task.Status) < state {
		s.transitionTaskStatus(tid, state, reason, nil)
	}
}

// checkTaskAccess 权限校验：自己的任务 或 组内成员的任务。
// 返回 (task, true) 表示允许访问，(nil, false) 表示已拒绝（已写入响应）。
func (s *APIServer) checkTaskAccess(c *gin.Context, tid string) (*model.HotmethodTask, bool) {
	uid := c.GetString(middleware.CtxUID)

	var task model.HotmethodTask
	if err := s.Db.Where("tid = ?", tid).First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "task not found",
		})
		return nil, false
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
			c.JSON(http.StatusNotFound, gin.H{
				"code":    CodeNotFound,
				"message": "task not found",
			})
			return nil, false
		}
	}

	return &task, true
}

// ---------- 组合任务 CRUD ----------

type CreateMultiTaskReq struct {
	TID         string   `json:"tid" binding:"required"`
	SubTIDs     []string `json:"sub_tids" binding:"required,min=2"`
	Type        int      `json:"type"`
	TriggerType int      `json:"trigger_type"`
}

// CreateMultiTask 创建组合任务 — POST /api/v1/multi_tasks
func (s *APIServer) CreateMultiTask(c *gin.Context) {
	var req CreateMultiTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	subTIDsJSON, _ := datatypes.NewJSONType(req.SubTIDs).MarshalJSON()
	mt := &model.MultiTask{
		TID:         req.TID,
		SubTIDs:     subTIDsJSON,
		Type:        req.Type,
		TriggerType: req.TriggerType,
	}
	if err := s.Db.Create(mt).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": mt,
	})
}

// GetMultiTask 获取组合任务 — GET /api/v1/multi_tasks/:tid
func (s *APIServer) GetMultiTask(c *gin.Context) {
	tid := c.Param("tid")
	var mt model.MultiTask
	if err := s.Db.Where("tid = ?", tid).First(&mt).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "multi task not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": mt,
	})
}

// ListMultiTasks 列出组合任务 — GET /api/v1/multi_tasks
func (s *APIServer) ListMultiTasks(c *gin.Context) {
	var tasks []model.MultiTask
	s.Db.Order("created_at DESC").Find(&tasks)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": tasks,
	})
}

// DeleteMultiTask 删除组合任务 — DELETE /api/v1/multi_tasks/:tid
func (s *APIServer) DeleteMultiTask(c *gin.Context) {
	tid := c.Param("tid")
	result := s.Db.Where("tid = ?", tid).Delete(&model.MultiTask{})
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
			"message": "multi task not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": "deleted",
	})
}

// ---------- Continuous Profiling ----------

type CreateContinuousReq struct {
	Name         string `json:"name"`
	TargetIP     string `json:"target_ip" binding:"required"`
	PID          int32  `json:"pid" binding:"required"`
	Hz           uint32 `json:"hz"`
	WindowSec    uint32 `json:"window_sec"`
	ProfilerType int    `json:"profiler_type"`
	Callgraph    string `json:"callgraph"`
	Event        string `json:"event"`
}

// CreateContinuousTask 创建常驻采集任务 — POST /api/v1/tasks/continuous
func (s *APIServer) CreateContinuousTask(c *gin.Context) {
	uid := c.GetString(middleware.CtxUID)
	userName := c.GetString(middleware.CtxUserName)
	var req CreateContinuousReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	if req.Hz == 0 {
		req.Hz = 10 // 低频默认 10Hz
	}
	if req.WindowSec == 0 {
		req.WindowSec = 300 // 默认 5 分钟
	}
	if req.Callgraph == "" {
		req.Callgraph = "dwarf"
	}
	if req.Event == "" {
		req.Event = "cpu-cycles"
	}
	if req.Name == "" {
		req.Name = fmt.Sprintf("continuous-pid%d", req.PID)
	}
	if !s.canAccessAgentIP(uid, req.TargetIP) {
		c.JSON(http.StatusNotFound, gin.H{"code": CodeNotFound, "message": "agent not found"})
		return
	}

	if s.GRPC == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server unavailable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.GRPC.StartContinuous(ctx, &pb.StartContinuousRequest{
		TargetIp:     req.TargetIP,
		Pid:          req.PID,
		Hz:           req.Hz,
		WindowSec:    req.WindowSec,
		ProfilerType: uint32(req.ProfilerType),
		Callgraph:    req.Callgraph,
		Event:        req.Event,
		Name:         req.Name,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": err.Error(),
		})
		return
	}
	if resp.Code != 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": resp.Message,
		})
		return
	}

	tid := resp.TaskId

	// 创建父任务记录
	now := time.Now()
	task := model.HotmethodTask{
		TID:          tid,
		Name:         req.Name,
		Type:         2, // continuous
		ProfilerType: req.ProfilerType,
		TargetIP:     req.TargetIP,
		RequestParams: mustMarshal(map[string]interface{}{
			"pid":        req.PID,
			"hz":         req.Hz,
			"window_sec": req.WindowSec,
			"callgraph":  req.Callgraph,
			"event":      req.Event,
			"continuous": true,
		}),
		Status:     TaskStatusRunning,
		StatusInfo: "continuous profiling running",
		UID:        uid,
		UserName:   userName,
		CreateTime: now,
		BeginTime:  &now,
	}
	if err := s.Db.Create(&task).Error; err != nil {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cleanupCancel()
		_, _ = s.GRPC.StopContinuous(cleanupCtx, &pb.StopContinuousRequest{TaskId: tid})
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "db error: " + err.Error(),
		})
		return
	}
	s.recordStateChange(tid, -1, TaskStatusRunning, "continuous profiling started", ChangeTypeTask)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"tid": tid,
		},
	})
}

// GetContinuousWindows 获取连续任务窗口列表 — GET /api/v1/tasks/:tid/windows
// 同时从 drop_server 同步窗口状态，发现新完成的窗口时自动触发分析
func (s *APIServer) GetContinuousWindows(c *gin.Context) {
	tid := c.Param("tid")
	parentTask, ok := s.checkTaskAccess(c, tid)
	if !ok {
		return
	}

	// 从 drop_server 同步窗口数据
	if s.GRPC != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		resp, err := s.GRPC.ListWindows(ctx, &pb.ListWindowsRequest{TaskId: tid})
		if err == nil && resp != nil && resp.GetCode() == 0 {
			for _, w := range resp.GetWindows() {
				var existing model.ContinuousWindow
				err := s.Db.Where("window_tid = ?", w.GetWindowTid()).First(&existing).Error
				previousStatus := -1
				windowCreated := false
				if err == gorm.ErrRecordNotFound {
					// 新窗口，写入 DB
					startTime := time.Unix(w.GetStartTime(), 0)
					endTime := time.Unix(w.GetEndTime(), 0)
					record := model.ContinuousWindow{
						ParentTID: tid,
						WindowTID: w.GetWindowTid(),
						Seq:       int(w.GetSeq()),
						StartTime: startTime,
						EndTime:   endTime,
						Status:    int(w.GetStatus()),
						COSKey:    w.GetCosKey(),
					}
					s.Db.Create(&record)
					windowCreated = true
				} else if err == nil {
					// 更新已有窗口状态
					previousStatus = existing.Status
					updates := map[string]interface{}{
						"status": int(w.GetStatus()),
					}
					if w.GetCosKey() != "" {
						updates["cos_key"] = w.GetCosKey()
					}
					if w.GetEndTime() > 0 {
						updates["end_time"] = time.Unix(w.GetEndTime(), 0)
					}
					s.Db.Model(&existing).Updates(updates)
				} else {
					continue
				}

				childTask, childCreated := s.ensureContinuousWindowTask(*parentTask, w)
				if childTask != nil && w.GetStatus() == 1 && w.GetCosKey() != "" &&
					(childCreated || windowCreated || previousStatus != 1) {
					s.triggerWindowAnalysisIfReady(childTask)
				}
			}
		}
	}

	// 时间范围过滤
	var windows []model.ContinuousWindow
	query := s.Db.Where("parent_tid = ?", tid)
	if from := c.Query("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			query = query.Where("start_time >= ?", t)
		} else if ts, err := strconv.ParseInt(from, 10, 64); err == nil {
			query = query.Where("start_time >= ?", time.Unix(ts, 0))
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			query = query.Where("end_time <= ?", t)
		} else if ts, err := strconv.ParseInt(to, 10, 64); err == nil {
			query = query.Where("end_time <= ?", time.Unix(ts, 0))
		}
	}
	query.Order("seq ASC").Find(&windows)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": windows,
	})
}

func (s *APIServer) ensureContinuousWindowTask(parent model.HotmethodTask, w *pb.ContinuousWindowInfo) (*model.HotmethodTask, bool) {
	if w == nil || w.GetWindowTid() == "" {
		return nil, false
	}
	if w.GetStatus() != 1 && w.GetStatus() != 2 {
		return nil, false
	}

	taskStatus := TaskStatusSuccess
	statusInfo := "continuous window completed"
	if w.GetStatus() == 2 {
		taskStatus = TaskStatusFailed
		statusInfo = "continuous window failed"
	}

	startTime := time.Unix(w.GetStartTime(), 0)
	endTime := time.Unix(w.GetEndTime(), 0)
	params, _ := unmarshalParams(parent.RequestParams)
	if params == nil {
		params = map[string]interface{}{}
	}
	params["continuous_window"] = true
	params["parent_tid"] = parent.TID
	params["window_tid"] = w.GetWindowTid()
	params["window_seq"] = w.GetSeq()
	if w.GetCosKey() != "" {
		params["cos_key"] = w.GetCosKey()
	}

	var existing model.HotmethodTask
	err := s.Db.Where("tid = ?", w.GetWindowTid()).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		name := fmt.Sprintf("%s #%d", parent.Name, w.GetSeq()+1)
		if parent.Name == "" {
			name = w.GetWindowTid()
		}
		child := model.HotmethodTask{
			TID:            w.GetWindowTid(),
			Name:           name,
			Type:           0,
			ProfilerType:   parent.ProfilerType,
			TargetIP:       parent.TargetIP,
			RequestParams:  mustMarshal(params),
			Status:         taskStatus,
			AnalysisStatus: AnalysisStatusPending,
			StatusInfo:     statusInfo,
			UID:            parent.UID,
			UserName:       parent.UserName,
			CreateTime:     startTime,
			BeginTime:      &startTime,
			EndTime:        &endTime,
			MasterTaskTID:  parent.TID,
		}
		if dbErr := s.Db.Create(&child).Error; dbErr != nil {
			return nil, false
		}
		s.recordStateChange(child.TID, -1, taskStatus, statusInfo, ChangeTypeTask)
		return &child, true
	}
	if err != nil {
		return nil, false
	}

	updates := map[string]interface{}{
		"profiler_type":   parent.ProfilerType,
		"target_ip":       parent.TargetIP,
		"request_params":  mustMarshal(params),
		"status":          taskStatus,
		"status_info":     statusInfo,
		"master_task_tid": parent.TID,
	}
	if existing.UID == "" {
		updates["uid"] = parent.UID
	}
	if existing.UserName == "" {
		updates["user_name"] = parent.UserName
	}
	if existing.BeginTime == nil {
		updates["begin_time"] = &startTime
	}
	if w.GetEndTime() > 0 || existing.EndTime == nil {
		updates["end_time"] = &endTime
	}
	if err := s.Db.Model(&existing).Updates(updates).Error; err != nil {
		return nil, false
	}
	if existing.Status != taskStatus {
		s.recordStateChange(existing.TID, existing.Status, taskStatus, statusInfo, ChangeTypeTask)
	}
	existing.ProfilerType = parent.ProfilerType
	existing.TargetIP = parent.TargetIP
	existing.RequestParams = mustMarshal(params)
	existing.Status = taskStatus
	existing.StatusInfo = statusInfo
	existing.MasterTaskTID = parent.TID
	if existing.UID == "" {
		existing.UID = parent.UID
	}
	if existing.UserName == "" {
		existing.UserName = parent.UserName
	}
	return &existing, false
}

func (s *APIServer) triggerWindowAnalysisIfReady(task *model.HotmethodTask) {
	if task.AnalysisStatus != AnalysisStatusPending {
		return
	}
	if s.AnalysisCmd.Command == "" || s.AnalysisCmd.ScriptPath == "" {
		return
	}
	s.WG.Add(1)
	go func(windowTid string) {
		defer s.WG.Done()
		s.runAnalysis(windowTid, 0)
	}(task.TID)
}

// StopContinuousTask 停止常驻采集 — POST /api/v1/tasks/:tid/stop
func (s *APIServer) StopContinuousTask(c *gin.Context) {
	tid := c.Param("tid")
	task, ok := s.checkTaskAccess(c, tid)
	if !ok {
		return
	}

	if s.GRPC == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    CodeGRPCError,
			"message": "drop_server unavailable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.GRPC.StopContinuous(ctx, &pb.StopContinuousRequest{TaskId: tid})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": err.Error(),
		})
		return
	}
	if resp.GetCode() != 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeGRPCError,
			"message": resp.GetMessage(),
		})
		return
	}

	// 更新任务状态为 DONE
	now := time.Now()
	s.Db.Model(&model.HotmethodTask{}).Where("tid = ?", tid).Updates(map[string]interface{}{
		"status":      TaskStatusSuccess,
		"end_time":    &now,
		"status_info": "用户停止",
	})
	if task.Status != TaskStatusSuccess {
		s.recordStateChange(tid, task.Status, TaskStatusSuccess, "用户停止", ChangeTypeTask)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    CodeSuccess,
		"message": resp.Message,
	})
}
