#pragma once

#include <string>
#include <vector>
#include "IProfiler.h"

namespace drop {

class Perf : public IProfiler {
public:
  // IProfiler 接口
  int Record(int pid, int duration_sec, int freq,
             const std::string& output_path) override;
  int collect_result(const std::string& output_path,
                     const std::string& result_path) override;
  std::string Name() const override { return "perf"; }
  int Type() const override { return PROFILER_PERF; }

  // 执行 perf script，解析输出
  static int Script(const std::string& perf_data_path,
                    const std::string& output_path);

private:
  // fork+execvp 执行命令，支持 stdout 重定向到文件
  static int ExecCommand(const std::vector<std::string>& args,
                         const std::string& stdout_path = "",
                         int timeout_sec = 120);
};

}  // namespace drop
