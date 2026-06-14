#include "HotmethodService.h"
#include <iostream>

namespace drop {

bool HotmethodService::PushTask(const std::string& target_ip, const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto& queue = tasks_[target_ip];
  if (queue.size() >= MAX_TASK_QUEUE_SIZE) {
    std::cerr << "Task queue full for " << target_ip << std::endl;
    return false;
  }
  queue.push_back(task);
  std::cout << "Task " << task.task_id() << " queued for " << target_ip << std::endl;
  return true;
}

bool HotmethodService::PopTask(const std::string& target_ip, TaskDesc* task) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = tasks_.find(target_ip);
  if (it == tasks_.end() || it->second.empty()) {
    return false;
  }
  *task = it->second.front();
  it->second.pop_front();
  if (it->second.empty()) {
    tasks_.erase(it);  // 清理空条目
  }
  return true;
}

bool HotmethodService::GetResult(const std::string& task_id, TaskResult* result) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = results_.find(task_id);
  if (it == results_.end()) {
    return false;
  }
  *result = it->second;
  return true;
}

void HotmethodService::UpdateAgentStatus(const std::string& ip_addr,
                                          const std::string& host_name,
                                          const std::string& agent_version,
                                          const PidStats& self_pstats,
                                          const PidStats& children_pstats) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto& agent = agents_[ip_addr];
  agent.host_name = host_name;
  agent.ip_addr = ip_addr;
  agent.agent_version = agent_version;
  agent.self_pstats = self_pstats;
  agent.children_pstats = children_pstats;
  agent.last_heartbeat = std::chrono::steady_clock::now();
}

bool HotmethodService::GetAgentStatus(const std::string& ip_addr, AgentStatus* status) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = agents_.find(ip_addr);
  if (it == agents_.end()) {
    return false;
  }
  *status = it->second;
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

  // 缓存任务结果
  {
    std::lock_guard<std::mutex> lock(mutex_);
    results_[request->task_id()] = *request;
  }

  return grpc::Status::OK;
}

}  // namespace drop
