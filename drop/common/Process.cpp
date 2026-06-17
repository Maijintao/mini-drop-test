#include "Process.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <unistd.h>
#include <map>
#include <mutex>
#include <chrono>

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
  size_t paren_end = line.rfind(')');
  if (paren_start == std::string::npos || paren_end == std::string::npos) {
    return false;
  }

  stat->pid = std::stoi(line.substr(0, paren_start));
  stat->comm = line.substr(paren_start + 1, paren_end - paren_start - 1);

  std::istringstream iss(line.substr(paren_end + 2));
  iss >> stat->state;

  // /proc/[pid]/stat 字段：state(2) ppid(3) pgrp(4) session(5) tty(6) tpgid(7)
  //   flags(8) minflt(9) cminflt(10) majflt(11) cmajflt(12) utime(13) stime(14)
  //   cutime(15) cstime(16) priority(17) nice(18) num_threads(19) itrealvalue(20)
  //   starttime(21) vsize(22) rss(23)
  long dummy;
  // state 之后跳过 10 个字段到达 utime(13)
  for (int i = 0; i < 10; i++) {
    iss >> dummy;
  }
  iss >> stat->utime >> stat->stime;

  // stime(14) 之后跳过 8 个字段到达 rss(23)
  for (int i = 0; i < 8; i++) {
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

float Process::CalculateCPU(const ProcStat& prev, const ProcStat& curr, float interval_sec) {
  long delta_utime = curr.utime - prev.utime;
  long delta_stime = curr.stime - prev.stime;
  long total = delta_utime + delta_stime;

  // CPU 使用率 = (delta_ticks / HZ) / interval_sec * 100
  long hz = sysconf(_SC_CLK_TCK);
  if (interval_sec <= 0) interval_sec = 1.0f;
  return (float)total / hz / interval_sec * 100.0f;
}

// 全局采样缓存，用于差值计算
static std::map<int, ProcSnapshot> g_snapshots;
static std::mutex g_stats_mutex;

// 清理超过 60 秒未更新的 PID 缓存（避免内存泄漏）
static void CleanupStaleSnapshots(std::lock_guard<std::mutex>& /*guard*/) {
  auto now = std::chrono::steady_clock::now();
  for (auto it = g_snapshots.begin(); it != g_snapshots.end(); ) {
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.time).count();
    if (elapsed > 60) {
      it = g_snapshots.erase(it);
    } else {
      ++it;
    }
  }
}

PidStats Process::GetPidStats(int pid) {
  PidStats stats;
  stats.set_pid(pid);

  ProcStat stat;
  ProcIO io;
  auto now = std::chrono::steady_clock::now();

  bool has_stat = ReadStat(pid, &stat);
  bool has_io = ReadIO(pid, &io);

  if (has_stat) {
    stats.set_rss_kb(stat.rss * (sysconf(_SC_PAGESIZE) / 1024));
  }

  {
    std::lock_guard<std::mutex> lock(g_stats_mutex);

    // 定期清理过期缓存
    CleanupStaleSnapshots(lock);

    auto it = g_snapshots.find(pid);
    if (it != g_snapshots.end() && has_stat) {
      float interval = std::chrono::duration<float>(now - it->second.time).count();
      if (interval > 0) {
        // CPU 使用率：两次采样差值
        float cpu = CalculateCPU(it->second.stat, stat, interval);
        stats.set_cpu_percent(cpu);

        // IO 速率：两次采样差值 / 间隔时间（KB/s）
        if (has_io) {
          long long delta_read = io.read_bytes - it->second.io.read_bytes;
          long long delta_write = io.write_bytes - it->second.io.write_bytes;
          if (delta_read >= 0) {
            stats.set_read_kb_per_sec((delta_read / 1024.0) / interval);
          }
          if (delta_write >= 0) {
            stats.set_write_kb_per_sec((delta_write / 1024.0) / interval);
          }
        }
      }
    }

    // 保存本次快照
    if (has_stat) {
      ProcSnapshot snap;
      snap.stat = stat;
      snap.io = io;
      snap.time = now;
      g_snapshots[pid] = snap;
    }
  }

  return stats;
}

}  // namespace drop
