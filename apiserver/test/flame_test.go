package test

import (
	"net/http"
	"testing"
)

func TestGetFlameData_SVG(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 放入 mock SVG
	mockStore.objects["test-tid-001/flamegraph.svg"] = []byte("<svg>mock</svg>")

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/flame", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["type"] != "svg" {
		t.Fatalf("expected type=svg, got %v", data["type"])
	}
	if data["url"] == nil {
		t.Fatal("expected url in response")
	}
}

func TestGetFlameData_NotFound(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/tasks/test-tid-001/flame", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestFlameDiff_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, mockStore := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 放入两组 TopN 数据
	mockStore.objects["tid-1/top.json"] = []byte(`[{"func":"main","self":100,"total":200},{"func":"malloc","self":50,"total":50}]`)
	mockStore.objects["tid-2/top.json"] = []byte(`[{"func":"main","self":120,"total":220},{"func":"free","self":30,"total":30}]`)

	body := map[string]interface{}{
		"tid1": "tid-1",
		"tid2": "tid-2",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/flame/diff", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFlameDiff_BadRequest(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 缺少 tid
	body := map[string]interface{}{
		"tid1": "tid-1",
	}
	w := DoAuthRequest(r, "POST", "/api/v1/flame/diff", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
