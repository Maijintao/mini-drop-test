package server

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"mini-drop/apiserver/config"
	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	pb "mini-drop/apiserver/proto"
)

type memoryStorage struct {
	objects map[string][]byte
}

func (m *memoryStorage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return nil, io.EOF
}

func (m *memoryStorage) Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	m.objects[key] = data
	return nil
}

func (m *memoryStorage) PreSign(ctx context.Context, key string, expiry time.Duration) (string, error) {
	return "", nil
}

func (m *memoryStorage) Delete(ctx context.Context, key string) error {
	return nil
}

func (m *memoryStorage) IsExist(ctx context.Context, key string) (bool, error) {
	_, ok := m.objects[key]
	return ok, nil
}

func (m *memoryStorage) List(ctx context.Context, prefix string) ([]string, error) {
	return nil, nil
}

func setupAnalysisTestServer(t *testing.T, analysisCfg config.AnalysisConfig, authSecret string) (*APIServer, *gorm.DB) {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	model.AutoMigrate(db)
	db.Create(&model.HotmethodTask{
		TID:            "tid-analysis",
		Name:           "analysis task",
		Type:           0,
		Status:         TaskStatusSuccess,
		AnalysisStatus: AnalysisStatusPending,
		UID:            "owner-1",
		UserName:       "Owner One",
		CreateTime:     time.Now(),
	})

	return New(db, nil, &memoryStorage{objects: map[string][]byte{}}, analysisCfg, authSecret), db
}

func TestRunAnalysisPassesTaskOwnerAuthEnv(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, "env.txt")
	scriptPath := filepath.Join(dir, "capture-env.sh")
	if err := os.WriteFile(scriptPath, []byte("env | grep '^DROP_USER_' > \"$ENV_OUT\"\n"), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}
	t.Setenv("ENV_OUT", envPath)

	srv, db := setupAnalysisTestServer(t, config.AnalysisConfig{
		Command:    "/bin/sh",
		ScriptPath: scriptPath,
	}, "secret")

	srv.runAnalysis("tid-analysis", 0)

	data, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("read env output: %v", err)
	}
	output := string(data)
	if !strings.Contains(output, "DROP_USER_UID=owner-1") {
		t.Fatalf("missing owner uid in env: %s", output)
	}
	if !strings.Contains(output, "DROP_USER_NAME=Owner One") {
		t.Fatalf("missing owner name in env: %s", output)
	}
	wantToken := middleware.ComputeHMAC("owner-1", "secret")
	if !strings.Contains(output, "DROP_USER_TOKEN="+wantToken) {
		t.Fatalf("missing auth token in env: %s", output)
	}

	var task model.HotmethodTask
	db.Where("tid = ?", "tid-analysis").First(&task)
	if task.AnalysisStatus != AnalysisStatusPending {
		t.Fatalf("runAnalysis should not pre-mark running, got %d", task.AnalysisStatus)
	}
}

func TestRunAnalysisFailureMarksPendingTaskFailed(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "fail.sh")
	if err := os.WriteFile(scriptPath, []byte("echo failed >&2\nexit 2\n"), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	srv, db := setupAnalysisTestServer(t, config.AnalysisConfig{
		Command:    "/bin/sh",
		ScriptPath: scriptPath,
	}, "")

	srv.runAnalysis("tid-analysis", 0)

	var task model.HotmethodTask
	db.Where("tid = ?", "tid-analysis").First(&task)
	if task.AnalysisStatus != AnalysisStatusFailed {
		t.Fatalf("analysis_status = %d, want %d", task.AnalysisStatus, AnalysisStatusFailed)
	}
	if !strings.Contains(task.StatusInfo, "failed") {
		t.Fatalf("status_info should include stderr, got %q", task.StatusInfo)
	}
}

func TestPersistFetchedResultFileStoresEmbeddedCollectorResult(t *testing.T) {
	store := &memoryStorage{objects: map[string][]byte{}}
	srv := &APIServer{Storage: store}

	key, err := srv.persistFetchedResultFile(context.Background(), "tid-embed", &pb.FetchDataResponse{
		File: &pb.File{Name: "tid-embed.collapsed", Content: []byte("main;work 7")},
	})
	if err != nil {
		t.Fatalf("persist file: %v", err)
	}
	if key != "profiler/tid-embed/tid-embed.collapsed" {
		t.Fatalf("key = %q", key)
	}
	if string(store.objects[key]) != "main;work 7" {
		t.Fatalf("stored content = %q", string(store.objects[key]))
	}
}
