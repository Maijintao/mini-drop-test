#pragma once

#include "IProfiler.h"

namespace drop {

// eBPF 采集器：使用 bpftrace
// 实现内核态探针：IO 延迟、调度延迟
class BpftraceProfiler : public IProfiler {
public:
  BpftraceProfiler() = default;
  explicit BpftraceProfiler(const std::string& event) : event_(event) {}

  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;

  std::string Name() const override { return "bpftrace"; }
  int Type() const override { return PROFILER_BPFTRACE; }

private:
  std::string event_;  // "sched" → 调度探针, 其他 → IO 探针
  // 生成 bpftrace 脚本
  static std::string GenerateIOProbeScript(int pid, int duration);
  static std::string GenerateSchedProbeScript(int pid, int duration);
};

}  // namespace drop
