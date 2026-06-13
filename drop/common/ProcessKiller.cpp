#include "ProcessKiller.h"
#include <iostream>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

namespace drop {

ProcessKiller::ProcessKiller(pid_t pid, int timeout_sec)
    : pid_(pid), timeout_sec_(timeout_sec), running_(false), timeout_(false) {}

ProcessKiller::~ProcessKiller() {
  Stop();
}

void ProcessKiller::Start() {
  running_ = true;
  timeout_ = false;
  monitor_thread_ = std::thread(&ProcessKiller::MonitorLoop, this);
  std::cout << "ProcessKiller: monitoring pid=" << pid_
            << " timeout=" << timeout_sec_ << "s" << std::endl;
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
      std::cout << "ProcessKiller: pid=" << pid_ << " already exited." << std::endl;
      return;
    }
  }

  if (running_) {
    timeout_ = true;
    std::cout << "ProcessKiller: timeout! sending SIGTERM to pid=" << pid_ << std::endl;

    // 发送 SIGTERM
    killpg(getpgid(pid_), SIGTERM);
    sleep(5);

    // 如果还活着，发送 SIGKILL
    if (kill(pid_, 0) == 0) {
      std::cout << "ProcessKiller: sending SIGKILL to pid=" << pid_ << std::endl;
      killpg(getpgid(pid_), SIGKILL);
    }
  }
}

}  // namespace drop
