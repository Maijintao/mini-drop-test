#include "HotmethodService.h"
#include "Log.h"
#include <iostream>
#include <ctime>

namespace drop {

HotmethodService::HotmethodService() {
  InitDB();
}

HotmethodService::~HotmethodService() {
  if (db_) {
    sqlite3_close(db_);
  }
}

void HotmethodService::InitDB() {
  // 从环境变量读取 DB 路径，默认当前目录
  const char* db_path = std::getenv("TASK_DB_PATH");
  if (!db_path) db_path = "task_states.db";

  int rc = sqlite3_open(db_path, &db_);
  if (rc != SQLITE_OK) {
    LOG_ERROR("Failed to open SQLite: " + std::string(sqlite3_errmsg(db_)));
    db_ = nullptr;
    return;
  }

  const char* create_table =
    "CREATE TABLE IF NOT EXISTS task_states ("
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "  task_id TEXT NOT NULL,"
    "  status INTEGER NOT NULL,"
    "  reason TEXT,"
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))"
    ");"
    "CREATE INDEX IF NOT EXISTS idx_task_id ON task_states(task_id);";

  char* err = nullptr;
  rc = sqlite3_exec(db_, create_table, nullptr, nullptr, &err);
  if (rc != SQLITE_OK) {
    LOG_ERROR("Failed to create table: " + std::string(err ? err : "unknown"));
    sqlite3_free(err);
  } else {
    LOG_INFO("SQLite task_states DB initialized");
  }
}

void HotmethodService::PersistTaskStatus(const std::string& task_id, TaskStatus status, const std::string& reason) {
  if (!db_) return;

  const char* sql = "INSERT INTO task_states (task_id, status, reason, updated_at) VALUES (?, ?, ?, datetime('now'))";
  sqlite3_stmt* stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    LOG_ERROR("SQLite prepare failed: " + std::string(sqlite3_errmsg(db_)));
    return;
  }

  sqlite3_bind_text(stmt, 1, task_id.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 2, static_cast<int>(status));
  sqlite3_bind_text(stmt, 3, reason.c_str(), -1, SQLITE_TRANSIENT);

  rc = sqlite3_step(stmt);
  if (rc != SQLITE_DONE) {
    LOG_ERROR("SQLite insert failed: " + std::string(sqlite3_errmsg(db_)));
  }

  sqlite3_finalize(stmt);
}

bool HotmethodService::PushTask(const std::string& target_ip, const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto& queue = tasks_[target_ip];
  if (queue.size() >= MAX_TASK_QUEUE_SIZE) {
    LOG_ERROR("Task queue full for " + target_ip);
    return false;
  }
  queue.push_back(task);

  // 状态迁移：PENDING（任务创建）
  UpdateTaskStatus(task.task_id(), TaskStatus::PENDING, "任务创建，等待派发");

  LOG_INFO("Task " + task.task_id() + " queued for " + target_ip);
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

  // 状态迁移：DISPATCHED（任务派发给 Agent）
  UpdateTaskStatus(task->task_id(), TaskStatus::DISPATCHED, "任务派发给 Agent " + target_ip);

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
                                          const std::string& uid,
                                          const std::string& agent_version,
                                          const PidStats& self_pstats,
                                          const PidStats& children_pstats) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = agents_.find(ip_addr);
  bool was_online = (it != agents_.end()) && it->second.online;

  auto& agent = agents_[ip_addr];
  agent.host_name = host_name;
  agent.ip_addr = ip_addr;
  agent.uid = uid;
  agent.agent_version = agent_version;
  agent.self_pstats = self_pstats;
  agent.children_pstats = children_pstats;
  agent.last_heartbeat = std::chrono::steady_clock::now();
  agent.online = true;

  // 审计日志：Agent 恢复上线
  if (!was_online) {
    LOG_INFO("[AUDIT] Agent " + host_name + " (" + ip_addr + ") 恢复上线");
  }
}

bool HotmethodService::GetAgentStatus(const std::string& ip_addr, AgentStatus* status) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = agents_.find(ip_addr);
  if (it == agents_.end()) {
    return false;
  }

  // 检查是否离线（30s 无心跳）
  auto now = std::chrono::steady_clock::now();
  auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.last_heartbeat).count();
  if (elapsed > 30) {
    it->second.online = false;
  }

  *status = it->second;
  return true;
}

void HotmethodService::GetAllAgentStatus(std::vector<AgentStatus>* agents) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto now = std::chrono::steady_clock::now();

  for (auto& [ip, agent] : agents_) {
    // 检查是否离线（30s 无心跳）
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - agent.last_heartbeat).count();
    if (elapsed > 30) {
      agent.online = false;
    }
    agents->push_back(agent);
  }
}

bool HotmethodService::IsAgentOnline(const std::string& ip_addr) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = agents_.find(ip_addr);
  if (it == agents_.end()) {
    return false;
  }

  // 检查是否离线（30s 无心跳）
  auto now = std::chrono::steady_clock::now();
  auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.last_heartbeat).count();
  if (elapsed > 30) {
    if (it->second.online) {
      // 审计日志：Agent 离线
      LOG_INFO("[AUDIT] Agent " + it->second.host_name + " (" + ip_addr + ") 离线，无心跳 " + std::to_string(elapsed) + " 秒");
      it->second.online = false;
    }
    return false;
  }

  return true;
}

bool HotmethodService::GetTaskStatus(const std::string& task_id, TaskStateInfo* state) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = tasks_state_.find(task_id);
  if (it == tasks_state_.end()) {
    return false;
  }
  *state = it->second;
  return true;
}

void HotmethodService::UpdateTaskStatus(const std::string& task_id, TaskStatus status, const std::string& reason) {
  // 注意：调用者已持有锁
  auto& state = tasks_state_[task_id];
  state.status = status;
  state.reason = reason;
  state.timestamp = std::chrono::steady_clock::now();

  // 落库：写入 SQLite
  PersistTaskStatus(task_id, status, reason);

  std::string status_str;
  switch (status) {
    case TaskStatus::PENDING:    status_str = "PENDING"; break;
    case TaskStatus::DISPATCHED: status_str = "DISPATCHED"; break;
    case TaskStatus::RUNNING:    status_str = "RUNNING"; break;
    case TaskStatus::UPLOADING:  status_str = "UPLOADING"; break;
    case TaskStatus::DONE:       status_str = "DONE"; break;
    case TaskStatus::FAILED:     status_str = "FAILED"; break;
    case TaskStatus::TIMEOUT:    status_str = "TIMEOUT"; break;
  }
  LOG_INFO("[STATE] Task " + task_id + " -> " + status_str + " (reason: " + reason + ") [persisted]");
}

grpc::Status HotmethodService::NotifyResult(grpc::ServerContext* context,
                                             const TaskResult* request,
                                             google::protobuf::Empty* response) {
  std::lock_guard<std::mutex> lock(mutex_);

  std::string task_id = request->task_id();
  std::string error_msg = request->error_message();

  if (error_msg.empty()) {
    LOG_INFO("Task " + task_id + " completed successfully");
    UpdateTaskStatus(task_id, TaskStatus::DONE, "采集完成");
  } else {
    LOG_ERROR("Task " + task_id + " failed: " + error_msg);
    UpdateTaskStatus(task_id, TaskStatus::FAILED, "采集失败: " + error_msg);
  }

  results_[task_id] = *request;
  return grpc::Status::OK;
}

grpc::Status HotmethodService::UpdateTaskStatus(grpc::ServerContext* context,
                                                 const TaskStatusUpdate* request,
                                                 google::protobuf::Empty* response) {
  std::lock_guard<std::mutex> lock(mutex_);

  // 将 proto 状态映射到内部状态
  TaskStatus internal_status;
  switch (request->status()) {
    case TASK_PENDING:    internal_status = TaskStatus::PENDING; break;
    case TASK_DISPATCHED: internal_status = TaskStatus::DISPATCHED; break;
    case TASK_RUNNING:    internal_status = TaskStatus::RUNNING; break;
    case TASK_UPLOADING:  internal_status = TaskStatus::UPLOADING; break;
    case TASK_DONE:       internal_status = TaskStatus::DONE; break;
    case TASK_FAILED:     internal_status = TaskStatus::FAILED; break;
    case TASK_TIMEOUT:    internal_status = TaskStatus::TIMEOUT; break;
    default:              internal_status = TaskStatus::RUNNING; break;
  }

  UpdateTaskStatus(request->task_id(), internal_status, request->reason());
  return grpc::Status::OK;
}

void HotmethodService::CleanupTimeoutTasks(int timeout_sec) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto now = std::chrono::steady_clock::now();

  // 超时检测：DISPATCHED/RUNNING 超时标记为 TIMEOUT
  for (auto& [task_id, state] : tasks_state_) {
    if (state.status != TaskStatus::DISPATCHED &&
        state.status != TaskStatus::RUNNING) {
      continue;
    }
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - state.timestamp).count();
    if (elapsed > timeout_sec) {
      state.status = TaskStatus::TIMEOUT;
      state.reason = "任务超时，Agent 可能已掉线";
      state.timestamp = now;
      PersistTaskStatus(task_id, TaskStatus::TIMEOUT, state.reason);
      LOG_INFO("[STATE] Task " + task_id + " -> TIMEOUT (reason: 超时 " + std::to_string(elapsed) + "s) [persisted]");
    }
  }

  // TTL 清理：DONE/FAILED/TIMEOUT 超过 1 小时的删除
  constexpr int TTL_SEC = 3600;
  for (auto it = tasks_state_.begin(); it != tasks_state_.end(); ) {
    if (it->second.status == TaskStatus::DONE ||
        it->second.status == TaskStatus::FAILED ||
        it->second.status == TaskStatus::TIMEOUT) {
      auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.timestamp).count();
      if (elapsed > TTL_SEC) {
        results_.erase(it->first);
        it = tasks_state_.erase(it);
        continue;
      }
    }
    ++it;
  }
}

}  // namespace drop
