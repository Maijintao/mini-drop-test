#include "HealthCheckChannel.h"
#include <thread>
#include <chrono>
#include <iostream>
#include <unistd.h>
#include <limits.h>

namespace drop {

HealthCheckChannel::HealthCheckChannel(const std::string& server_addr)
    : server_addr_(server_addr) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = HealthCheck::NewStub(channel);
}

HealthCheckChannel::~HealthCheckChannel() {
  Stop();
}

void HealthCheckChannel::SetTaskCallback(TaskCallback callback) {
  task_callback_ = callback;
}

void HealthCheckChannel::Start() {
  running_ = true;
  std::cout << "HealthCheck channel started to " << server_addr_ << std::endl;
  HeartbeatLoop();
}

void HealthCheckChannel::Stop() {
  running_ = false;
}

void HealthCheckChannel::HeartbeatLoop() {
  char hostname[HOST_NAME_MAX];
  gethostname(hostname, sizeof(hostname));

  while (running_) {
    HealthCheckRequest request;
    request.set_host_name(hostname);
    request.set_ip_addr("127.0.0.1");
    request.set_uid("agent-001");
    request.set_agent_version("0.1.0");

    HealthCheckResponse response;
    grpc::ClientContext context;

    auto status = stub_->Do(&context, request, &response);
    if (status.ok()) {
      std::cout << "Heartbeat OK, pending=" << response.pending() << std::endl;
      if (response.pending() && task_callback_) {
        task_callback_(response.task_desc());
      }
    } else {
      std::cout << "Heartbeat failed: " << status.error_message() << std::endl;
    }

    std::this_thread::sleep_for(std::chrono::seconds(1));
  }
}

}  // namespace drop
