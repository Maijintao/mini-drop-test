package server

import (
	"gorm.io/gorm"

	"mini-drop/apiserver/pkg/storage"
	"mini-drop/apiserver/proto/control"
)

// APIServer 持有所有依赖
type APIServer struct {
	Db      *gorm.DB
	GRPC    *control.ControlClient
	Storage storage.Storage
}

// New 创建 APIServer 实例
func New(db *gorm.DB, grpcClient *control.ControlClient, store storage.Storage) *APIServer {
	return &APIServer{
		Db:      db,
		GRPC:    grpcClient,
		Storage: store,
	}
}
