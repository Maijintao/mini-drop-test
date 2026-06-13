#include "AsyncProfiler.h"
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int AsyncProfiler::Record(int pid, int duration_sec, int freq,
                           const std::string& output_path) {
  // async-profiler 命令：
  // asprof -d <duration> -f <output> -e cpu -f <freq> <pid>
  std::vector<std::string> args = {
    PROFILER_PATH,
    "-d", std::to_string(duration_sec),
    "-f", output_path,
    "-e", "cpu",
    "-i", std::to_string(1000000 / freq) + "us",  // 转换为微秒
    std::to_string(pid)
  };

  std::cout << "Executing: ";
  for (const auto& arg : args) std::cout << arg << " ";
  std::cout << std::endl;

  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t child = fork();
  if (child == -1) {
    std::cerr << "fork failed" << std::endl;
    return -1;
  }

  if (child == 0) {
    // 子进程
    execvp(c_args[0], c_args.data());
    std::cerr << "execvp failed: " << strerror(errno) << std::endl;
    _exit(1);
  }

  // 父进程等待
  int status;
  waitpid(child, &status, 0);

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
