#include "HealthCheckChannel.h"
#include "Process.h"
#include "Log.h"
#include <chrono>
#include <iostream>
#include <fstream>
#include <unistd.h>

#ifndef HOST_NAME_MAX
#define HOST_NAME_MAX 256
#endif

namespace drop {

HealthCheckChannel::HealthCheckChannel(const std::string& server_addr,
                                       const std::vector<std::string>& server_addrs,
                                       const std::string& uid,
                                       const std::string& ip_addr,
                                       std::atomic<bool>& running)
    : server_addr_(server_addr), server_addrs_(server_addrs),
      uid_(uid), ip_addr_(ip_addr), running_(running) {
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
  LOG_INFO("HealthCheck channel started to " + server_addr_);
}

bool HealthCheckChannel::Reconnect() {
  for (const auto& addr : server_addrs_) {
    if (addr == server_addr_) continue;
    auto channel = grpc::CreateChannel(addr, grpc::InsecureChannelCredentials());
    auto deadline = std::chrono::system_clock::now() + std::chrono::seconds(2);
    if (channel->WaitForConnected(deadline)) {
      server_addr_ = addr;
      stub_ = HealthCheck::NewStub(channel);
      LOG_INFO("[Reconnect] Switched to server: " + addr);
      return true;
    }
  }
  // 尝试重连当前 server
  auto channel = grpc::CreateChannel(server_addr_, grpc::InsecureChannelCredentials());
  auto deadline = std::chrono::system_clock::now() + std::chrono::seconds(2);
  if (channel->WaitForConnected(deadline)) {
    stub_ = HealthCheck::NewStub(channel);
    LOG_INFO("[Reconnect] Reconnected to: " + server_addr_);
    return true;
  }
  return false;
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
    PidStats self_stats = Process::GetPidStats(getpid());
    *request.mutable_self_pstats() = self_stats;

    // 采集子进程数据（聚合所有子进程的资源使用）
    PidStats children_agg;
    children_agg.set_cpu_percent(0.0);
    children_agg.set_rss_kb(0);
    children_agg.set_read_kb_per_sec(0.0);
    children_agg.set_write_kb_per_sec(0.0);

    // N18: 正确路径是 /proc/<pid>/children，不需要 /task/<pid>/
    std::string children_path = "/proc/" + std::to_string(getpid()) + "/children";
    std::ifstream children_file(children_path);
    if (children_file.is_open()) {
      std::string child_pid_str;
      while (children_file >> child_pid_str) {
        try {
          int child_pid = std::stoi(child_pid_str);
          PidStats child = Process::GetPidStats(child_pid);
          child.set_pid(child_pid);
          // 累加子进程资源指标
          children_agg.set_cpu_percent(children_agg.cpu_percent() + child.cpu_percent());
          children_agg.set_rss_kb(children_agg.rss_kb() + child.rss_kb());
          children_agg.set_read_kb_per_sec(children_agg.read_kb_per_sec() + child.read_kb_per_sec());
          children_agg.set_write_kb_per_sec(children_agg.write_kb_per_sec() + child.write_kb_per_sec());
        } catch (const std::exception& e) {
          // 跳过解析失败的 PID
        }
      }
    }
    *request.mutable_children_pstats() = children_agg;

    HealthCheckResponse response;
    grpc::ClientContext context;
    // N17: deadline 3s，避免与 1s 心跳间隔重叠导致实际间隔翻倍
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(3));

    auto status = stub_->Do(&context, request, &response);
    if (status.ok()) {
      fail_count_ = 0;
      if (response.pending() && task_callback_) {
        LOG_INFO("Heartbeat OK, pending task: " + response.task_desc().task_id());
        task_callback_(response.task_desc());
      }
    } else {
      fail_count_++;
      LOG_ERROR("Heartbeat failed (" + std::to_string(fail_count_) + "): " + status.error_message());
      if (fail_count_ >= kMaxFailBeforeReconnect) {
        LOG_WARN("Too many failures, attempting reconnect...");
        if (Reconnect()) {
          fail_count_ = 0;
        } else {
          LOG_ERROR("Reconnect failed, will retry next cycle");
        }
      }
    }

    // 心跳间隔 1 秒（1 Hz），分段 sleep 快速响应退出
    for (int i = 0; i < 10 && running_; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }
}

}  // namespace drop
