package test

import (
	"context"
	"net/http"
	"testing"

	pb "mini-drop/apiserver/proto"
)

// 测试创建任务正常路径
func TestCreateTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	body := map[string]interface{}{
		"name":          "test-cpu",
		"target_ip":     "10.0.0.1",
		"pid":           1234,
		"duration":      10,
		"hz":            99,
		"profiler_type": 0,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	if resp["code"].(float64) != 0 {
		t.Fatalf("expected code=0, got %v", resp["code"])
	}
	data := resp["data"].(map[string]interface{})
	if data["tid"] == nil {
		t.Fatal("expected tid in response")
	}
}

// 测试创建任务参数缺失
func TestCreateTask_BadRequest(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 缺少 required 字段
	body := map[string]interface{}{
		"name": "test-cpu",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateTask_InvalidProfilerCombination(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"name":          "bad-combo",
		"target_ip":     "10.0.0.1",
		"pid":           1234,
		"duration":      10,
		"type":          6,
		"profiler_type": 0,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateTask_EBPFCombinationOK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		if req.GetTaskDesc().GetTaskType() != 6 || req.GetTaskDesc().GetProfilerType() != 3 {
			t.Fatalf("unexpected task/profiler: %d/%d", req.GetTaskDesc().GetTaskType(), req.GetTaskDesc().GetProfilerType())
		}
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	body := map[string]interface{}{
		"name":          "ebpf",
		"target_ip":     "10.0.0.1",
		"pid":           1234,
		"duration":      10,
		"type":          6,
		"profiler_type": 3,
		"event":         "io",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// 测试创建任务 gRPC 下发失败回滚状态
func TestCreateTask_GRPCFail(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		return nil, context.DeadlineExceeded
	}

	body := map[string]interface{}{
		"name":      "test-cpu",
		"target_ip": "10.0.0.1",
		"pid":       1234,
		"duration":  10,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

// 测试获取任务列表
func TestGetTasks_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["total"].(float64) < 1 {
		t.Fatal("expected at least 1 task")
	}
}

// 测试获取任务列表带筛选
func TestGetTasks_WithFilter(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks?status=2&keyword=test", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

// 测试获取任务详情
func TestGetTaskDetail_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 放一个 mock 文件
	mockStore.objects["test-tid-001/flamegraph.svg"] = []byte("<svg>mock</svg>")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	task := data["task"].(map[string]interface{})
	if task["tid"] != "test-tid-001" {
		t.Fatalf("expected tid=test-tid-001, got %v", task["tid"])
	}
}

// 测试获取不存在的任务详情
func TestGetTaskDetail_NotFound(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/not-exist", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// 测试软删除任务
func TestDeleteTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/tasks/test-tid-001", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// 验证已删除
	w2 := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001", nil)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", w2.Code)
	}
}

// 测试删除不存在的任务
func TestDeleteTask_NotFound(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/tasks/not-exist", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// 测试重试任务
func TestRetryTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	w := DoAuthRequest(r, "POST", "/api/v1/tasks/test-tid-001/retry", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// 测试 COS 文件列表
func TestGetCOSFiles_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["test-tid-001/perf.data"] = []byte("mock-perf-data")

	w := DoAuthRequest(r, "GET", "/api/v1/cosfiles?tid=test-tid-001", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

// 测试 COS 文件列表缺少 tid
func TestGetCOSFiles_MissingTID(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/cosfiles", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
