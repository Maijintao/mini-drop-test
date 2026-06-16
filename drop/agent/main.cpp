#include <iostream>
#include <string>
#include <vector>
#include <signal.h>
#include <unistd.h>
#include <atomic>
#include <thread>
#include <chrono>
#include <cstring>
#include <grpcpp/grpcpp.h>
#include "Config.h"
#include "HealthCheckChannel.h"
#include "HotmethodChannel.h"
#include "ContainerInfo.h"
#include "Daemon.h"
#include "StorageClient.h"
#include "Log.h"
#include "init.grpc.pb.h"

// 全局退出标志，所有组件共享引用
static std::atomic<bool> g_running{true};

void SignalHandler(int sig) {
  const char msg[] = "Received signal, shutting down...\n";
  write(STDERR_FILENO, msg, sizeof(msg) - 1);
  g_running = false;
}

int main(int argc, char* argv[]) {
  std::string config_path = "etc/config.json";
  bool daemon_mode = false;

  // 解析参数
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--daemon") == 0 || strcmp(argv[i], "-d") == 0) {
      daemon_mode = true;
    } else if ((strcmp(argv[i], "--config") == 0 || strcmp(argv[i], "-c") == 0) && i + 1 < argc) {
      config_path = argv[++i];
    } else if (argv[i][0] != '-') {
      // 兼容：裸路径也当作 config_path
      config_path = argv[i];
    } else {
      std::cerr << "Unknown option: " << argv[i] << std::endl;
      std::cerr << "Usage: drop_agent [--daemon|-d] [--config|-c <path>] [config_path]" << std::endl;
      return 1;
    }
  }

  // 守护化（必须在日志初始化之前，因为会重定向 fd）
  if (daemon_mode) {
    if (drop::Daemonize() != 0) {
      std::cerr << "Failed to daemonize" << std::endl;
      return 1;
    }
  }

  // 加载配置
  drop::Config config = drop::Config::LoadFromFile(config_path);

  // 构建 Server 地址列表
  std::vector<std::string> server_addrs;
  if (config.server_ips.empty()) {
    server_addrs.push_back("localhost:" + std::to_string(config.server_port));
  } else {
    for (const auto& ip : config.server_ips) {
      server_addrs.push_back(ip + ":" + std::to_string(config.server_port));
    }
  }

  // 多Server故障转移：尝试连接每个Server
  std::string server_addr;
  for (const auto& addr : server_addrs) {
    auto channel = grpc::CreateChannel(addr, grpc::InsecureChannelCredentials());
    auto deadline = std::chrono::system_clock::now() + std::chrono::seconds(2);
    if (channel->WaitForConnected(deadline)) {
      server_addr = addr;
      LOG_INFO("Connected to server: " + addr);
      break;
    }
    LOG_WARN("Failed to connect to " + addr + ", trying next...");
  }

  if (server_addr.empty()) {
    LOG_ERROR("Failed to connect to any server");
    return 1;
  }

  // 注册信号处理
  struct sigaction sa;
  sa.sa_handler = SignalHandler;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = 0;
  sigaction(SIGINT, &sa, nullptr);
  sigaction(SIGTERM, &sa, nullptr);

  LOG_INFO("drop_agent starting, connected to " + server_addr);

  // 检测容器环境
  drop::ContainerInfo container_info = drop::ContainerInfo::Detect();
  if (container_info.is_container) {
    LOG_INFO("Running in container: " + container_info.container_id);
  }

  // Agent 注册 + FetchConfig
  {
    auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
    auto init_stub = drop::Init::NewStub(channel);

    // 注册
    grpc::ClientContext ctx;
    ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));

    drop::RegisterAgentRequest req;
    char hostname[256];
    gethostname(hostname, sizeof(hostname));
    req.set_host_name(hostname);
    req.set_ip_addr(config.ip_addr);
    req.set_uid(config.uid);
    req.set_agent_version("0.1.0");

    drop::RegisterAgentResponse resp;
    auto status = init_stub->RegisterAgent(&ctx, req, &resp);
    if (status.ok() && resp.code() == 0) {
      LOG_INFO("[Register] Agent registered successfully");
    } else {
      LOG_ERROR("[Register] Agent registration failed: " +
                (status.ok() ? resp.message() : status.error_message()));
    }

    // 拉取服务端配置（存储配置等）
    grpc::ClientContext cfg_ctx;
    cfg_ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
    drop::FetchConfigRequest cfg_req;
    cfg_req.set_uid(config.uid);
    drop::FetchConfigResponse cfg_resp;
    auto cfg_status = init_stub->FetchConfig(&cfg_ctx, cfg_req, &cfg_resp);
    if (cfg_status.ok() && cfg_resp.code() == 0 && cfg_resp.has_cos_config()) {
      const auto& cos = cfg_resp.cos_config();
      config.storage_endpoint = cos.endpoint();
      config.storage_access_key = cos.access_key();
      config.storage_secret_key = cos.secret_key();
      config.storage_bucket = cos.bucket();
      config.storage_use_ssl = cos.use_ssl();
      LOG_INFO("[FetchConfig] Storage config updated from server: " + cos.endpoint());
    } else {
      LOG_WARN("[FetchConfig] Failed, using local config");
    }
  }

  // 创建组件，共享退出标志
  drop::HotmethodChannel hotmethod_channel(server_addr, config, g_running);
  drop::HealthCheckChannel health_channel(server_addr, server_addrs, config.uid, config.ip_addr, g_running);

  health_channel.SetTaskCallback([&hotmethod_channel](const drop::TaskDesc& task) {
    LOG_INFO("Received task " + task.task_id() + " from server.");
    hotmethod_channel.PushTask(task);
  });

  // 启动组件（各自内部有线程）
  hotmethod_channel.Start();
  health_channel.Start();

  // 主线程等待退出信号
  while (g_running) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  // 析构时自动 Stop() 并 join() 线程
  LOG_INFO("drop_agent stopped.");
  return 0;
}
