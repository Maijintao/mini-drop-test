package test

import (
	"net/http"
	"testing"
)

// 测试 AuthCheck 正常鉴权
func TestAuthCheck_OK(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/auth/check", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	if resp["code"].(float64) != 0 {
		t.Fatalf("expected code=0, got %v", resp["code"])
	}
	data := resp["data"].(map[string]interface{})
	if data["uid"] != "test-user-1" {
		t.Fatalf("expected uid=test-user-1, got %v", data["uid"])
	}
}

// 测试未鉴权访问返回 401
func TestAuthCheck_Unauthorized(t *testing.T) {
	db := SetupTestDB()
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 不带 header
	w := DoRequest(r, "GET", "/api/v1/auth/check", nil, nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	resp := ParseJSON(w)
	if resp["code"].(float64) != 4010001 {
		t.Fatalf("expected code=4010001, got %v", resp["code"])
	}
}

// 测试 GetUsers 正常查询
func TestGetUsers_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/users", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["uid"] != "test-user-1" {
		t.Fatalf("expected uid=test-user-1, got %v", data["uid"])
	}
}

// 测试 GetUsers 用户不存在
func TestGetUsers_NotFound(t *testing.T) {
	db := SetupTestDB()
	// 不插数据
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/users", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
