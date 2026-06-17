#pragma once

#include <string>
#include <vector>

namespace drop {

class ScriptRunner {
public:
  // 执行脚本，返回退出码
  // 安全实现：直接 execvp 脚本路径，不走 shell 解释器
  // timeout_sec: 超时秒数，0 表示不限制
  static int Execute(const std::string& script_path,
                     const std::vector<std::string>& args,
                     int timeout_sec = 120);
};

}  // namespace drop
