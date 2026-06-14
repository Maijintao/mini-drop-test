#include "HealthCheckChannel.h"
#include "Process.h"
#include <chrono>
#include <iostream>
#include <fstream>
#include <unistd.h>

#ifndef HOST_NAME_MAX
#define HOST_NAME_MAX 256
#endif

namespace drop {

HealthCheckChannel::HealthCheckChannel(const std::string& server_addr,
                                       const std::string& uid,
                                       const std::string& ip_addr,
                                       std::atomic<bool>& running)
    : server_addr_(server_addr), uid_(uid), ip_addr_(ip_addr), running_(running) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = HealthCheck::NewStub(channel);
}

HealthCheckChannel::~HealthCheckChannel() {
  if (heartbeat_thread_.joinable()) {
    heartbeat_thread_.join();
  }
}

void HealthCheckChannel::SetTaskCallback(TaskCallback callback) {
  task_callback_ = callback;
}

void HealthCheckChannel::Start() {
  heartbeat_thread_ = std::thread(&HealthCheckChannel::HeartbeatLoop, this);
  std::cout << "HealthCheck channel started to " << server_addr_ << std::endl;
}

void HealthCheckChannel::HeartbeatLoop() {
  char hostname[HOST_NAME_MAX];
  gethostname(hostname, sizeof(hostname));

  while (running_) {
    HealthCheckRequest request;
    request.set_host_name(hostname);
    request.set_ip_addr(ip_addr_);
    request.set_uid(uid_);
    request.set_agent_version("0.1.0");

    // 填充自监控数据
    PidStats* self_stats = request.mutable_self_pstats();
    self_stats->set_pid(getpid());
    PidStats stats = Process::GetPidStats(getpid());
    self_stats->set_cpu_percent(stats.cpu_percent());
    self_stats->set_rss_kb(stats.rss_kb());
    self_stats->set_read_kb_per_sec(stats.read_kb_per_sec());
    self_stats->set_write_kb_per_sec(stats.write_kb_per_sec());

    // 采集子进程数据
    PidStats* children_stats = request.mutable_children_pstats();
    std::string proc_path = "/proc/" + std::to_string(getpid()) + "/task";
    std::ifstream task_dir(proc_path);
    if (task_dir.is_open()) {
      std::string tid;
      while (std::getline(task_dir, tid)) {
        // 读取子线程的 stat
        std::string children_path = proc_path + "/" + tid + "/children";
        std::ifstream children_file(children_path);
        if (children_file.is_open()) {
          std::string child_pid;
          while (children_file >> child_pid) {
            PidStats child = Process::GetPidStats(std::stoi(child_pid));
            child.set_pid(std::stoi(child_pid));
            *children_stats = child;  // 简化：只采集一个子进程
          }
        }
      }
    }

    HealthCheckResponse response;
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));

    auto status = stub_->Do(&context, request, &response);
    if (status.ok()) {
      std::cout << "Heartbeat OK, pending=" << response.pending() << std::endl;
      if (response.pending() && task_callback_) {
        task_callback_(response.task_desc());
      }
    } else {
      std::cout << "Heartbeat failed: " << status.error_message() << std::endl;
    }

    // 心跳间隔 1 秒 (1Hz)，分段 sleep 快速响应退出
    for (int i = 0; i < 10 && running_; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }
}

}  // namespace drop
