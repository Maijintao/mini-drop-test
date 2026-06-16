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

  // 后处理采集结果（如格式转换），返回 0 成功
  // 默认无操作，子类可重写
  virtual int collect_result(const std::string& output_path,
                             const std::string& result_path) {
    (void)output_path;
    (void)result_path;
    return 0;
  }

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
constexpr int PROFILER_MEMRAY = 4;
constexpr int PROFILER_JAVA_HEAP = 5;

}  // namespace drop
