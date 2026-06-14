package test

import (
	"net/http"
	"testing"
)

func TestCreateSuggestion_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"func":          "malloc",
		"suggestion":    "考虑用对象池替代频繁malloc",
		"ai_suggestion": "AI建议：使用jemalloc或内存池",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks/test-tid-001/suggestions", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["func"] != "malloc" {
		t.Fatalf("expected func=malloc, got %v", data["func"])
	}
}

func TestCreateSuggestion_TaskNotFound(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"func":       "malloc",
		"suggestion": "test",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/tasks/not-exist/suggestions", body)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestGetSuggestions_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 插入建议
	db.Exec("INSERT INTO analysis_suggestion (tid, func, suggestion, status, created_at, updated_at) VALUES ('test-tid-001', 'malloc', 'use pool', 2, datetime('now'), datetime('now'))")

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/suggestions", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	suggestions := resp["data"].([]interface{})
	if len(suggestions) < 1 {
		t.Fatal("expected at least 1 suggestion")
	}
}

func TestUpdateAnalysisStatus_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"analysis_status": 2,
		"status_info":     "analysis complete",
	}
	w := DoAuthRequest(r, "PUT", "/api/v1/tasks/test-tid-001/analysis_status", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestUpdateAnalysisStatus_NotFound(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{
		"analysis_status": 2,
	}
	w := DoAuthRequest(r, "PUT", "/api/v1/tasks/not-exist/analysis_status", body)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
