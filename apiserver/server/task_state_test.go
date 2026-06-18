package server

import "testing"

func TestParseDropStatusMessage(t *testing.T) {
	tests := []struct {
		name       string
		message    string
		wantStatus int
		wantReason string
		wantOK     bool
	}{
		{
			name:       "running status",
			message:    "STATUS:2:Agent started",
			wantStatus: TaskStatusRunning,
			wantReason: "Agent started",
			wantOK:     true,
		},
		{
			name:       "internal dispatched normalizes to pending",
			message:    "STATUS:1:queued by drop_server",
			wantStatus: TaskStatusNew,
			wantReason: "queued by drop_server",
			wantOK:     true,
		},
		{
			name:       "internal timeout normalizes to failed",
			message:    "STATUS:6:dispatch timeout",
			wantStatus: TaskStatusFailed,
			wantReason: "dispatch timeout",
			wantOK:     true,
		},
		{
			name:    "non status message",
			message: "Result not found",
			wantOK:  false,
		},
		{
			name:    "bad status code",
			message: "STATUS:bad:reason",
			wantOK:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotStatus, gotReason, gotOK := parseDropStatusMessage(tt.message)
			if gotOK != tt.wantOK {
				t.Fatalf("ok = %v, want %v", gotOK, tt.wantOK)
			}
			if !gotOK {
				return
			}
			if gotStatus != tt.wantStatus {
				t.Fatalf("status = %d, want %d", gotStatus, tt.wantStatus)
			}
			if gotReason != tt.wantReason {
				t.Fatalf("reason = %q, want %q", gotReason, tt.wantReason)
			}
		})
	}
}
