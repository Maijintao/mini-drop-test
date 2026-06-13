#pragma once

#include "IProfiler.h"

namespace drop {

// 用户态语言级采集器：async-profiler
// 支持 Java/C++ 采集，生成折叠栈格式
class AsyncProfiler : public IProfiler {
public:
  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;

  std::string Name() const override { return "async-profiler"; }
  int Type() const override { return PROFILER_ASYNC_PROFILER; }

private:
  // async-profiler 路径
  static constexpr const char* PROFILER_PATH = "/opt/async-profiler/build/bin/asprof";
};

}  // namespace drop
