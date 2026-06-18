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

bool HotmethodService::PersistTaskStatus(const std::string& task_id, TaskStatus status, const std::string& reason) {
  if (!db_) return false;

  const char* sql = "INSERT INTO task_states (task_id, status, reason, updated_at) VALUES (?, ?, ?, datetime('now'))";
  sqlite3_stmt* stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    LOG_ERROR("SQLite prepare failed: " + std::string(sqlite3_errmsg(db_)));
    return false;
  }

  sqlite3_bind_text(stmt, 1, task_id.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 2, static_cast<int>(status));
  sqlite3_bind_text(stmt, 3, reason.c_str(), -1, SQLITE_TRANSIENT);

  rc = sqlite3_step(stmt);
  if (rc != SQLITE_DONE) {
    LOG_ERROR("SQLite insert failed: " + std::string(sqlite3_errmsg(db_)));
    sqlite3_finalize(stmt);
    return false;
  }

  sqlite3_finalize(stmt);
  return true;
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

  // 内部保留 DISPATCHED 做派发超时保护；FetchData 对外映射为 PENDING。
  UpdateTaskStatus(task->task_id(), TaskStatus::DISPATCHED, "任务已派发给 Agent " + target_ip);

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
  if (elapsed > 30 && it->second.online) {
    LOG_INFO("[AUDIT] Agent " + it->second.host_name + " (" + ip_addr + ") 离线，无心跳 " + std::to_string(elapsed) + " 秒");
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
    if (elapsed > 30 && agent.online) {
      LOG_INFO("[AUDIT] Agent " + agent.host_name + " (" + ip + ") 离线，无心跳 " + std::to_string(elapsed) + " 秒");
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
  bool persisted = PersistTaskStatus(task_id, status, reason);

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
  LOG_INFO("[STATE] Task " + task_id + " -> " + status_str + " (reason: " + reason + ") [" +
           (persisted ? "persisted" : "persist_failed") + "]");
}

grpc::Status HotmethodService::Collect(grpc::ServerContext* context,
                                        const CollectRequest* request,
                                        CollectResponse* response) {
  // 入队
  bool ok = PushTask(request->target_ip(), request->task_desc());
  if (!ok) {
    response->set_code(-1);
    response->set_message("task queue full or push failed");
    return grpc::Status::OK;
  }

  uint32_t wait_sec = request->timeout_sec();
  if (wait_sec == 0) {
    // 仅入队，不等待结果
    response->set_code(0);
    response->set_message("task queued (async)");
    return grpc::Status::OK;
  }

  // 同步等待结果：condition_variable 通知，避免轮询
  std::string task_id = request->task_desc().task_id();
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(wait_sec);

  std::unique_lock<std::mutex> lock(mutex_);
  bool finished = cv_.wait_until(lock, deadline, [&]() {
    if (results_.find(task_id) != results_.end()) return true;
    auto state_it = tasks_state_.find(task_id);
    if (state_it != tasks_state_.end()) {
      auto s = state_it->second.status;
      if (s == TaskStatus::TIMEOUT || s == TaskStatus::FAILED) return true;
    }
    return false;
  });

  if (!finished) {
    response->set_code(-1);
    response->set_message("collect timed out waiting for result");
    return grpc::Status::OK;
  }

  // 检查结果
  auto it = results_.find(task_id);
  if (it != results_.end()) {
    response->set_code(0);
    response->set_message("OK");
    *response->mutable_result() = it->second;
    return grpc::Status::OK;
  }

  // 检查失败/超时状态
  auto state_it = tasks_state_.find(task_id);
  if (state_it != tasks_state_.end()) {
    auto s = state_it->second.status;
    response->set_code(s == TaskStatus::TIMEOUT ? -1 : -2);
    response->set_message(state_it->second.reason);
    return grpc::Status::OK;
  }

  response->set_code(-1);
  response->set_message("collect timed out waiting for result");
  return grpc::Status::OK;
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
  cv_.notify_all();  // 通知等待中的 Collect

  // Continuous Profiling: 检测窗口完成，记录窗口并按需派发下一个窗口。
  // 窗口 ID 格式: parent_tid_wN
  auto wpos = task_id.rfind("_w");
  if (wpos != std::string::npos && wpos > 0) {
    std::string parent_tid = task_id.substr(0, wpos);
    auto it = continuous_tasks_.find(parent_tid);
    if (it != continuous_tasks_.end()) {
      int32_t seq = 0;
      try { seq = std::stoi(task_id.substr(wpos + 2)); } catch (...) {}
      int64_t now_ts = std::chrono::system_clock::now().time_since_epoch().count() / 1000000000;

      ContinuousWindowRecord info;
      info.window_tid = task_id;
      info.seq = seq;
      info.start_time = now_ts - it->second->window_sec;
      info.end_time = now_ts;
      info.status = error_msg.empty() ? 1 : 2;
      info.cos_key = request->cos_key();
      continuous_windows_[parent_tid].push_back(info);

      if (!it->second->running) {
        return grpc::Status::OK;
      }

      // 派发下一个窗口
      std::string next_tid = parent_tid + "_w" + std::to_string(seq + 1);
      TaskDesc next_task;
      next_task.set_task_id(next_tid);
      next_task.set_task_type(2);
      next_task.set_profiler_type(it->second->profiler_type);
      next_task.set_timeout_sec(it->second->window_sec + 60);
      auto* argv = next_task.mutable_sample_argv();
      argv->set_hz(it->second->hz);
      argv->set_duration(it->second->window_sec);
      argv->set_pid(it->second->pid);
      argv->set_callgraph(it->second->callgraph);
      argv->set_event(it->second->event);
      argv->set_window_sec(it->second->window_sec);
      argv->set_parent_tid(parent_tid);

      auto& queue = tasks_[it->second->target_ip];
      if (queue.size() < MAX_TASK_QUEUE_SIZE) {
        queue.push_back(next_task);
        UpdateTaskStatus(next_tid, TaskStatus::PENDING, "continuous window created, waiting dispatch");
        LOG_INFO("Continuous next window dispatched: " + next_tid);
      }
    }
  }

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

  // 超时检测：处理未被 Agent 拉走的 PENDING 和已派发但未开始执行的 DISPATCHED。
  // RUNNING 由 Agent 自身超时保护负责。
  for (auto& [task_id, state] : tasks_state_) {
    if (state.status != TaskStatus::PENDING && state.status != TaskStatus::DISPATCHED) {
      continue;
    }
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - state.timestamp).count();
    if (elapsed > timeout_sec) {
      TaskStatus old_status = state.status;
      state.status = TaskStatus::FAILED;
      if (old_status == TaskStatus::PENDING) {
        state.reason = "任务等待超时，Agent 未拉取或不存在";
      } else {
        state.reason = "任务派发超时，Agent 未开始执行";
      }
      state.timestamp = now;
      PersistTaskStatus(task_id, TaskStatus::FAILED, state.reason);

      // 如果任务仍在待派发队列中，移除它，避免离线 Agent 恢复后执行已失败任务。
      for (auto queue_it = tasks_.begin(); queue_it != tasks_.end(); ) {
        auto& queue = queue_it->second;
        for (auto task_it = queue.begin(); task_it != queue.end(); ) {
          if (task_it->task_id() == task_id) {
            task_it = queue.erase(task_it);
          } else {
            ++task_it;
          }
        }
        if (queue.empty()) {
          queue_it = tasks_.erase(queue_it);
        } else {
          ++queue_it;
        }
      }

      LOG_INFO("[STATE] Task " + task_id + " -> FAILED (reason: " + state.reason +
               "，elapsed=" + std::to_string(elapsed) + "s) [persisted]");
      cv_.notify_all();
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

// ---------- Continuous Profiling ----------

std::string HotmethodService::StartContinuousTask(const std::string& target_ip, int32_t pid,
                                                    uint32_t hz, uint32_t window_sec,
                                                    uint32_t profiler_type,
                                                    const std::string& callgraph,
                                                    const std::string& event) {
  std::lock_guard<std::mutex> lock(mutex_);

  // 生成父任务 ID
  std::string parent_tid = "cp_" + std::to_string(
      std::chrono::steady_clock::now().time_since_epoch().count() % 1000000);

  auto config = std::make_shared<ContinuousTaskConfig>();
  config->parent_tid = parent_tid;
  config->target_ip = target_ip;
  config->pid = pid;
  config->hz = hz;
  config->window_sec = window_sec > 0 ? window_sec : 300;
  config->profiler_type = profiler_type;
  config->callgraph = callgraph;
  config->event = event;
  config->running = true;

  continuous_tasks_[parent_tid] = config;
  continuous_windows_[parent_tid] = {};

  // 派发第一个窗口任务
  std::string window_tid = parent_tid + "_w0";
  TaskDesc task;
  task.set_task_id(window_tid);
  task.set_task_type(2);  // CONTINUOUS
  task.set_profiler_type(profiler_type);
  task.set_timeout_sec(config->window_sec + 60);

  auto* argv = task.mutable_sample_argv();
  argv->set_hz(hz);
  argv->set_duration(config->window_sec);
  argv->set_pid(pid);
  argv->set_callgraph(callgraph);
  argv->set_event(event);
  argv->set_window_sec(config->window_sec);
  argv->set_parent_tid(parent_tid);

  auto& queue = tasks_[target_ip];
  if (queue.size() >= MAX_TASK_QUEUE_SIZE) {
    return "";
  }
  queue.push_back(task);
  UpdateTaskStatus(window_tid, TaskStatus::PENDING, "continuous first window created, waiting dispatch");

  LOG_INFO("Continuous task started: parent=" + parent_tid + " first_window=" + window_tid);
  return parent_tid;
}

bool HotmethodService::StopContinuousTask(const std::string& task_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = continuous_tasks_.find(task_id);
  if (it == continuous_tasks_.end()) {
    return false;
  }
  it->second->running = false;
  LOG_INFO("Continuous task stopped: " + task_id);
  return true;
}

void HotmethodService::GetContinuousWindows(const std::string& task_id,
                                             std::vector<ContinuousWindowRecord>* windows) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = continuous_windows_.find(task_id);
  if (it != continuous_windows_.end()) {
    *windows = it->second;
  }
}

void HotmethodService::RecordContinuousWindow(const std::string& parent_tid,
                                               const std::string& window_tid,
                                               int32_t seq, int64_t start_time,
                                               int64_t end_time, int32_t status,
                                               const std::string& cos_key) {
  std::lock_guard<std::mutex> lock(mutex_);
  ContinuousWindowRecord info;
  info.window_tid = window_tid;
  info.seq = seq;
  info.start_time = start_time;
  info.end_time = end_time;
  info.status = status;
  info.cos_key = cos_key;
  continuous_windows_[parent_tid].push_back(info);
}

}  // namespace drop
