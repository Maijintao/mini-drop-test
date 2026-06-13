#include "ContainerInfo.h"
#include <fstream>
#include <iostream>
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
    std::ifstream hostname("/proc/self/cgroup");
    while (std::getline(hostname, line)) {
      size_t pos = line.find("docker-");
      if (pos != std::string::npos) {
        info.container_id = line.substr(pos + 7, 12);
        break;
      }
    }
  }

  return info;
}

int ContainerInfo::GetHostPid(int container_pid) {
  // 简化实现：容器内 PID 通常就是宿主机 PID
  // 在实际场景中需要读取 /proc/<pid>/status 的 NSpid 字段
  return container_pid;
}

}  // namespace drop
