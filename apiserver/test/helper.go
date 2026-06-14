package test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"mini-drop/apiserver/config"
	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
	"mini-drop/apiserver/server"
)

// MockStorage mock 对象存储
type MockStorage struct {
	objects map[string][]byte
}

func NewMockStorage() *MockStorage {
	return &MockStorage{objects: make(map[string][]byte)}
}

func (m *MockStorage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	data, ok := m.objects[key]
	if !ok {
		return nil, io.EOF
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *MockStorage) Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	data, _ := io.ReadAll(reader)
	m.objects[key] = data
	return nil
}

func (m *MockStorage) PreSign(ctx context.Context, key string, expiry time.Duration) (string, error) {
	return "http://mock-presign/" + key, nil
}

func (m *MockStorage) Delete(ctx context.Context, key string) error {
	delete(m.objects, key)
	return nil
}

func (m *MockStorage) IsExist(ctx context.Context, key string) (bool, error) {
	_, ok := m.objects[key]
	return ok, nil
}

// MockGRPCClient mock gRPC 客户端
type MockGRPCClient struct {
	CreateTaskFunc func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error)
	StatAgentFunc  func(ctx context.Context, req *pb.StatAgentRequest) (*pb.StatAgentResponse, error)
}

func (m *MockGRPCClient) CreateTask(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
	if m.CreateTaskFunc != nil {
		return m.CreateTaskFunc(ctx, req)
	}
	return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
}

func (m *MockGRPCClient) FetchData(ctx context.Context, req *pb.FetchDataRequest) (*pb.FetchDataResponse, error) {
	return &pb.FetchDataResponse{Code: 0}, nil
}

func (m *MockGRPCClient) StatAgent(ctx context.Context, req *pb.StatAgentRequest) (*pb.StatAgentResponse, error) {
	if m.StatAgentFunc != nil {
		return m.StatAgentFunc(ctx, req)
	}
	return &pb.StatAgentResponse{Code: 0, Message: "ok"}, nil
}

func (m *MockGRPCClient) Close() error { return nil }

// SetupTestDB 创建内存 SQLite 测试数据库
func SetupTestDB() *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to connect test db: " + err.Error())
	}
	model.AutoMigrate(db)
	return db
}

// SetupTestRouter 创建测试路由（带鉴权中间件）
func SetupTestRouter(srv *server.APIServer) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	{
		api.GET("/healthz", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		auth := api.Group("")
		auth.Use(middleware.CheckLogin())
		{
			auth.GET("/auth/check", srv.AuthCheck)
			auth.GET("/users", srv.GetUsers)
			auth.GET("/agents", srv.GetAgents)
			auth.GET("/agent/stat", srv.StatAgent)
			auth.POST("/tasks", srv.CreateTask)
			auth.GET("/tasks", srv.GetTasks)
			auth.GET("/tasks/:tid", srv.GetTaskDetail)
			auth.DELETE("/tasks/:tid", srv.DeleteTask)
			auth.POST("/tasks/:tid/retry", srv.RetryTask)
			auth.GET("/cosfiles", srv.GetCOSFiles)
			auth.GET("/tasks/:tid/suggestions", srv.GetSuggestions)
			auth.POST("/tasks/:tid/suggestions", srv.CreateSuggestion)
			auth.PUT("/tasks/:tid/analysis_status", srv.UpdateAnalysisStatus)
			auth.POST("/tasks/:tid/analyze", srv.TriggerAnalysis)
			auth.GET("/tasks/:tid/flame", srv.GetFlameData)
			auth.POST("/flame/diff", srv.FlameDiff)
			auth.POST("/group", srv.CreateGroup)
			auth.GET("/groups", srv.GetGroups)
			auth.DELETE("/group/:gid", srv.DeleteGroup)
			auth.POST("/group/:gid/members", srv.AddMember)
			auth.DELETE("/group/:gid/members/:uid", srv.RemoveMember)
			auth.GET("/group/:gid/members", srv.GetGroupMembers)
			auth.POST("/schedule/task", srv.CreateScheduleTask)
			auth.GET("/schedule/tasks", srv.GetScheduleTasks)
			auth.DELETE("/schedule/task/:tid", srv.DeleteScheduleTask)
		}
	}
	return r
}

// SetupTestRouterNoAuth 创建无鉴权的测试路由
func SetupTestRouterNoAuth(srv *server.APIServer) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	api := r.Group("/api/v1")
	{
		api.GET("/auth/check", srv.AuthCheck)
		api.GET("/tasks", srv.GetTasks)
	}
	return r
}

// CreateTestAPIServer 创建测试用 APIServer
func CreateTestAPIServer(db *gorm.DB) (*server.APIServer, *MockGRPCClient, *MockStorage) {
	mockGRPC := &MockGRPCClient{}
	mockStore := NewMockStorage()
	srv := server.New(db, mockGRPC, mockStore, config.AnalysisConfig{})
	return srv, mockGRPC, mockStore
}

// SeedTestData 插入测试数据
func SeedTestData(db *gorm.DB) {
	// 用户
	db.Create(&model.UserInfo{UID: "test-user-1", Name: "TestUser1"})
	db.Create(&model.UserInfo{UID: "test-user-2", Name: "TestUser2"})

	// Agent
	db.Create(&model.AgentInfo{
		Hostname: "test-host", IPAddr: "10.0.0.1", Online: true,
		UID: "test-user-1", Version: "1.0.0",
		LastHeartbeat: time.Now(),
	})

	// 任务
	db.Create(&model.HotmethodTask{
		TID: "test-tid-001", Name: "test-task", Type: 0, ProfilerType: 0,
		TargetIP: "10.0.0.1", Status: server.TaskStatusSuccess,
		UID: "test-user-1", UserName: "TestUser1",
		CreateTime: time.Now(),
	})

	// 组
	db.Create(&model.Group{GID: 1, Name: "test-group", OwnerID: "test-user-1"})
	db.Create(&model.GroupMember{GID: 1, UID: "test-user-1"})
}

// ---------- HTTP 测试工具 ----------

func DoRequest(r *gin.Engine, method, path string, body interface{}, headers map[string]string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func DoAuthRequest(r *gin.Engine, method, path string, body interface{}) *httptest.ResponseRecorder {
	return DoRequest(r, method, path, body, map[string]string{
		"Drop_user_uid":  "test-user-1",
		"Drop_user_name": "TestUser1",
	})
}

func ParseJSON(w *httptest.ResponseRecorder) map[string]interface{} {
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	return resp
}
