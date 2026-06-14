#include "Perf.h"
#include "ProcessKiller.h"
#include <iostream>
#include <fstream>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <cstring>

namespace drop {

static bool CheckPerfEventParanoid() {
  std::ifstream file("/proc/sys/kernel/perf_event_paranoid");
  if (!file.is_open()) {
    std::cerr << "Warning: Cannot read perf_event_paranoid" << std::endl;
    return false;
  }
  int value;
  file >> value;
  if (value > 1) {
    std::cerr << "Warning: perf_event_paranoid=" << value
              << ", perf may need root or perf_event_paranoid <= 1" << std::endl;
    return false;
  }
  return true;
}

int Perf::Record(int pid, int duration_sec, int freq,
                  const std::string& output_path) {
  // 检查权限
  CheckPerfEventParanoid();

  // perf record -F <freq> -g -p <pid> -o <output> -- sleep <duration>
  std::vector<std::string> args = {
    "perf", "record",
    "-F", std::to_string(freq),
    "-g",
    "-p", std::to_string(pid),
    "-o", output_path,
    "--", "sleep", std::to_string(duration_sec)
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

    // 关闭不需要的文件描述符（保留 stdin/stdout/stderr）
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

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
