#include <iostream>
#include <string>
#include <signal.h>
#include <unistd.h>
#include <atomic>
#include <grpcpp/grpcpp.h>
#include "HealthCheckService.h"
#include "HotmethodService.h"
#include "ControlService.h"
#include "InitAgentInfoService.h"

static std::atomic<bool> g_running{true};
static grpc::Server* g_server = nullptr;  // 仅用于信号处理

void SignalHandler(int sig) {
  const char msg[] = "Received signal, shutting down...\n";
  write(STDOUT_FILENO, msg, sizeof(msg) - 1);
  g_running = false;
  // gRPC Shutdown 是线程安全的，可以在信号处理中调用
  if (g_server) {
    g_server->Shutdown();
  }
}

int main(int argc, char* argv[]) {
  std::string server_address("0.0.0.0:50051");

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
  g_server = server.get();

  // 注册信号处理
  struct sigaction sa;
  sa.sa_handler = SignalHandler;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = 0;
  sigaction(SIGINT, &sa, nullptr);
  sigaction(SIGTERM, &sa, nullptr);

  std::cout << "drop_server listening on " << server_address << std::endl;

  // 阻塞等待，直到 Shutdown 被调用
  server->Wait();

  std::cout << "drop_server stopped." << std::endl;
  return 0;
}
