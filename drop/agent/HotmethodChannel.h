#pragma once

#include <string>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <memory>
#include <grpcpp/grpcpp.h>
#include "hotmethod.grpc.pb.h"
#include "healthcheck.grpc.pb.h"
#include "StorageClient.h"
#include "Config.h"

namespace drop {

static constexpr size_t MAX_TASK_QUEUE_SIZE = 100;

class HotmethodChannel {
public:
  // running: 外部退出标志的引用
  HotmethodChannel(const std::string& server_addr, const Config& config, std::atomic<bool>& running);
  ~HotmethodChannel();

  void Start();
  void PushTask(const TaskDesc& task);

private:
  void WorkerLoop();
  void ReportResult(const TaskResult& result);
  void ReportStatus(const std::string& task_id, TaskState state, const std::string& reason);

  std::string server_addr_;
  Config config_;
  std::atomic<bool>& running_;  // 引用外部退出标志
  std::unique_ptr<Hotmethod::Stub> stub_;
  std::unique_ptr<StorageClient> storage_;
  std::queue<TaskDesc> task_queue_;
  std::mutex mutex_;
  std::condition_variable cv_;
  std::thread worker_thread_;
};

}  // namespace drop
