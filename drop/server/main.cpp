#include <iostream>
#include <string>
#include <signal.h>
#include <unistd.h>
#include <atomic>
#include <thread>
#include <chrono>
#include <grpcpp/grpcpp.h>
#include "HealthCheckService.h"
#include "HotmethodService.h"
#include "ControlService.h"
#include "InitAgentInfoService.h"

static std::atomic<bool> g_running{true};

void SignalHandler(int sig) {
  const char msg[] = "Received signal, shutting down...\n";
  write(STDOUT_FILENO, msg, sizeof(msg) - 1);
  g_running = false;
}

int main(int argc, char* argv[]) {
  int port = 50051;
  for (int i = 1; i < argc - 1; i++) {
    if (std::string(argv[i]) == "--port") {
      port = std::stoi(argv[i + 1]);
      break;
    }
  }
  std::string server_address = "0.0.0.0:" + std::to_string(port);

  // 从环境变量读取存储配置
  drop::AgentConfig storage_config;
  storage_config.endpoint = std::getenv("MINIO_ENDPOINT") ? std::getenv("MINIO_ENDPOINT") : "localhost:9000";
  storage_config.access_key = std::getenv("MINIO_ACCESS_KEY") ? std::getenv("MINIO_ACCESS_KEY") : "drop";
  storage_config.secret_key = std::getenv("MINIO_SECRET_KEY") ? std::getenv("MINIO_SECRET_KEY") : "dropdrop";
  storage_config.bucket = std::getenv("MINIO_BUCKET") ? std::getenv("MINIO_BUCKET") : "drop";
  storage_config.use_ssl = false;

  // 创建服务
  drop::HotmethodService hotmethod_service;
  drop::HealthCheckService health_service(&hotmethod_service);
  drop::ControlService control_service(&hotmethod_service);
  drop::InitAgentInfoService init_service(storage_config);

  grpc::ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&health_service);
  builder.RegisterService(&hotmethod_service);
  builder.RegisterService(&control_service);
  builder.RegisterService(&init_service);

  auto server = builder.BuildAndStart();
  if (!server) {
    std::cerr << "Failed to start server on " << server_address << std::endl;
    return 1;
  }

  // 注册信号处理
  struct sigaction sa;
  sa.sa_handler = SignalHandler;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = 0;
  sigaction(SIGINT, &sa, nullptr);
  sigaction(SIGTERM, &sa, nullptr);

  std::cout << "drop_server listening on " << server_address << std::endl;

  // 启动超时清理线程
  std::thread cleanup_thread([&hotmethod_service]() {
    while (g_running) {
      hotmethod_service.CleanupTimeoutTasks(30);  // 30 秒超时
      std::this_thread::sleep_for(std::chrono::seconds(10));  // 每 10 秒检查一次
    }
  });

  // 等待退出信号，然后优雅关闭
  while (g_running) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  // 等待清理线程结束
  if (cleanup_thread.joinable()) {
    cleanup_thread.join();
  }

  // 优雅关闭 Server
  server->Shutdown();

  std::cout << "drop_server stopped." << std::endl;
  return 0;
}
