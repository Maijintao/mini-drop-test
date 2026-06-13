#pragma once

#include <string>
#include <thread>
#include <atomic>

namespace drop {

class ProcessKiller {
public:
  ProcessKiller(pid_t pid, int timeout_sec);
  ~ProcessKiller();

  // 启动超时监控
  void Start();

  // 停止监控（进程正常结束时调用）
  void Stop();

  // 是否已超时
  bool IsTimeout() const;

private:
  void MonitorLoop();

  pid_t pid_;
  int timeout_sec_;
  std::atomic<bool> running_;
  std::atomic<bool> timeout_;
  std::thread monitor_thread_;
};

}  // namespace drop
