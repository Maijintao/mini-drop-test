package test

import (
	"context"
	"net/http"
	"testing"

	pb "mini-drop/apiserver/proto"
)

// 测试获取 Agent 列表
func TestGetAgents_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/agents", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	agents := resp["data"].([]interface{})
	if len(agents) == 0 {
		t.Fatal("expected at least 1 agent")
	}
	first := agents[0].(map[string]interface{})
	if first["ip_addr"] != "10.0.0.1" {
		t.Fatalf("expected ip_addr=10.0.0.1, got %v", first["ip_addr"])
	}
}

func TestGetAgents_SyncsFromDropServer(t *testing.T) {
	db := SetupTestDB()
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.ListAgentsFunc = func(ctx context.Context, req *pb.ListAgentsRequest) (*pb.ListAgentsResponse, error) {
		return &pb.ListAgentsResponse{
			Code:    0,
			Message: "ok",
			Agents: []*pb.AgentInfo{
				{
					HostName:     "drop-agent-1",
					IpAddr:       "10.0.0.9",
					AgentVersion: "0.1.0",
					Online:       true,
					Uid:          "test-user-1",
				},
			},
		}, nil
	}

	w := DoAuthRequest(r, "GET", "/api/v1/agents", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	agents := resp["data"].([]interface{})
	if len(agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(agents))
	}
	first := agents[0].(map[string]interface{})
	if first["ip_addr"] != "10.0.0.9" {
		t.Fatalf("expected synced ip_addr=10.0.0.9, got %v", first["ip_addr"])
	}
	if first["online"] != true {
		t.Fatalf("expected synced agent online")
	}
	if first["uid"] != "test-user-1" {
		t.Fatalf("expected synced uid=test-user-1, got %v", first["uid"])
	}
}

// 测试 StatAgent gRPC 透传
func TestStatAgent_OK(t *testing.T) {
	db := SetupTestDB()
	srv, mockGRPC, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	mockGRPC.StatAgentFunc = func(ctx context.Context, req *pb.StatAgentRequest) (*pb.StatAgentResponse, error) {
		return &pb.StatAgentResponse{
			Code:    0,
			Message: "ok",
			SelfPstats: &pb.PidStats{
				Pid:        1234,
				CpuPercent: 15.5,
				RssKb:      102400,
			},
		}, nil
	}

	w := DoAuthRequest(r, "GET", "/api/v1/agent/stat?ip=10.0.0.1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	selfPstats := data["self_pstats"].(map[string]interface{})
	if selfPstats["pid"].(float64) != 1234 {
		t.Fatalf("expected pid=1234, got %v", selfPstats["pid"])
	}
}

// 测试 StatAgent 缺少 ip 参数
func TestStatAgent_MissingIP(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/agent/stat", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
