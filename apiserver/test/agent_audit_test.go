package test

import (
	"net/http"
	"testing"
	"time"

	"mini-drop/apiserver/model"
)

func TestGetAgentAuditLog_Empty(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/agent/audit-log", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	if resp["code"].(float64) != 0 {
		t.Fatalf("expected code=0, got %v", resp["code"])
	}
	data := resp["data"].([]interface{})
	if len(data) != 0 {
		t.Fatalf("expected 0 audit logs, got %d", len(data))
	}
}

func TestGetAgentAuditLog_WithData(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 插入审计记录
	db.Create(&model.AgentStateHistory{
		IPAddr:    "10.0.0.1",
		Hostname:  "test-host",
		FromState: true,
		ToState:   false,
		Reason:    "Agent 离线（心跳超时）",
		CreatedAt: time.Now().Add(-5 * time.Minute),
	})
	db.Create(&model.AgentStateHistory{
		IPAddr:    "10.0.0.1",
		Hostname:  "test-host",
		FromState: false,
		ToState:   true,
		Reason:    "Agent 恢复上线",
		CreatedAt: time.Now(),
	})

	w := DoAuthRequest(r, "GET", "/api/v1/agent/audit-log", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].([]interface{})
	if len(data) != 2 {
		t.Fatalf("expected 2 audit logs, got %d", len(data))
	}
}

func TestGetAgentAuditLog_FilterByIP(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	db.Create(&model.AgentStateHistory{
		IPAddr: "10.0.0.1", Hostname: "host-a",
		FromState: true, ToState: false, Reason: "offline",
	})
	db.Create(&model.AgentStateHistory{
		IPAddr: "10.0.0.2", Hostname: "host-b",
		FromState: true, ToState: false, Reason: "offline",
	})

	w := DoAuthRequest(r, "GET", "/api/v1/agent/audit-log?ip=10.0.0.1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].([]interface{})
	if len(data) != 1 {
		t.Fatalf("expected 1 audit log for ip=10.0.0.1, got %d", len(data))
	}
}

func TestGetAgentAuditLog_Limit(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	for i := 0; i < 5; i++ {
		db.Create(&model.AgentStateHistory{
			IPAddr: "10.0.0.1", Hostname: "test-host",
			FromState: true, ToState: false, Reason: "offline",
		})
	}

	w := DoAuthRequest(r, "GET", "/api/v1/agent/audit-log?limit=2", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].([]interface{})
	if len(data) != 2 {
		t.Fatalf("expected 2 audit logs with limit=2, got %d", len(data))
	}
}
