#pragma once

#include "IProfiler.h"

namespace drop {

// 用户态语言级采集器：pprof HTTP
// 支持 Go/C++ pprof 采集
class PprofProfiler : public IProfiler {
public:
  PprofProfiler() = default;
  PprofProfiler(const std::string& host, int port, const std::string& profile_kind = "cpu")
      : host_(host), port_(port), profile_kind_(profile_kind) {}

  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;

  std::string Name() const override { return "pprof"; }
  int Type() const override { return PROFILER_PPROF; }

private:
  std::string host_ = "localhost";
  int port_ = 6060;
  std::string profile_kind_ = "cpu";
  // 从 pprof HTTP 端点采集
  int FetchFromHTTP(const std::string& host, int port, int duration_sec,
                    const std::string& output_path);
};

}  // namespace drop
