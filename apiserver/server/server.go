package server

import (
	"context"
	"sync"

	"gorm.io/gorm"

	"mini-drop/apiserver/config"
	"mini-drop/apiserver/pkg/storage"
	pb "mini-drop/apiserver/proto"
)

// GRPCClient gRPC 客户端接口（方便 mock 测试）
type GRPCClient interface {
	CreateTask(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error)
	FetchData(ctx context.Context, req *pb.FetchDataRequest) (*pb.FetchDataResponse, error)
	StatAgent(ctx context.Context, req *pb.StatAgentRequest) (*pb.StatAgentResponse, error)
	ListAgents(ctx context.Context, req *pb.ListAgentsRequest) (*pb.ListAgentsResponse, error)
	StartContinuous(ctx context.Context, req *pb.StartContinuousRequest) (*pb.StartContinuousResponse, error)
	StopContinuous(ctx context.Context, req *pb.StopContinuousRequest) (*pb.StopContinuousResponse, error)
	ListWindows(ctx context.Context, req *pb.ListWindowsRequest) (*pb.ListWindowsResponse, error)
	Close() error
}

// APIServer 持有所有依赖
type APIServer struct {
	Db          *gorm.DB
	GRPC        GRPCClient
	Storage     storage.Storage
	Schedule    *ScheduleManager
	AnalysisCmd config.AnalysisConfig
	AuthSecret  string // HMAC 鉴权密钥
	WG          sync.WaitGroup // 跟踪后台 goroutine
}

// New 创建 APIServer 实例
func New(db *gorm.DB, grpcClient GRPCClient, store storage.Storage, analysisCfg config.AnalysisConfig, authSecret string) *APIServer {
	s := &APIServer{
		Db:          db,
		GRPC:        grpcClient,
		Storage:     store,
		Schedule:    NewScheduleManager(db),
		AnalysisCmd: analysisCfg,
		AuthSecret:  authSecret,
	}
	s.Schedule.api = s
	return s
}
