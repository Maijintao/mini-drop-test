#include <iostream>
#include <string>
#include <signal.h>
#include "HealthCheckChannel.h"
#include "HotmethodChannel.h"

static bool running = true;

void SignalHandler(int sig) {
  std::cout << "Received signal " << sig << ", shutting down..." << std::endl;
  running = false;
}

int main(int argc, char* argv[]) {
  std::string server_addr = "localhost:50051";
  if (argc > 1) {
    server_addr = argv[1];
  }

  signal(SIGINT, SignalHandler);
  signal(SIGTERM, SignalHandler);

  std::cout << "drop_agent starting, connecting to " << server_addr << std::endl;

  drop::HotmethodChannel hotmethod_channel(server_addr);
  hotmethod_channel.Start();

  drop::HealthCheckChannel health_channel(server_addr);
  health_channel.SetTaskCallback([&hotmethod_channel](const drop::TaskDesc& task) {
    std::cout << "Received task " << task.task_id() << " from server." << std::endl;
    hotmethod_channel.PushTask(task);
  });

  // 心跳通道在主线程运行
  health_channel.Start();

  hotmethod_channel.Stop();
  return 0;
}