#pragma once

#include <string>
#include <vector>

namespace drop {

class ScriptRunner {
public:
  // 执行脚本，返回退出码
  // 安全实现：直接 execvp 脚本路径，不走 shell 解释器
  static int Execute(const std::string& script_path,
                     const std::vector<std::string>& args);
};

}  // namespace drop
