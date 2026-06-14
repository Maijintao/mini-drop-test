#pragma once

#include <grpcpp/grpcpp.h>
#include "hotmethod.grpc.pb.h"
#include <map>
#include <deque>
#include <mutex>
#include <chrono>

namespace drop {

static constexpr size_t MAX_TASK_QUEUE_SIZE = 100;

// Agent 心跳状态（每次心跳更新，供 StatAgent 查询）
struct AgentStatus {
  std::string host_name;
  std::string ip_addr;
  std::string agent_version;
  PidStats self_pstats;
  PidStats children_pstats;
  std::chrono::steady_clock::time_point last_heartbeat;
};

class HotmethodService final : public Hotmethod::Service {
public:
  // 添加任务到队列
  bool PushTask(const std::string& target_ip, const TaskDesc& task);

  // 获取待派发任务（心跳时调用）
  bool PopTask(const std::string& target_ip, TaskDesc* task);

  // 获取任务结果
  bool GetResult(const std::string& task_id, TaskResult* result);

  // 更新 Agent 心跳状态（心跳时调用）
  void UpdateAgentStatus(const std::string& ip_addr,
                         const std::string& host_name,
                         const std::string& agent_version,
                         const PidStats& self_pstats,
                         const PidStats& children_pstats);

  // 查询 Agent 状态（StatAgent 时调用）
  bool GetAgentStatus(const std::string& ip_addr, AgentStatus* status);

  grpc::Status NotifyResult(grpc::ServerContext* context,
                            const TaskResult* request,
                            google::protobuf::Empty* response) override;

private:
  std::map<std::string, std::deque<TaskDesc>> tasks_;
  std::map<std::string, TaskResult> results_;  // 缓存任务结果
  std::map<std::string, AgentStatus> agents_;  // Agent 心跳状态
  std::mutex mutex_;
};

}  // namespace drop
