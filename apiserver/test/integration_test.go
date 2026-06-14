package test

import (
	"context"
	"net/http"
	"testing"

	pb "mini-drop/apiserver/proto"
)

// 集成测试1：正常路径 — 创建任务 → 查列表 → 查详情 → 删除
func TestIntegration_NormalPath(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, mockGRPC, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	// Step 1: 创建任务
	body := map[string]interface{}{
		"name":      "integration-test",
		"target_ip": "10.0.0.1",
		"pid":       9999,
		"duration":  10,
		"hz":        99,
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks", body)
	if w.Code != http.StatusOK {
		t.Fatalf("create task failed: %d %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	tid := resp["data"].(map[string]interface{})["tid"].(string)
	if tid == "" {
		t.Fatal("expected tid")
	}

	// Step 2: 查任务列表
	w = DoAuthRequest(r, "GET", "/api/v1/tasks", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list tasks failed: %d", w.Code)
	}
	resp = ParseJSON(w)
	total := resp["data"].(map[string]interface{})["total"].(float64)
	if total < 1 {
		t.Fatal("expected at least 1 task in list")
	}

	// Step 3: 查任务详情
	w = DoAuthRequest(r, "GET", "/api/v1/tasks/"+tid, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get task detail failed: %d", w.Code)
	}

	// Step 4: 模拟分析完成后写入建议
	mockStore.objects[tid+"/flamegraph.svg"] = []byte("<svg>test</svg>")
	suggestionBody := map[string]interface{}{
		"func":       "main",
		"suggestion": "无明显热点",
	}
	w = DoAuthRequest(r, "POST", "/api/v1/tasks/"+tid+"/suggestions", suggestionBody)
	if w.Code != http.StatusOK {
		t.Fatalf("create suggestion failed: %d", w.Code)
	}

	// Step 5: 查火焰图数据
	w = DoAuthRequest(r, "GET", "/api/v1/tasks/"+tid+"/flame", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get flame data failed: %d", w.Code)
	}

	// Step 6: 删除任务
	w = DoAuthRequest(r, "DELETE", "/api/v1/tasks/"+tid, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete task failed: %d", w.Code)
	}

	// Step 7: 确认已删除
	w = DoAuthRequest(r, "GET", "/api/v1/tasks/"+tid, nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", w.Code)
	}
}

// 集成测试2：异常路径 — 未鉴权访问全部端点返回 401
func TestIntegration_Unauthorized(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/v1/auth/check"},
		{"GET", "/api/v1/users"},
		{"GET", "/api/v1/agents"},
		{"GET", "/api/v1/tasks"},
		{"POST", "/api/v1/tasks"},
		{"GET", "/api/v1/tasks/test-tid-001"},
		{"DELETE", "/api/v1/tasks/test-tid-001"},
		{"GET", "/api/v1/groups"},
		{"POST", "/api/v1/group"},
		{"GET", "/api/v1/schedule/tasks"},
	}

	for _, ep := range endpoints {
		w := DoRequest(r, ep.method, ep.path, nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401, got %d", ep.method, ep.path, w.Code)
		}
	}
}

// 集成测试3：异常路径 — 各种参数错误返回 400
func TestIntegration_BadRequest(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	tests := []struct {
		name   string
		method string
		path   string
		body   interface{}
	}{
		{"创建任务缺字段", "POST", "/api/v1/tasks", map[string]interface{}{"name": "test"}},
		{"StatAgent缺ip", "GET", "/api/v1/agent/stat", nil},
		{"COS文件缺tid", "GET", "/api/v1/cosfiles", nil},
		{"创建建议缺func", "POST", "/api/v1/tasks/test-tid-001/suggestions", map[string]interface{}{"suggestion": "test"}},
		{"定时任务缺字段", "POST", "/api/v1/schedule/task", map[string]interface{}{"task_name": "test"}},
	}

	for _, tt := range tests {
		w := DoAuthRequest(r, tt.method, tt.path, tt.body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d %s", tt.name, w.Code, w.Body.String())
		}
	}
}
