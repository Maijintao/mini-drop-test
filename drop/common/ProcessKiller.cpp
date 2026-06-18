#include "ProcessKiller.h"
#include "Log.h"
#include <iostream>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

namespace drop {

ProcessKiller::ProcessKiller(pid_t pid, int timeout_sec)
    : pid_(pid), pgid_(getpgid(pid)), timeout_sec_(timeout_sec), running_(false), timeout_(false) {}

ProcessKiller::ProcessKiller(pid_t pid, pid_t pgid, int timeout_sec)
    : pid_(pid), pgid_(pgid), timeout_sec_(timeout_sec), running_(false), timeout_(false) {}

ProcessKiller::~ProcessKiller() {
  Stop();
}

void ProcessKiller::Start() {
  running_ = true;
  timeout_ = false;
  monitor_thread_ = std::thread(&ProcessKiller::MonitorLoop, this);
  LOG_DEBUG("ProcessKiller: monitoring pid=" + std::to_string(pid_) +
            " timeout=" + std::to_string(timeout_sec_) + "s");
}

void ProcessKiller::Stop() {
  running_ = false;
  if (monitor_thread_.joinable()) {
    monitor_thread_.join();
  }
}

bool ProcessKiller::IsTimeout() const {
  return timeout_;
}

void ProcessKiller::MonitorLoop() {
  int elapsed = 0;
  while (running_ && elapsed < timeout_sec_) {
    sleep(1);
    elapsed++;

    // 检查进程是否还存在
    if (kill(pid_, 0) != 0) {
      LOG_DEBUG("ProcessKiller: pid=" + std::to_string(pid_) + " already exited.");
      return;
    }
  }

  if (running_) {
    timeout_ = true;
    LOG_WARN("ProcessKiller: timeout! sending SIGTERM to pid=" + std::to_string(pid_));

    // 发送 SIGTERM（使用启动时记录的 pgid，避免 PID 复用误杀）
    if (pgid_ > 0) {
      killpg(pgid_, SIGTERM);
    } else {
      kill(pid_, SIGTERM);
    }
    sleep(5);

    // 如果还活着，发送 SIGKILL
    if (kill(pid_, 0) == 0) {
      LOG_WARN("ProcessKiller: sending SIGKILL to pid=" + std::to_string(pid_));
      if (pgid_ > 0) {
        killpg(pgid_, SIGKILL);
      } else {
        kill(pid_, SIGKILL);
      }
    }
  }
}

}  // namespace drop
