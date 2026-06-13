#include "HotmethodService.h"
#include <iostream>

namespace drop {

void HotmethodService::PushTask(const std::string& target_ip, const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  tasks_[target_ip].push_back(task);
  std::cout << "Task " << task.task_id() << " queued for " << target_ip << std::endl;
}

bool HotmethodService::PopTask(const std::string& target_ip, TaskDesc* task) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = tasks_.find(target_ip);
  if (it == tasks_.end() || it->second.empty()) {
    return false;
  }
  *task = it->second.front();
  it->second.pop_front();
  return true;
}

grpc::Status HotmethodService::NotifyResult(grpc::ServerContext* context,
                                             const TaskResult* request,
                                             google::protobuf::Empty* response) {
  std::cout << "Task " << request->task_id() << " completed";
  if (!request->error_message().empty()) {
    std::cout << " with error: " << request->error_message();
  }
  std::cout << std::endl;

  // TODO: 更新数据库状态
  // TODO: 通知 apiserver

  return grpc::Status::OK;
}

}  // namespace drop
