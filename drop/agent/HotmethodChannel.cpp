#include "HotmethodChannel.h"
#include <iostream>
#include <chrono>

namespace drop {

HotmethodChannel::HotmethodChannel(const std::string& server_addr)
    : server_addr_(server_addr) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = Hotmethod::NewStub(channel);
}

HotmethodChannel::~HotmethodChannel() {
  Stop();
}

void HotmethodChannel::Start() {
  running_ = true;
  worker_thread_ = std::thread(&HotmethodChannel::WorkerLoop, this);
  std::cout << "Hotmethod channel started." << std::endl;
}

void HotmethodChannel::Stop() {
  running_ = false;
  cv_.notify_all();
  if (worker_thread_.joinable()) {
    worker_thread_.join();
  }
}

void HotmethodChannel::PushTask(const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  task_queue_.push(task);
  cv_.notify_one();
}

void HotmethodChannel::WorkerLoop() {
  while (running_) {
    TaskDesc task;
    {
      std::unique_lock<std::mutex> lock(mutex_);
      cv_.wait(lock, [this] { return !task_queue_.empty() || !running_; });
      if (!running_) break;
      task = task_queue_.front();
      task_queue_.pop();
    }

    std::cout << "Executing task " << task.task_id()
              << " type=" << task.task_type()
              << " pid=" << task.sample_argv().pid()
              << " duration=" << task.sample_argv().duration() << "s" << std::endl;

    // TODO: 执行实际采集（fork+exec perf）
    // 现在只是模拟
    std::this_thread::sleep_for(std::chrono::seconds(2));

    // 上报结果
    TaskResult result;
    result.set_task_id(task.task_id());
    result.set_error_message("");  // 空字符串表示成功

    grpc::ClientContext context;
    google::protobuf::Empty empty;
    auto status = stub_->NotifyResult(&context, result, &empty);
    if (status.ok()) {
      std::cout << "Task " << task.task_id() << " result reported." << std::endl;
    } else {
      std::cout << "Failed to report result: " << status.error_message() << std::endl;
    }
  }
}

}  // namespace drop
