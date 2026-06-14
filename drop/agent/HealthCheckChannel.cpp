#include "HealthCheckChannel.h"
#include <chrono>
#include <iostream>
#include <unistd.h>
#include <limits.h>

namespace drop {

HealthCheckChannel::HealthCheckChannel(const std::string& server_addr,
                                       const std::string& uid,
                                       const std::string& ip_addr,
                                       std::atomic<bool>& running)
    : server_addr_(server_addr), uid_(uid), ip_addr_(ip_addr), running_(running) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = HealthCheck::NewStub(channel);
}

HealthCheckChannel::~HealthCheckChannel() {
  if (heartbeat_thread_.joinable()) {
    heartbeat_thread_.join();
  }
}

void HealthCheckChannel::SetTaskCallback(TaskCallback callback) {
  task_callback_ = callback;
}

void HealthCheckChannel::Start() {
  heartbeat_thread_ = std::thread(&HealthCheckChannel::HeartbeatLoop, this);
  std::cout << "HealthCheck channel started to " << server_addr_ << std::endl;
}

void HealthCheckChannel::HeartbeatLoop() {
  char hostname[HOST_NAME_MAX];
  gethostname(hostname, sizeof(hostname));

  while (running_) {
    HealthCheckRequest request;
    request.set_host_name(hostname);
    request.set_ip_addr(ip_addr_);
    request.set_uid(uid_);
    request.set_agent_version("0.1.0");

    HealthCheckResponse response;
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));

    auto status = stub_->Do(&context, request, &response);
    if (status.ok()) {
      std::cout << "Heartbeat OK, pending=" << response.pending() << std::endl;
      if (response.pending() && task_callback_) {
        task_callback_(response.task_desc());
      }
    } else {
      std::cout << "Heartbeat failed: " << status.error_message() << std::endl;
    }

    // 心跳间隔 5 秒，分段 sleep 快速响应退出
    for (int i = 0; i < 50 && running_; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }
}

}  // namespace drop
