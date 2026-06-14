package control

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "mini-drop/apiserver/proto"
)

// ControlClient 封装对 drop_server ControlService 的 gRPC 调用
type ControlClient struct {
	conn   *grpc.ClientConn
	client pb.ControlClient
}

// NewControlClient 连接 drop_server
func NewControlClient(target string) (*ControlClient, error) {
	conn, err := grpc.Dial(target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", target, err)
	}
	return &ControlClient{
		conn:   conn,
		client: pb.NewControlClient(conn),
	}, nil
}

// CreateTask 下发采集任务到 drop_server
func (c *ControlClient) CreateTask(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
	return c.client.CreateTask(ctx, req)
}

// FetchData 查询任务产出数据
func (c *ControlClient) FetchData(ctx context.Context, req *pb.FetchDataRequest) (*pb.FetchDataResponse, error) {
	return c.client.FetchData(ctx, req)
}

// StatAgent 查询 Agent 资源占用
func (c *ControlClient) StatAgent(ctx context.Context, req *pb.StatAgentRequest) (*pb.StatAgentResponse, error) {
	return c.client.StatAgent(ctx, req)
}

// Close 关闭连接
func (c *ControlClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// 编译时接口校验（在 server 包中定义 GRPCClient 接口）
// ControlClient 实现了 CreateTask/FetchData/StatAgent/Close，满足接口
