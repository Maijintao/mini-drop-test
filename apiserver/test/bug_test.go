package test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

// ============================================================
// P0 Bugs
// ============================================================

// Bug1: CORS AllowOrigins:* + AllowCredentials:true 冲突
// 测试：带 Origin header 的请求，响应必须返回具体的 Origin 而非 *
func TestBug1_CORS_AllowCredentials(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	req, _ := http.NewRequest("GET", "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := DoRequest(r, "GET", "/healthz", nil, map[string]string{
		"Origin": "http://localhost:3000",
	})

	acao := w.Header().Get("Access-Control-Allow-Origin")
	if acao == "*" {
		t.Fatal("Bug1: Access-Control-Allow-Origin must not be * when AllowCredentials is true")
	}
}

// Bug2: loadTopN 64KB buffer 截断大 JSON
// 测试：写入大于 64KB 的 top.json，FlameDiff 应能正确解析
func TestBug2_LoadTopN_LargeJSON(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 构造大于 64KB 的 top.json
	var samples []map[string]interface{}
	for i := 0; i < 2000; i++ {
		samples = append(samples, map[string]interface{}{
			"func":  "func_" + string(rune('A'+i%26)) + "_" + string(rune('0'+i/100)),
			"self":  i * 10,
			"total": i * 20,
		})
	}
	data, _ := json.Marshal(samples)
	if len(data) < 65536 {
		t.Fatalf("test data too small: %d bytes", len(data))
	}

	mockStore.objects["tid-1/top.json"] = data
	mockStore.objects["tid-2/top.json"] = data

	body := map[string]interface{}{"tid1": "tid-1", "tid2": "tid-2"}
	w := DoAuthRequest(r, "POST", "/api/v1/flame/diff", body)
	if w.Code != http.StatusOK {
		t.Fatalf("Bug2: expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// Bug3: CreateScheduleTask 不检查 DB 写入错误
// 测试：重复 TID 应返回错误而非 200
func TestBug3_CreateScheduleTask_DBError(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 先插入一个 sched-test 任务
	db.Create(&model.HotmethodTask{
		TID: "sched-test", Name: "[定时] test", TargetIP: "10.0.0.1",
		Status: 0, UID: "test-user-1", UserName: "TestUser1",
	})

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"task_name": "test", // 会生成 sched-test，与已有 TID 冲突
		"target_ip": "10.0.0.1",
		"pid":       1234,
		"duration":  10,
		"cron_expr": "* * * * *",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/schedule/task", body)
	// 重复 TID 应该报错，不是 200
	if w.Code == http.StatusOK {
		resp := ParseJSON(w)
		if resp["code"].(float64) == 0 {
			t.Fatal("Bug3: duplicate TID should return error, not 200")
		}
	}
}

// ============================================================
// P1 Bugs
// ============================================================

// Bug4: DeleteScheduleTask 混淆 DB 错误和未找到
// 测试：删除不存在的定时任务应返回 404，而非 500
func TestBug4_DeleteScheduleTask_NotFound(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/schedule/task/sched-not-exist", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("Bug4: expected 404, got %d", w.Code)
	}
}

// Bug5: RetryTask 丢失 subprocess 和 event 参数
// 测试：创建带 subprocess=true 的任务，retry 后新任务应保留这些参数
func TestBug5_RetryTask_PreserveParams(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 创建一个带完整参数的任务
	db.Model(&model.HotmethodTask{}).Where("tid = ?", "test-tid-001").Update("request_params",
		`{"pid":1234,"duration":10,"hz":99,"callgraph":"dwarf","subprocess":true,"event":"cache-misses"}`)

	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	var capturedReq *pb.CreateTaskRequest
	mockGRPC.CreateTaskFunc = func(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
		capturedReq = req
		return &pb.CreateTaskResponse{Code: 0, Message: "ok"}, nil
	}

	w := DoAuthRequest(r, "POST", "/api/v1/tasks/test-tid-001/retry", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Bug5: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if capturedReq == nil {
		t.Fatal("Bug5: gRPC CreateTask was not called")
	}
	if !capturedReq.TaskDesc.SampleArgv.Subprocess {
		t.Fatal("Bug5: subprocess=true was lost during retry")
	}
	if capturedReq.TaskDesc.SampleArgv.Event != "cache-misses" {
		t.Fatalf("Bug5: event was lost during retry, got '%s'", capturedReq.TaskDesc.SampleArgv.Event)
	}
}

// Bug6: GetAgents 组共享逻辑 — Agent GID 未设置时组共享不生效
// 测试：user-2 在 user-1 的组里，应能看到 user-1 的 Agent
func TestBug6_GetAgents_GroupShare(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// user-2 加入 user-1 的组
	db.Create(&model.GroupMember{GID: 1, UID: "test-user-2"})
	// user-1 的 Agent 设置 GID=1
	db.Model(&model.AgentInfo{}).Where("ip_addr = ?", "10.0.0.1").Update("gid", 1)

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// user-2 查询，应能看到 user-1 的 Agent
	w := DoRequest(r, "GET", "/api/v1/agents", nil, map[string]string{
		"Drop_user_uid":  "test-user-2",
		"Drop_user_name": "TestUser2",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Bug6: expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	agents := resp["data"].([]interface{})
	if len(agents) < 1 {
		t.Fatal("Bug6: user-2 should see user-1's agent via group sharing")
	}
}

// Bug7: CreateGroup 的 AddMember 错误被吞掉
// 这个比较难测（需要模拟 DB 写入失败），改为验证创建者确实是组成员
func TestBug7_CreateGroup_OwnerIsMember(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{"name": "test-group"}
	w := DoAuthRequest(r, "POST", "/api/v1/group", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// 验证创建者在组成员列表中
	resp := ParseJSON(w)
	gid := resp["data"].(map[string]interface{})["gid"].(float64)

	var count int64
	db.Model(&model.GroupMember{}).Where("gid = ? AND uid = ?", uint(gid), "test-user-1").Count(&count)
	if count == 0 {
		t.Fatal("Bug7: group owner should be a member of the group")
	}
}
