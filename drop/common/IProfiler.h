#pragma once

#include <string>

namespace drop {

// 采集器抽象接口
class IProfiler {
public:
  virtual ~IProfiler() = default;

  // 执行采集，返回 0 成功
  virtual int Record(int pid, int duration_sec, int freq,
                     const std::string& output_path) = 0;

  // 获取采集器名称
  virtual std::string Name() const = 0;

  // 获取采集器类型
  virtual int Type() const = 0;
};

// 采集器类型常量
constexpr int PROFILER_PERF = 0;
constexpr int PROFILER_ASYNC_PROFILER = 1;
constexpr int PROFILER_PPROF = 2;
constexpr int PROFILER_BPFTRACE = 3;

}  // namespace drop
