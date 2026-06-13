#include <string>
#include <vector>
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

class ScriptRunner {
public:
  // 执行脚本，返回退出码
  static int Execute(const std::string& script_path,
                     const std::vector<std::string>& args) {
    std::vector<char*> c_args;
    c_args.push_back(const_cast<char*>("sh"));
    c_args.push_back(const_cast<char*>("-c"));

    std::string cmd = script_path;
    for (const auto& arg : args) {
      cmd += " " + arg;
    }
    c_args.push_back(const_cast<char*>(cmd.c_str()));
    c_args.push_back(nullptr);

    pid_t pid = fork();
    if (pid == -1) {
      std::cerr << "fork failed" << std::endl;
      return -1;
    }

    if (pid == 0) {
      execvp("sh", c_args.data());
      _exit(1);
    }

    int status;
    waitpid(pid, &status, 0);

    if (WIFEXITED(status)) {
      return WEXITSTATUS(status);
    }
    return -1;
  }
};

}  // namespace drop
