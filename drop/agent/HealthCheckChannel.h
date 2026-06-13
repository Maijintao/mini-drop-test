#pragma once

#include <string>
#include <memory>
#include <functional>
#include <grpcpp/grpcpp.h>
#include "healthcheck.grpc.pb.h"

namespace drop {

class HealthCheckChannel {
public:
  using TaskCallback = std::function<void(const TaskDesc&)>;

  HealthCheckChannel(const std::string& server_addr);
  ~HealthCheckChannel();

  void SetTaskCallback(TaskCallback callback);
  void Start();
  void Stop();

private:
  void HeartbeatLoop();

  std::string server_addr_;
  std::unique_ptr<HealthCheck::Stub> stub_;
  TaskCallback task_callback_;
  bool running_ = false;
};

}  // namespace drop
