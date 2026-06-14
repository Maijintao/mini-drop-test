#include "ContainerInfo.h"
#include "Log.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <unistd.h>

namespace drop {

ContainerInfo ContainerInfo::Detect() {
  ContainerInfo info;

  // 检查 /.dockerenv 文件
  if (access("/.dockerenv", F_OK) == 0) {
    info.is_container = true;
  }

  // 检查 /proc/1/cgroup
  std::ifstream cgroup("/proc/1/cgroup");
  std::string line;
  while (std::getline(cgroup, line)) {
    if (line.find("docker") != std::string::npos ||
        line.find("kubepods") != std::string::npos) {
      info.is_container = true;
      break;
    }
  }

  if (info.is_container) {
    // 读取容器 ID
    std::ifstream cgroup_self("/proc/self/cgroup");
    while (std::getline(cgroup_self, line)) {
      size_t pos = line.find("docker-");
      if (pos != std::string::npos) {
        info.container_id = line.substr(pos + 7, 12);
        break;
      }
    }

    LOG_INFO("Detected container environment, container_id=" + info.container_id);
  }

  return info;
}

int ContainerInfo::GetHostPid(int container_pid) {
  // 读取 /proc/<pid>/status 中的 NSpid 字段
  // NSpid 格式: NSpid:\t<pid_in_ns1>\t<pid_in_ns2>\t...
  // 最后一个值是宿主机 PID
  std::string path = "/proc/" + std::to_string(container_pid) + "/status";
  std::ifstream file(path);
  if (!file.is_open()) {
    // /proc 不可读时回退到直接返回
    return container_pid;
  }

  std::string line;
  while (std::getline(file, line)) {
    if (line.find("NSpid:") == 0) {
      // 解析 NSpid 行，取最后一个值（宿主机 PID）
      std::istringstream iss(line.substr(6));  // 跳过 "NSpid:"
      int host_pid = container_pid;
      int pid_val;
      while (iss >> pid_val) {
        host_pid = pid_val;
      }
      return host_pid;
    }
  }

  // 没有 NSpid 字段（非容器环境），直接返回
  return container_pid;
}

}  // namespace drop
