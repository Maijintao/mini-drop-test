#include "Process.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <unistd.h>

namespace drop {

bool Process::ReadStat(int pid, ProcStat* stat) {
  std::string path = "/proc/" + std::to_string(pid) + "/stat";
  std::ifstream file(path);
  if (!file.is_open()) {
    return false;
  }

  std::string line;
  std::getline(file, line);

  // 解析 pid (comm) state utime stime ...
  size_t paren_start = line.find('(');
  size_t paren_end = line.find(')');
  if (paren_start == std::string::npos || paren_end == std::string::npos) {
    return false;
  }

  stat->pid = std::stoi(line.substr(0, paren_start));
  stat->comm = line.substr(paren_start + 1, paren_end - paren_start - 1);

  std::istringstream iss(line.substr(paren_end + 2));
  iss >> stat->state;

  // 跳过字段直到 utime (第 14 个字段)
  long dummy;
  for (int i = 0; i < 11; i++) {
    iss >> dummy;
  }
  iss >> stat->utime >> stat->stime;

  // 跳过字段直到 rss (第 24 个字段)
  for (int i = 0; i < 7; i++) {
    iss >> dummy;
  }
  iss >> stat->rss;

  return true;
}

bool Process::ReadIO(int pid, ProcIO* io) {
  std::string path = "/proc/" + std::to_string(pid) + "/io";
  std::ifstream file(path);
  if (!file.is_open()) {
    return false;
  }

  std::string line;
  while (std::getline(file, line)) {
    if (line.find("read_bytes:") == 0) {
      io->read_bytes = std::stoll(line.substr(11));
    } else if (line.find("write_bytes:") == 0) {
      io->write_bytes = std::stoll(line.substr(12));
    }
  }

  return true;
}

float Process::CalculateCPU(const ProcStat& prev, const ProcStat& curr) {
  long delta_utime = curr.utime - prev.utime;
  long delta_stime = curr.stime - prev.stime;
  long total = delta_utime + delta_stime;

  // 假设采样间隔 1 秒，CPU 使用率 = 总 ticks / HZ
  long hz = sysconf(_SC_CLK_TCK);
  return (float)total / hz * 100.0f;
}

PidStats Process::GetPidStats(int pid) {
  PidStats stats;
  stats.set_pid(pid);

  ProcStat stat;
  if (ReadStat(pid, &stat)) {
    stats.set_rss_kb(stat.rss * (sysconf(_SC_PAGESIZE) / 1024));
  }

  ProcIO io;
  if (ReadIO(pid, &io)) {
    stats.set_read_kb_per_sec(io.read_bytes / 1024);
    stats.set_write_kb_per_sec(io.write_bytes / 1024);
  }

  return stats;
}

}  // namespace drop
