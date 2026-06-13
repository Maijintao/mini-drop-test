#pragma once

#include <string>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <grpcpp/grpcpp.h>
#include "hotmethod.grpc.pb.h"
#include "healthcheck.grpc.pb.h"

namespace drop {

class HotmethodChannel {
public:
  HotmethodChannel(const std::string& server_addr);
  ~HotmethodChannel();

  void Start();
  void Stop();
  void PushTask(const TaskDesc& task);

private:
  void WorkerLoop();

  std::string server_addr_;
  std::unique_ptr<Hotmethod::Stub> stub_;
  std::queue<TaskDesc> task_queue_;
  std::mutex mutex_;
  std::condition_variable cv_;
  bool running_ = false;
  std::thread worker_thread_;
};

}  // namespace drop
