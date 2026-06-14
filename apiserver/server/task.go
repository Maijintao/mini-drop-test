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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := s.GRPC.CreateTask(ctx, pbReq); err != nil {
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
		query = s.Db.Where("uid = ? OR uid IN (SELECT uid FROM group_members WHERE gid IN ?)", uid, gids)
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
	if err := s.Db.Where("tid = ? AND (uid = ? OR uid IN (SELECT uid FROM group_members WHERE gid IN (SELECT gid FROM group_members WHERE uid = ?)))",
		tid, uid, uid).First(&task).Error; err != nil {
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
			url, _ := s.Storage.PreSign(c, obj, 1*time.Hour)
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

	// 构造新请求
	newReq := CreateTaskReq{
		Name:         task.Name,
		Type:         task.Type,
		ProfilerType: task.ProfilerType,
		TargetIP:     task.TargetIP,
	}
	if pid, ok := params["pid"].(float64); ok {
		newReq.PID = int32(pid)
	}
	if dur, ok := params["duration"].(float64); ok {
		newReq.Duration = uint64(dur)
	}
	if hz, ok := params["hz"].(float64); ok {
		newReq.Hz = uint32(hz)
	}
	if cg, ok := params["callgraph"].(string); ok {
		newReq.Callgraph = cg
	}

	// 复用 CreateTask 逻辑
	c.Set("create_task_req", newReq)
	s.CreateTask(c)
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

	prefix := tid + "/"
	objects := s.listStorageObjects(c, prefix)

	var files []gin.H
	for _, obj := range objects {
		url, _ := s.Storage.PreSign(c, obj, 1*time.Hour)
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
	// MinIO 列出 prefix 下的对象
	// 简单实现：通过 Get 检测常见文件名
	known := []string{
		prefix + "perf.data",
		prefix + "flamegraph.svg",
		prefix + "top.json",
		prefix + "suggestions.md",
		prefix + "collapsed.txt",
	}
	var result []string
	for _, k := range known {
		exists, _ := s.Storage.IsExist(c, k)
		if exists {
			result = append(result, k)
		}
	}
	return result
}
