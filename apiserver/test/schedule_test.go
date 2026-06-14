package test

import (
	"net/http"
	"testing"
)

func TestCreateScheduleTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"task_name": "hourly-cpu",
		"target_ip": "10.0.0.1",
		"pid":       1234,
		"duration":  30,
		"cron_expr": "0 * * * *",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/schedule/task", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["cron_expr"] != "0 * * * *" {
		t.Fatalf("expected cron_expr='0 * * * *', got %v", data["cron_expr"])
	}
}

func TestCreateScheduleTask_BadRequest(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 缺少 required 字段
	body := map[string]interface{}{
		"task_name": "hourly-cpu",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/schedule/task", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestGetScheduleTasks_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 插入一条定时任务
	db.Exec("INSERT INTO hotmethod_task (tid, name, target_ip, status, uid, user_name, create_time) VALUES ('sched-hourly', '[定时] hourly', '10.0.0.1', 0, 'test-user-1', 'TestUser1', datetime('now'))")

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/schedule/tasks", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	tasks := resp["data"].([]interface{})
	if len(tasks) < 1 {
		t.Fatal("expected at least 1 schedule task")
	}
}

func TestDeleteScheduleTask_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	db.Exec("INSERT INTO hotmethod_task (tid, name, target_ip, status, uid, user_name, create_time) VALUES ('sched-hourly', '[定时] hourly', '10.0.0.1', 0, 'test-user-1', 'TestUser1', datetime('now'))")

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/schedule/task/sched-hourly", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
