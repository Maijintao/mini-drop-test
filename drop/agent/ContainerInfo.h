#pragma once

#include <string>

namespace drop {

struct ContainerInfo {
  std::string container_id;
  std::string container_name;
  std::string cgroup_path;
  bool is_container = false;

  // 检测当前进程是否运行在容器中
  static ContainerInfo Detect();

  // 获取容器内 PID 对应的宿主机 PID
  static int GetHostPid(int container_pid);
};

}  // namespace drop
