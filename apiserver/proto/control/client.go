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
	conn, err := grpc.NewClient(target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc new client %s: %w", target, err)
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

// ListAgents 查询全部 Agent 状态
func (c *ControlClient) ListAgents(ctx context.Context, req *pb.ListAgentsRequest) (*pb.ListAgentsResponse, error) {
	return c.client.ListAgents(ctx, req)
}

// Close 关闭连接
func (c *ControlClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// StartContinuous 创建常驻采集任务
func (c *ControlClient) StartContinuous(ctx context.Context, req *pb.StartContinuousRequest) (*pb.StartContinuousResponse, error) {
	return c.client.StartContinuous(ctx, req)
}

// StopContinuous 停止常驻采集任务
func (c *ControlClient) StopContinuous(ctx context.Context, req *pb.StopContinuousRequest) (*pb.StopContinuousResponse, error) {
	return c.client.StopContinuous(ctx, req)
}

// ListWindows 查询连续任务的窗口列表
func (c *ControlClient) ListWindows(ctx context.Context, req *pb.ListWindowsRequest) (*pb.ListWindowsResponse, error) {
	return c.client.ListWindows(ctx, req)
}

// 编译时接口校验（在 server 包中定义 GRPCClient 接口）
// ControlClient 实现了 CreateTask/FetchData/StatAgent/Close，满足接口
