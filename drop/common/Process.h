#pragma once

#include <string>
#include <vector>
#include <chrono>
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

// 用于速率计算的采样快照
struct ProcSnapshot {
  ProcStat stat;
  ProcIO io;
  std::chrono::steady_clock::time_point time;
};

class Process {
public:
  // 读取 /proc/<pid>/stat
  static bool ReadStat(int pid, ProcStat* stat);

  // 读取 /proc/<pid>/io
  static bool ReadIO(int pid, ProcIO* io);

  // 计算 CPU 使用率（需要两次采样和间隔秒数）
  static float CalculateCPU(const ProcStat& prev, const ProcStat& curr, float interval_sec = 1.0f);

  // 获取 PidStats
  static PidStats GetPidStats(int pid);
};

}  // namespace drop
