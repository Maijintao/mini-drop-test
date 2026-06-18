package test

import (
	"net/http"
	"testing"
)

func TestLLMSettingsTokenLifecycle(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "PUT", "/api/v1/settings/llm", map[string]interface{}{
		"base_url": "https://llm.example.com/v1",
		"model":    "gpt-test",
		"token":    "sk-1234567890",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	resp := ParseJSON(w)
	data := resp["data"].(map[string]interface{})
	if data["base_url"] != "https://llm.example.com/v1" {
		t.Fatalf("expected base_url saved, got %v", data["base_url"])
	}
	if data["model"] != "gpt-test" {
		t.Fatalf("expected model saved, got %v", data["model"])
	}
	if data["token_configured"] != true {
		t.Fatalf("expected token_configured=true, got %v", data["token_configured"])
	}
	if _, ok := data["token"]; ok {
		t.Fatalf("token plaintext must not be returned")
	}

	w = DoAuthRequest(r, "PUT", "/api/v1/settings/llm", map[string]interface{}{
		"base_url": "https://llm.example.com/v2",
		"model":    "gpt-test-2",
		"token":    "",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data = ParseJSON(w)["data"].(map[string]interface{})
	if data["token_configured"] != true {
		t.Fatalf("empty token input should keep existing token")
	}

	w = DoAuthRequest(r, "PUT", "/api/v1/settings/llm", map[string]interface{}{
		"base_url":    "https://llm.example.com/v2",
		"model":       "gpt-test-2",
		"clear_token": true,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data = ParseJSON(w)["data"].(map[string]interface{})
	if data["token_configured"] != false {
		t.Fatalf("clear_token should remove configured token")
	}
}

func TestLLMSettingsRejectInvalidBaseURL(t *testing.T) {
	db := SetupTestDB()
	SeedTestData(db)
	srv, _, _ := CreateTestAPIServer(db)
	r := SetupTestRouter(srv)

	w := DoAuthRequest(r, "PUT", "/api/v1/settings/llm", map[string]interface{}{
		"base_url": "llm.example.com/v1",
		"model":    "gpt-test",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}
