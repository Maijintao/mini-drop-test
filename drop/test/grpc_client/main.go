// drop/test/grpc_client/main.go
// 集成测试：模拟 apiserver 调用 drop_server 的 gRPC 接口
// 测试 ControlService (CreateTask/FetchData/StatAgent) + HealthCheck (心跳)
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	pb "mini-drop/apiserver/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	defaultTarget = "localhost:50051"
)

var (
	passCount int
	failCount int
)

func check(name string, err error, expectOK bool) {
	if expectOK && err == nil {
		fmt.Printf("  ✓ %s\n", name)
		passCount++
	} else if !expectOK && err != nil {
		fmt.Printf("  ✓ %s (预期失败: %v)\n", name, err)
		passCount++
	} else if expectOK {
		fmt.Printf("  ✗ %s → 错误: %v\n", name, err)
		failCount++
	} else {
		fmt.Printf("  ✗ %s → 应该失败但成功了\n", name)
		failCount++
	}
}

func checkValue(name string, got, want interface{}) {
	if got == want {
		fmt.Printf("  ✓ %s = %v\n", name, got)
		passCount++
	} else {
		fmt.Printf("  ✗ %s = %v, 期望 %v\n", name, got, want)
		failCount++
	}
}

func main() {
	target := defaultTarget
	if len(os.Args) > 1 {
		target = os.Args[1]
	}

	fmt.Printf("=== 集成测试：apiserver → drop_server (%s) ===\n\n", target)

	// 连接 drop_server（使用 passthrough resolver 绕过 DNS 解析）
	addr := target
	if !contains(addr, ":") {
		addr = "localhost:" + addr
	}
	conn, err := grpc.NewClient("passthrough:///"+addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "❌ 无法连接 drop_server (%s): %v\n", addr, err)
		os.Exit(1)
	}
	defer conn.Close()
	fmt.Printf("✓ 已连接 drop_server (%s)\n\n", addr)

	// 测试 1: ControlService.CreateTask
	testCreateTask(conn)

	// 测试 2: ControlService.StatAgent
	testStatAgent(conn)

	// 测试 3: ControlService.FetchData
	testFetchData(conn)

	// 测试 4: HealthCheck 心跳
	testHealthCheck(conn)

	// 测试 5: CreateTask 参数校验
	testCreateTaskValidation(conn)

	// 测试 6: 全链路模拟 (CreateTask → 心跳拉取)
	testFullLoop(conn)

	// 结果汇总
	fmt.Println("\n================================")
	fmt.Printf("通过: %d  失败: %d  总计: %d\n", passCount, failCount, passCount+failCount)
	if failCount == 0 {
		fmt.Println("✅ 集成测试全部通过")
		os.Exit(0)
	} else {
		fmt.Println("❌ 存在失败项")
		os.Exit(1)
	}
}

// testCreateTask 测试创建任务
func testCreateTask(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 1: ControlService.CreateTask ---")

	client := pb.NewControlClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 正常创建任务
	resp, err := client.CreateTask(ctx, &pb.CreateTaskRequest{
		TargetIp: "127.0.0.1",
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:   "integration-test-001",
			TaskType: 0,
			SampleArgv: &pb.RecordArgv{
				Hz:       99,
				Duration: 5,
				Pid:      1,
				Callgraph: "dwarf",
			},
			TimeoutSec: 35,
		},
	})
	check("CreateTask 调用成功", err, true)
	if err == nil {
		checkValue("CreateTask 返回码", resp.Code, int32(0))
		checkValue("CreateTask 消息", resp.Message, "OK")
	}

	// 创建第二个任务
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	resp2, err := client.CreateTask(ctx2, &pb.CreateTaskRequest{
		TargetIp: "127.0.0.1",
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:      "integration-test-002",
			TaskType:    0,
			ProfilerType: 1,
			SampleArgv: &pb.RecordArgv{
				Hz:       49,
				Duration: 10,
				Pid:      2,
				Callgraph: "fp",
				Subprocess: true,
				Event:     "cache-misses",
			},
			TimeoutSec: 40,
		},
	})
	check("CreateTask 第二个任务", err, true)
	if err == nil {
		checkValue("第二个任务返回码", resp2.Code, int32(0))
	}

	fmt.Println()
}

// testStatAgent 测试查询 Agent 状态
func testStatAgent(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 2: ControlService.StatAgent ---")

	client := pb.NewControlClient(conn)

	// 查询不存在的 Agent
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := client.StatAgent(ctx, &pb.StatAgentRequest{
		IpAddr: "192.168.99.99",
	})
	check("StatAgent 不存在的 Agent", err, true)
	if err == nil {
		checkValue("不存在时返回码", resp.Code, int32(-1))
	}

	fmt.Println()
}

// testFetchData 测试获取任务结果
func testFetchData(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 3: ControlService.FetchData ---")

	client := pb.NewControlClient(conn)

	// 查询不存在的任务结果
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := client.FetchData(ctx, &pb.FetchDataRequest{
		TaskId: "nonexistent-task",
	})
	check("FetchData 不存在的任务", err, true)
	if err == nil {
		checkValue("不存在时返回码", resp.Code, int32(-1))
		checkValue("不存在时消息", resp.Message, "Result not found")
	}

	// 查询刚创建的任务（尚未完成，应该也没有结果）
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	resp2, err := client.FetchData(ctx2, &pb.FetchDataRequest{
		TaskId: "integration-test-001",
	})
	check("FetchData 未完成的任务", err, true)
	if err == nil {
		// 任务还在队列里没有结果，应该返回 not found
		fmt.Printf("    (返回码: %d, 消息: %s)\n", resp2.Code, resp2.Message)
	}

	fmt.Println()
}

// testHealthCheck 测试心跳（模拟 Agent 行为）
func testHealthCheck(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 4: HealthCheck 心跳 ---")

	client := pb.NewHealthCheckClient(conn)

	// 发送心跳
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := client.Do(ctx, &pb.HealthCheckRequest{
		HostName:    "test-agent-host",
		IpAddr:      "127.0.0.1",
		Uid:         "test-agent-001",
		AgentVersion: "0.1.0-test",
		SelfPstats: &pb.PidStats{
			Pid:          int32(os.Getpid()),
			CpuPercent:   1.5,
			RssKb:        10240,
			ReadKbPerSec: 100,
			WriteKbPerSec: 50,
		},
	})
	check("HealthCheck 调用成功", err, true)
	if err == nil {
		checkValue("HealthCheck 状态", resp.Status, pb.HealthCheckResponse_SERVING)
		fmt.Printf("    (pending=%v)\n", resp.Pending)

		if resp.Pending {
			fmt.Printf("    ✓ 通过心跳拉到任务: task_id=%s\n", resp.TaskDesc.TaskId)
			passCount++
		} else {
			fmt.Printf("    (没有待派发任务，可能已被消费或任务队列为空)\n")
		}
	}

	// 再发一次心跳，看是否有第二个任务
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	resp2, err := client.Do(ctx2, &pb.HealthCheckRequest{
		HostName:    "test-agent-host",
		IpAddr:      "127.0.0.1",
		Uid:         "test-agent-001",
		AgentVersion: "0.1.0-test",
	})
	check("第二次心跳", err, true)
	if err == nil && resp2.Pending {
		fmt.Printf("    ✓ 拉到第二个任务: task_id=%s\n", resp2.TaskDesc.TaskId)
		passCount++
	}

	fmt.Println()
}

// testCreateTaskValidation 测试参数校验
func testCreateTaskValidation(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 5: CreateTask 参数校验 ---")

	client := pb.NewControlClient(conn)

	// 缺少 target_ip
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := client.CreateTask(ctx, &pb.CreateTaskRequest{
		TargetIp: "",
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId: "should-fail-001",
		},
	})
	check("缺少 target_ip 时调用成功（业务错误码）", err, true)
	if err == nil {
		checkValue("缺少 target_ip 返回码", resp.Code, int32(-1))
	}

	// 缺少 task_id
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	resp2, err := client.CreateTask(ctx2, &pb.CreateTaskRequest{
		TargetIp: "127.0.0.1",
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId: "",
		},
	})
	check("缺少 task_id 时调用成功（业务错误码）", err, true)
	if err == nil {
		checkValue("缺少 task_id 返回码", resp2.Code, int32(-1))
	}

	fmt.Println()
}

// testFullLoop 全链路模拟：CreateTask → 心跳拉取 → NotifyResult → FetchData
func testFullLoop(conn *grpc.ClientConn) {
	fmt.Println("--- 测试 6: 全链路模拟 ---")
	fmt.Println("  流程: CreateTask → HealthCheck拉取 → NotifyResult → FetchData")

	controlClient := pb.NewControlClient(conn)
	healthClient := pb.NewHealthCheckClient(conn)
	hotmethodClient := pb.NewHotmethodClient(conn)

	taskID := "fullloop-" + fmt.Sprintf("%d", time.Now().UnixNano())
	targetIP := "127.0.0.1"

	// Step 1: 创建任务
	ctx1, cancel1 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel1()
	createResp, err := controlClient.CreateTask(ctx1, &pb.CreateTaskRequest{
		TargetIp: targetIP,
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:   taskID,
			TaskType: 0,
			SampleArgv: &pb.RecordArgv{
				Hz:       99,
				Duration: 3,
				Pid:      1,
				Callgraph: "dwarf",
			},
			TimeoutSec: 35,
		},
	})
	if err != nil {
		fmt.Printf("  ✗ CreateTask 失败: %v\n", err)
		failCount++
		fmt.Println()
		return
	}
	if createResp.Code != 0 {
		fmt.Printf("  ✗ CreateTask 失败: code=%d, msg=%s\n", createResp.Code, createResp.Message)
		failCount++
		fmt.Println()
		return
	}
	fmt.Printf("  ✓ Step 1: CreateTask 成功 (task_id=%s)\n", taskID)
	passCount++

	// Step 2: 心跳拉取任务
	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	hbResp, err := healthClient.Do(ctx2, &pb.HealthCheckRequest{
		HostName:    "fullloop-agent",
		IpAddr:      targetIP,
		Uid:         "fullloop-agent-001",
		AgentVersion: "0.1.0",
	})
	if err != nil {
		fmt.Printf("  ✗ HealthCheck 失败: %v\n", err)
		failCount++
		fmt.Println()
		return
	}
	if !hbResp.Pending || hbResp.TaskDesc == nil || hbResp.TaskDesc.TaskId != taskID {
		fmt.Printf("  ✗ 心跳未拉到预期任务 (pending=%v)\n", hbResp.Pending)
		failCount++
		fmt.Println()
		return
	}
	fmt.Printf("  ✓ Step 2: 心跳拉到任务 task_id=%s\n", hbResp.TaskDesc.TaskId)
	passCount++

	// Step 3: 上报结果（模拟采集成功）
	ctx3, cancel3 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel3()
	_, err = hotmethodClient.NotifyResult(ctx3, &pb.TaskResult{
		TaskId:      taskID,
		ErrorMessage: "",
		CosKey:      taskID + "/perf.data",
		SelfPstats: []*pb.PidStats{
			{Pid: 1, CpuPercent: 5.0, RssKb: 20480},
		},
	})
	check("Step 3: NotifyResult 上报成功", err, true)

	// Step 4: 查询结果
	ctx4, cancel4 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel4()
	fetchResp, err := controlClient.FetchData(ctx4, &pb.FetchDataRequest{
		TaskId: taskID,
	})
	check("Step 4: FetchData 调用成功", err, true)
	if err == nil {
		checkValue("FetchData 返回码", fetchResp.Code, int32(0))
		if fetchResp.CosKey != "" {
			fmt.Printf("    ✓ cos_key = %s\n", fetchResp.CosKey)
			passCount++
		}
	}

	// Step 5: 测试失败任务的全链路
	failTaskID := "fullloop-fail-" + fmt.Sprintf("%d", time.Now().UnixNano())
	ctx5, cancel5 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel5()
	_, err = controlClient.CreateTask(ctx5, &pb.CreateTaskRequest{
		TargetIp: targetIP,
		Service:  "hotmethod",
		TaskDesc: &pb.TaskDesc{
			TaskId:   failTaskID,
			TaskType: 0,
			SampleArgv: &pb.RecordArgv{
				Hz:       99,
				Duration: 3,
				Pid:      99999, // 不存在的 PID
			},
			TimeoutSec: 35,
		},
	})
	check("Step 5a: 创建失败任务", err, true)

	// 心跳拉取
	ctx5b, cancel5b := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel5b()
	hbResp2, err := healthClient.Do(ctx5b, &pb.HealthCheckRequest{
		HostName: "fullloop-agent",
		IpAddr:   targetIP,
		Uid:      "fullloop-agent-001",
	})
	if err == nil && hbResp2.Pending && hbResp2.TaskDesc != nil {
		fmt.Printf("  ✓ Step 5b: 拉到失败任务 task_id=%s\n", hbResp2.TaskDesc.TaskId)
		passCount++

		// 上报失败
		ctx5c, cancel5c := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel5c()
		_, err = hotmethodClient.NotifyResult(ctx5c, &pb.TaskResult{
			TaskId:       hbResp2.TaskDesc.TaskId,
			ErrorMessage: "perf record failed: PID 99999 does not exist",
		})
		check("Step 5c: NotifyResult 上报失败结果", err, true)

		// 查询失败任务的结果
		ctx5d, cancel5d := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel5d()
		fetchResp2, err := controlClient.FetchData(ctx5d, &pb.FetchDataRequest{
			TaskId: hbResp2.TaskDesc.TaskId,
		})
		if err == nil {
			checkValue("Step 5d: 失败任务 FetchData 返回码", fetchResp2.Code, int32(0))
		}
	}

	fmt.Println()
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
