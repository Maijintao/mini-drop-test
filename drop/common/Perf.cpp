#include "Perf.h"
#include "ProcessKiller.h"
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <cstring>

namespace drop {

int Perf::Record(int pid, int duration_sec, int freq,
                  const std::string& output_path) {
  // perf record -F <freq> -g -p <pid> -- sleep <duration> -o <output>
  std::vector<std::string> args = {
    "perf", "record",
    "-F", std::to_string(freq),
    "-g",
    "-p", std::to_string(pid),
    "--", "sleep", std::to_string(duration_sec),
    "-o", output_path
  };

  std::cout << "Executing: ";
  for (const auto& arg : args) std::cout << arg << " ";
  std::cout << std::endl;

  return ExecCommand(args);
}

int Perf::Script(const std::string& perf_data_path,
                  const std::string& output_path) {
  // perf script -i <perf_data> > <output>
  std::vector<std::string> args = {
    "perf", "script",
    "-i", perf_data_path
  };

  std::cout << "Executing: ";
  for (const auto& arg : args) std::cout << arg << " ";
  std::cout << "> " << output_path << std::endl;

  // TODO: 重定向 stdout 到 output_path
  return ExecCommand(args);
}

int Perf::ExecCommand(const std::vector<std::string>& args) {
  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t pid = fork();
  if (pid == -1) {
    std::cerr << "fork failed: " << strerror(errno) << std::endl;
    return -1;
  }

  if (pid == 0) {
    // 子进程：创建新的进程组
    setpgid(0, 0);
    execvp(c_args[0], c_args.data());
    std::cerr << "execvp failed: " << strerror(errno) << std::endl;
    _exit(1);
  }

  // 父进程：启动超时监控
  ProcessKiller killer(pid, 60);  // 60 秒超时
  killer.Start();

  int status;
  waitpid(pid, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    std::cerr << "Process killed due to timeout." << std::endl;
    return -2;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
