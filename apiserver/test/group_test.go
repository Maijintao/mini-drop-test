package test

import (
	"net/http"
	"testing"
)

func TestCreateGroup_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{"name": "new-group"}
	w := DoAuthRequest(r, "POST", "/api/v1/group", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["name"] != "new-group" {
		t.Fatalf("expected name=new-group, got %v", data["name"])
	}
}

func TestGetGroups_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/groups", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	groups := resp["data"].([]interface{})
	if len(groups) < 1 {
		t.Fatal("expected at least 1 group")
	}
}

func TestDeleteGroup_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/group/1", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestDeleteGroup_NotOwner(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	// 用 user-2 删 user-1 的组
	w := DoRequest(r, "DELETE", "/api/v1/group/1", nil, map[string]string{
		"Drop_user_uid":  "test-user-2",
		"Drop_user_name": "TestUser2",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestAddMember_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	body := map[string]interface{}{"uid": "test-user-2"}
	w := DoAuthRequest(r, "POST", "/api/v1/group/1/members", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRemoveMember_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	// 先加成员
	db.Exec("INSERT INTO group_members (gid, uid) VALUES (1, 'test-user-2')")

	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/group/1/members/test-user-2", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRemoveMember_CannotRemoveSelf(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "DELETE", "/api/v1/group/1/members/test-user-1", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestGetGroupMembers_OK(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "GET", "/api/v1/group/1/members", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	resp := ParseJSON(w)
	members := resp["data"].([]interface{})
	if len(members) < 1 {
		t.Fatal("expected at least 1 member")
	}
}
