package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPublicObjectEndpointForRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "http://192.168.50.93:8191/api/v1/cosfiles", nil)

	endpoint, useSSL := publicObjectEndpointForRequest(c)
	if endpoint != "192.168.50.93:9000" {
		t.Fatalf("endpoint = %q, want %q", endpoint, "192.168.50.93:9000")
	}
	if useSSL {
		t.Fatalf("useSSL = true, want false")
	}
}

func TestPublicObjectEndpointForRequestForwardedHTTPS(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "http://apiserver:8191/api/v1/cosfiles", nil)
	c.Request.Header.Set("X-Forwarded-Host", "demo.example.com")
	c.Request.Header.Set("X-Forwarded-Proto", "https")

	endpoint, useSSL := publicObjectEndpointForRequest(c)
	if endpoint != "demo.example.com:9000" {
		t.Fatalf("endpoint = %q, want %q", endpoint, "demo.example.com:9000")
	}
	if !useSSL {
		t.Fatalf("useSSL = false, want true")
	}
}

func TestExtractCollectorResultKeyStopsAtStatusSuffix(t *testing.T) {
	got := extractCollectorResultKey("collector result ready: profiler/tid/tid.txt; analysis started; analysis completed")
	want := "profiler/tid/tid.txt"
	if got != want {
		t.Fatalf("collector key = %q, want %q", got, want)
	}
}
