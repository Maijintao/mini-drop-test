#include "ResourceProfiler.h"
#include "Log.h"

#include <algorithm>
#include <chrono>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>

namespace drop {
namespace {

struct ProcSample {
  double timestamp = 0;
  unsigned long long proc_ticks = 0;
  unsigned long long total_ticks = 0;
  long rss_kb = 0;
  unsigned long long read_bytes = 0;
  unsigned long long write_bytes = 0;
  int threads = 0;
};

double NowSeconds() {
  using clock = std::chrono::system_clock;
  return std::chrono::duration<double>(clock::now().time_since_epoch()).count();
}

bool ReadTotalTicks(unsigned long long& total) {
  std::ifstream in("/proc/stat");
  std::string cpu;
  if (!(in >> cpu) || cpu != "cpu") return false;

  total = 0;
  unsigned long long value = 0;
  while (in >> value) total += value;
  return total > 0;
}

bool ReadProcStat(int pid, unsigned long long& proc_ticks, int& threads) {
  std::ifstream in("/proc/" + std::to_string(pid) + "/stat");
  std::string line;
  if (!std::getline(in, line)) return false;

  size_t rparen = line.rfind(')');
  if (rparen == std::string::npos || rparen + 2 >= line.size()) return false;
  std::istringstream rest(line.substr(rparen + 2));

  std::string fields[52];
  int count = 0;
  while (count < 52 && rest >> fields[count]) count++;
  if (count < 18) return false;

  unsigned long long utime = std::stoull(fields[11]);
  unsigned long long stime = std::stoull(fields[12]);
  proc_ticks = utime + stime;
  threads = std::stoi(fields[17]);
  return true;
}

bool ReadStatusRSS(int pid, long& rss_kb) {
  std::ifstream in("/proc/" + std::to_string(pid) + "/status");
  std::string key;
  while (in >> key) {
    if (key == "VmRSS:") {
      in >> rss_kb;
      return true;
    }
    std::string rest;
    std::getline(in, rest);
  }
  rss_kb = 0;
  return true;
}

bool ReadIO(int pid, unsigned long long& read_bytes, unsigned long long& write_bytes) {
  std::ifstream in("/proc/" + std::to_string(pid) + "/io");
  std::string key;
  unsigned long long value = 0;
  read_bytes = 0;
  write_bytes = 0;
  while (in >> key >> value) {
    if (key == "read_bytes:") read_bytes = value;
    if (key == "write_bytes:") write_bytes = value;
  }
  return true;
}

bool ReadSample(int pid, ProcSample& sample) {
  sample.timestamp = NowSeconds();
  if (!ReadTotalTicks(sample.total_ticks)) return false;
  if (!ReadProcStat(pid, sample.proc_ticks, sample.threads)) return false;
  ReadStatusRSS(pid, sample.rss_kb);
  ReadIO(pid, sample.read_bytes, sample.write_bytes);
  return true;
}

}  // namespace

int ResourceProfiler::Record(int pid, int duration_sec, int freq,
                             const std::string& output_path) {
  if (duration_sec <= 0) duration_sec = 1;
  if (freq <= 0) freq = 1;

  const int interval_ms = std::max(100, 1000 / freq);
  const int sample_count = std::max(2, (duration_sec * 1000) / interval_ms + 1);

  std::ofstream out(output_path);
  if (!out.is_open()) {
    LOG_ERROR("failed to open resource output: " + output_path);
    return -1;
  }

  out << "{\"timeseries\":[";

  ProcSample prev;
  if (!ReadSample(pid, prev)) {
    LOG_ERROR("failed to read /proc for pid=" + std::to_string(pid));
    return -1;
  }

  long ticks_per_sec = sysconf(_SC_CLK_TCK);
  if (ticks_per_sec <= 0) ticks_per_sec = 100;

  bool first = true;
  for (int i = 1; i < sample_count; i++) {
    std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));

    ProcSample cur;
    if (!ReadSample(pid, cur)) break;

    double elapsed = cur.timestamp - prev.timestamp;
    double cpu_pct = 0.0;
    if (elapsed > 0 && cur.proc_ticks >= prev.proc_ticks) {
      cpu_pct = (static_cast<double>(cur.proc_ticks - prev.proc_ticks) /
                 static_cast<double>(ticks_per_sec)) / elapsed * 100.0;
    }

    unsigned long long read_delta =
        cur.read_bytes >= prev.read_bytes ? cur.read_bytes - prev.read_bytes : 0;
    unsigned long long write_delta =
        cur.write_bytes >= prev.write_bytes ? cur.write_bytes - prev.write_bytes : 0;

    if (!first) out << ",";
    first = false;
    out << "{"
        << "\"timestamp\":" << cur.timestamp << ","
        << "\"cpu_pct\":" << cpu_pct << ","
        << "\"mem_rss_kb\":" << cur.rss_kb << ","
        << "\"io_read_bytes\":" << cur.read_bytes << ","
        << "\"io_write_bytes\":" << cur.write_bytes << ","
        << "\"io_read_delta_bytes\":" << read_delta << ","
        << "\"io_write_delta_bytes\":" << write_delta << ","
        << "\"threads\":" << cur.threads
        << "}";

    prev = cur;
  }

  out << "]}";
  LOG_INFO("resource samples -> " + output_path);
  return 0;
}

}  // namespace drop
