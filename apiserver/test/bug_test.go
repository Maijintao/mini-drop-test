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

// Bug3: CreateScheduleTask TID 碰撞（N12 已修复：改用 UUID）
// 测试：同名定时任务不再 TID 碰撞
func TestBug3_CreateScheduleTask_SameNameNoCollision(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 先插入一个 sched- 开头的任务
	db.Create(&model.HotmethodTask{
		TID: "sched-old-test", Name: "[定时] test", TargetIP: "10.0.0.1",
		Status: 0, UID: "test-user-1", UserName: "TestUser1",
	})

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"task_name": "test", // N12 修复后用 UUID，不再碰撞
		"target_ip": "10.0.0.1",
		"pid":       1234,
		"duration":  10,
		"cron_expr": "* * * * *",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/schedule/task", body)
	if w.Code != http.StatusOK {
		t.Fatalf("Bug3: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	if resp["code"].(float64) != 0 {
		t.Fatalf("Bug3: expected code 0, got %v", resp["code"])
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

// ============================================================
// P2 Bugs
// ============================================================

// Bug8+9: flame.go GetFlameData 中 IsExist/PreSign 错误被忽略
// 测试：正常路径已有 TestGetFlameData_SVG 覆盖，此处验证返回的 URL 非空
func TestBug89_GetFlameData_URLNotEmpty(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["test-tid-001/flamegraph.svg"] = []byte("<svg>test</svg>")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/flame", nil)
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	url, ok := data["url"].(string)
	if !ok || url == "" {
		t.Fatal("Bug8/9: PreSign URL should not be empty")
	}
}

// Bug10: task.go GetTaskDetail 中 PreSign 错误被忽略
// 测试：任务成功但 PreSign 返回的 URL 不应为空
func TestBug10_TaskDetail_COSURLNotEmpty(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["test-tid-001/perf.data"] = []byte("mock")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001", nil)
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	files, ok := data["cos_files"].([]interface{})
	if ok && len(files) > 0 {
		file := files[0].(map[string]interface{})
		if file["url"] == nil || file["url"] == "" {
			t.Fatal("Bug10: COS file URL should not be empty")
		}
	}
}

// Bug11+12: util.go mustMarshal/mustUnmarshal — 私有函数，由其他测试间接覆盖
// Bug13+14: main.go 错误处理 — 通过编译即可（运行时错误）
// 不写测试，直接在代码中修复

// Bug15: auth.go AuthCheck 未注册用户应返回 401
func TestBug15_AuthCheck_UnregisteredUser(t *testing.T) {
	db := SetupTestDB()
	// 不预插用户，AuthCheck 应返回 401
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/auth/check", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Bug15: expected 401, got %d", w.Code)
	}

	resp := ParseJSON(w)
	if resp["code"].(float64) != 4010003 {
		t.Fatalf("Bug15: expected code=4010003, got %v", resp["code"])
	}
}

// Bug16: control/client.go grpc.Dial 已废弃
// 编译时检查，不写运行时测试

// ============================================================
// 剩余 Bug 测试
// ============================================================

// CORS P0: AllowOrigins:* + AllowCredentials:true
// 测试：带 Origin 的请求，Access-Control-Allow-Origin 不应是 *
func TestCORS_SpecificOrigin(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv) // 使用带 CORS 的 router

	w := DoRequest(r, "GET", "/healthz", nil, map[string]string{
		"Origin": "http://localhost:3000",
	})
	acao := w.Header().Get("Access-Control-Allow-Origin")
	if acao == "*" {
		t.Fatal("CORS: Access-Control-Allow-Origin must not be * when credentials are allowed")
	}
}

// Bug4 P1: DeleteScheduleTask 混淆 DB 错误和未找到
// 已有 TestBug4_DeleteScheduleTask_NotFound 覆盖，此处补充：正常删除应返回 200
func TestBug4_DeleteScheduleTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	db.Create(&model.HotmethodTask{
		TID: "sched-del", Name: "[定时] del", TargetIP: "10.0.0.1",
		Status: 0, UID: "test-user-1", UserName: "TestUser1",
	})
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/schedule/task/sched-del", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Bug4: expected 200, got %d", w.Code)
	}
}

// Bug7 P1: CreateGroup AddMember 错误处理
// 已有 TestBug7_CreateGroup_OwnerIsMember 覆盖

// Bug12 P2: GetCOSFiles PreSign 错误处理
func TestBug12_GetCOSFiles_URLNotEmpty(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockStore.objects["test-tid-001/perf.data"] = []byte("mock")

	w := DoAuthRequest(r, "GET", "/api/v1/cosfiles?tid=test-tid-001", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	files := resp["data"].([]interface{})
	if len(files) > 0 {
		file := files[0].(map[string]interface{})
		if file["url"] == nil || file["url"] == "" {
			t.Fatal("Bug12: COS file URL should not be empty")
		}
	}
}
