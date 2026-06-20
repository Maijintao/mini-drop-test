#pragma once

#include "IProfiler.h"

namespace drop {

// Lightweight resource sampler. It reads /proc directly so validation VMs do
// not need sysstat/pidstat installed.
class ResourceProfiler : public IProfiler {
public:
  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;

  std::string Name() const override { return "resource"; }
  int Type() const override { return PROFILER_RESOURCE; }
};

}  // namespace drop
