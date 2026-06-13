#pragma once

#include <string>
#include <vector>
#include "common.pb.h"

namespace drop {

struct ProcStat {
  int pid;
  std::string comm;
  char state;
  long utime;
  long stime;
  long rss;
};

struct ProcIO {
  long long read_bytes;
  long long write_bytes;
};

class Process {
public:
  // 读取 /proc/<pid>/stat
  static bool ReadStat(int pid, ProcStat* stat);

  // 读取 /proc/<pid>/io
  static bool ReadIO(int pid, ProcIO* io);

  // 计算 CPU 使用率（需要两次采样）
  static float CalculateCPU(const ProcStat& prev, const ProcStat& curr);

  // 获取 PidStats
  static PidStats GetPidStats(int pid);
};

}  // namespace drop
