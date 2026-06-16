#pragma once

#include <string>
#include "IProfiler.h"

namespace drop {

// Memray Python 内存采集器
// 使用 memray attach 采集运行中 Python 进程的内存分配
class MemrayProfiler : public IProfiler {
public:
  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;
  int collect_result(const std::string& output_path,
                     const std::string& result_path) override;
  std::string Name() const override { return "memray"; }
  int Type() const override { return PROFILER_MEMRAY; }

private:
  static int ExecCommand(const std::vector<std::string>& args,
                         int timeout_sec = 300);
};

}  // namespace drop
