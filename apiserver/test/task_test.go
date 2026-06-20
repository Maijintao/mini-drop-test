package test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
	"mini-drop/apiserver/server"
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

func TestGetTasks_HidesContinuousWindowsByDefault(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	db.Create(&model.HotmethodTask{
		TID: "test-tid-001_w1", Name: "window", Type: 0, ProfilerType: 0,
		TargetIP: "10.0.0.1", Status: server.TaskStatusFailed,
		UID: "test-user-1", UserName: "TestUser1",
		MasterTaskTID: "test-tid-001",
		CreateTime:    time.Now(),
	})
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["total"].(float64) != 1 {
		t.Fatalf("expected only parent task in default list, got total=%v", data["total"])
	}

	w = DoAuthRequest(r, "GET", "/api/v1/tasks?include_windows=true", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp = ParseJSON(w)
	data = resp["data"].(map[string]interface{})
	if data["total"].(float64) != 2 {
		t.Fatalf("expected parent + window when include_windows=true, got total=%v", data["total"])
	}
}

func TestNaturalLanguageTaskPlanNeedsPID(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"text": "帮我看一下 CPU 飙高，采 30 秒火焰图",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks/nl", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	plan := data["plan"].(map[string]interface{})
	if plan["type"].(float64) != 0 || plan["profiler_type"].(float64) != 0 {
		t.Fatalf("expected CPU/perf plan, got %+v", plan)
	}
	missing := plan["missing_fields"].([]interface{})
	if len(missing) == 0 || missing[0].(string) != "pid" {
		t.Fatalf("expected missing pid, got %+v", missing)
	}
}

func TestNaturalLanguageTaskExecuteEBPF(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	var got *pb.CreateTaskRequest
	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		got = req
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	body := map[string]interface{}{
		"text":    "pid 1234 出现 IO 延迟，用 eBPF sched 采 5 秒",
		"execute": true,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks/nl", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got == nil || got.TaskDesc == nil {
		t.Fatal("expected task dispatched")
	}
	if got.TaskDesc.TaskType != 6 || got.TaskDesc.ProfilerType != 3 {
		t.Fatalf("expected eBPF/bpftrace, got type=%d profiler=%d", got.TaskDesc.TaskType, got.TaskDesc.ProfilerType)
	}
	if got.TaskDesc.SampleArgv.GetEvent() != "sched" {
		t.Fatalf("expected sched event, got %q", got.TaskDesc.SampleArgv.GetEvent())
	}
}

func TestNaturalLanguageTaskExecuteContinuous(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	var got *pb.StartContinuousRequest
	mockGRPC.StartContinuousFunc = func(ctx context.Context, req *pb.StartContinuousRequest) (*pb.StartContinuousResponse, error) {
		got = req
		return &pb.StartContinuousResponse{Code: 0, TaskId: "cp-nl-001", Message: "ok"}, nil
	}

	body := map[string]interface{}{
		"text":    "过去一小时 pid 1234 CPU 飙高，帮我持续观察",
		"execute": true,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks/nl", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got == nil {
		t.Fatal("expected continuous task dispatched")
	}
	if got.GetWindowSec() != 300 {
		t.Fatalf("expected 5 minute window, got %d", got.GetWindowSec())
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

func TestGetTaskArtifact_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["profiler/test-tid-001/test-tid-001.html"] = []byte("<html>memray</html>")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/artifact?key=profiler/test-tid-001/test-tid-001.html", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if w.Body.String() != "<html>memray</html>" {
		t.Fatalf("unexpected body: %q", w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Fatalf("unexpected content-type: %q", ct)
	}
}

func TestGetTaskArtifact_RejectsForeignKey(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["profiler/other/secret.html"] = []byte("<html>secret</html>")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/artifact?key=profiler/other/secret.html", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
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
