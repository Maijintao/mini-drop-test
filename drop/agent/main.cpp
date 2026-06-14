#include <iostream>
#include <string>
#include <signal.h>
#include <unistd.h>
#include <atomic>
#include <thread>
#include <chrono>
#include "Config.h"
#include "HealthCheckChannel.h"
#include "HotmethodChannel.h"

// 全局退出标志，所有组件共享引用
static std::atomic<bool> g_running{true};

void SignalHandler(int sig) {
  const char msg[] = "Received signal, shutting down...\n";
  write(STDOUT_FILENO, msg, sizeof(msg) - 1);
  g_running = false;
}

int main(int argc, char* argv[]) {
  std::string config_path = "etc/config.json";
  if (argc > 1) {
    config_path = argv[1];
  }

  // 加载配置
  drop::Config config = drop::Config::LoadFromFile(config_path);

  std::string server_addr = config.server_ips.empty()
    ? "localhost:50051"
    : config.server_ips[0] + ":" + std::to_string(config.server_port);

  // 注册信号处理
  struct sigaction sa;
  sa.sa_handler = SignalHandler;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = 0;
  sigaction(SIGINT, &sa, nullptr);
  sigaction(SIGTERM, &sa, nullptr);

  std::cout << "drop_agent starting, connecting to " << server_addr << std::endl;

  // 创建组件，共享退出标志
  drop::HotmethodChannel hotmethod_channel(server_addr, config, g_running);
  drop::HealthCheckChannel health_channel(server_addr, config.uid, config.ip_addr, g_running);

  health_channel.SetTaskCallback([&hotmethod_channel](const drop::TaskDesc& task) {
    std::cout << "Received task " << task.task_id() << " from server." << std::endl;
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
  std::cout << "drop_agent stopped." << std::endl;
  return 0;
}
