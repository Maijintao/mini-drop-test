#pragma once

#include <string>
#include "IProfiler.h"

namespace drop {

// Java 堆转储采集器
// 使用 jmap -dump 生成 HPROF 文件
class JavaHeapDumper : public IProfiler {
public:
  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;
  std::string Name() const override { return "jmap"; }
  int Type() const override { return PROFILER_JAVA_HEAP; }

private:
  static int ExecCommand(const std::vector<std::string>& args,
                         int timeout_sec = 300);
};

}  // namespace drop
