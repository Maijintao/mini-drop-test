#pragma once

#include <grpcpp/grpcpp.h>
#include "hotmethod.grpc.pb.h"
#include "healthcheck.grpc.pb.h"
#include <map>
#include <deque>
#include <vector>
#include <mutex>
#include <condition_variable>
#include <memory>
#include <string>
#include <chrono>
#include <sqlite3.h>

namespace drop {

static constexpr size_t MAX_TASK_QUEUE_SIZE = 100;

// 任务状态枚举（对应题目要求的状态机）
enum class TaskStatus {
  PENDING = 0,      // 新建，等待派发
  DISPATCHED = 1,   // 已派发给 Agent，等待执行
  RUNNING = 2,      // Agent 正在执行采集
  UPLOADING = 3,    // 采集完成，正在上传
  DONE = 4,         // 成功完成
  FAILED = 5,       // 失败
  TIMEOUT = 6       // 超时
};

// 任务状态记录（用于落库和审计）
struct TaskStateInfo {
  TaskStatus status = TaskStatus::PENDING;
  std::string reason;           // 状态迁移原因
  std::chrono::steady_clock::time_point timestamp;  // 状态更新时间
};

// Agent 心跳状态（每次心跳更新，供 StatAgent 查询）
struct AgentStatus {
  std::string host_name;
  std::string ip_addr;
  std::string uid;
  std::string agent_version;
  PidStats self_pstats;
  PidStats children_pstats;
  std::chrono::steady_clock::time_point last_heartbeat;
  bool online = true;           // 是否在线
};

// Continuous Profiling 窗口信息
struct ContinuousWindowRecord {
  std::string window_tid;
  int32_t seq = 0;
  int64_t start_time = 0;
  int64_t end_time = 0;
  int32_t status = 0;  // 0=pending, 1=done, 2=failed
  std::string cos_key;
};

// Continuous 任务配置
struct ContinuousTaskConfig {
  std::string parent_tid;
  std::string target_ip;
  int32_t pid = 0;
  uint32_t hz = 10;
  uint32_t window_sec = 300;
  uint32_t profiler_type = 0;
  std::string callgraph;
  std::string event;
  std::atomic<bool> running{true};
};

class HotmethodService final : public Hotmethod::Service {
public:
  HotmethodService();
  ~HotmethodService();

  // 添加任务到队列
  bool PushTask(const std::string& target_ip, const TaskDesc& task);

  // 获取待派发任务（心跳时调用）
  bool PopTask(const std::string& target_ip, TaskDesc* task);

  // 获取任务结果
  bool GetResult(const std::string& task_id, TaskResult* result);

  // 更新 Agent 心跳状态（心跳时调用）
  void UpdateAgentStatus(const std::string& ip_addr,
                         const std::string& host_name,
                         const std::string& uid,
                         const std::string& agent_version,
                         const PidStats& self_pstats,
                         const PidStats& children_pstats);

  // 查询 Agent 状态（StatAgent 时调用）
  bool GetAgentStatus(const std::string& ip_addr, AgentStatus* status);

  // 获取所有 Agent 状态（ListAgents 时调用）
  void GetAllAgentStatus(std::vector<AgentStatus>* agents);

  // 检查 Agent 是否在线（30s 无心跳判离线）
  bool IsAgentOnline(const std::string& ip_addr);

  // 获取任务状态
  bool GetTaskStatus(const std::string& task_id, TaskStateInfo* state);

  // 更新任务状态（带 reason）
  void UpdateTaskStatus(const std::string& task_id, TaskStatus status, const std::string& reason);

  // 超时清理：检查 PENDING/DISPATCHED 超过 timeout_sec 的任务
  void CleanupTimeoutTasks(int timeout_sec = 30);

  // Continuous Profiling
  std::string StartContinuousTask(const std::string& target_ip, int32_t pid,
                                   uint32_t hz, uint32_t window_sec,
                                   uint32_t profiler_type,
                                   const std::string& callgraph,
                                   const std::string& event);
  bool StopContinuousTask(const std::string& task_id);
  void GetContinuousWindows(const std::string& task_id, std::vector<ContinuousWindowRecord>* windows);
  void RecordContinuousWindow(const std::string& parent_tid, const std::string& window_tid,
                               int32_t seq, int64_t start_time, int64_t end_time,
                               int32_t status, const std::string& cos_key);

  grpc::Status Collect(grpc::ServerContext* context,
                       const CollectRequest* request,
                       CollectResponse* response) override;

  grpc::Status NotifyResult(grpc::ServerContext* context,
                            const TaskResult* request,
                            google::protobuf::Empty* response) override;

  grpc::Status UpdateTaskStatus(grpc::ServerContext* context,
                                const TaskStatusUpdate* request,
                                google::protobuf::Empty* response) override;

private:
  void InitDB();
  bool PersistTaskStatus(const std::string& task_id, TaskStatus status, const std::string& reason);

  sqlite3* db_ = nullptr;
  std::map<std::string, std::deque<TaskDesc>> tasks_;
  std::map<std::string, TaskResult> results_;      // 缓存任务结果
  std::map<std::string, AgentStatus> agents_;      // Agent 心跳状态
  std::map<std::string, TaskStateInfo> tasks_state_;   // 任务状态跟踪
  std::map<std::string, std::shared_ptr<ContinuousTaskConfig>> continuous_tasks_;  // 持续采集任务
  std::map<std::string, std::vector<ContinuousWindowRecord>> continuous_windows_;  // 窗口记录
  std::mutex mutex_;
  std::condition_variable cv_;  // 用于 Collect 同步等待结果
};

}  // namespace drop
