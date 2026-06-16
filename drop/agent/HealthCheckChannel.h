#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <atomic>
#include <thread>
#include <grpcpp/grpcpp.h>
#include "healthcheck.grpc.pb.h"

namespace drop {

class HealthCheckChannel {
public:
  using TaskCallback = std::function<void(const TaskDesc&)>;

  HealthCheckChannel(const std::string& server_addr,
                     const std::vector<std::string>& server_addrs,
                     const std::string& uid,
                     const std::string& ip_addr,
                     std::atomic<bool>& running);
  ~HealthCheckChannel();

  void SetTaskCallback(TaskCallback callback);
  void Start();

private:
  void HeartbeatLoop();
  bool Reconnect();

  std::string server_addr_;
  std::vector<std::string> server_addrs_;
  std::string uid_;
  std::string ip_addr_;
  std::atomic<bool>& running_;
  std::unique_ptr<HealthCheck::Stub> stub_;
  TaskCallback task_callback_;
  std::thread heartbeat_thread_;
  int fail_count_ = 0;
  static constexpr int kMaxFailBeforeReconnect = 3;
};

}  // namespace drop
