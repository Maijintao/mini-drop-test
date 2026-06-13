#pragma once

#include <string>
#include <vector>

namespace drop {

class Perf {
public:
  // 执行 perf record，返回 perf.data 路径
  static int Record(int pid, int duration_sec, int freq,
                    const std::string& output_path);

  // 执行 perf script，解析输出
  static int Script(const std::string& perf_data_path,
                    const std::string& output_path);

private:
  // fork+execvp 执行命令
  static int ExecCommand(const std::vector<std::string>& args);
};

}  // namespace drop
