#pragma once

#include <string>
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

  // running: 外部退出标志的引用
  HealthCheckChannel(const std::string& server_addr,
                     const std::string& uid,
                     const std::string& ip_addr,
                     std::atomic<bool>& running);
  ~HealthCheckChannel();

  void SetTaskCallback(TaskCallback callback);
  void Start();

private:
  void HeartbeatLoop();

  std::string server_addr_;
  std::string uid_;
  std::string ip_addr_;
  std::atomic<bool>& running_;  // 引用外部退出标志
  std::unique_ptr<HealthCheck::Stub> stub_;
  TaskCallback task_callback_;
  std::thread heartbeat_thread_;
};

}  // namespace drop
