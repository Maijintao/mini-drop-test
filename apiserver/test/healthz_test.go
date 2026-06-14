package test

import (
	"net/http"
	"testing"
)

func TestHealthz(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoRequest(r, "GET", "/healthz", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	if resp["status"] != "ok" {
		t.Fatalf("expected status=ok, got %v", resp["status"])
	}
}
