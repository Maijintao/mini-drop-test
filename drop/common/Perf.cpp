#include "Perf.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <iostream>
#include <fstream>
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <signal.h>
#include <cstring>

namespace drop {

static bool CheckPerfEventParanoid() {
  std::ifstream file("/proc/sys/kernel/perf_event_paranoid");
  if (!file.is_open()) {
    LOG_WARN("Cannot read perf_event_paranoid, assuming restricted");
    return false;
  }
  int value;
  file >> value;
  if (value > 1) {
    LOG_WARN("perf_event_paranoid=" + std::to_string(value) +
             ", perf may need root or perf_event_paranoid <= 1");
    return false;
  }
  return true;
}

int Perf::Record(int pid, int duration_sec, int freq,
                  const std::string& output_path) {
  // 检查权限，不足时记录警告但继续尝试
  if (!CheckPerfEventParanoid()) {
    LOG_WARN("perf_event_paranoid too high, perf record may fail");
  }

  // perf record -F <freq> -g -p <pid> -o <output> -- sleep <duration>
  std::vector<std::string> args = {
    "perf", "record",
    "-F", std::to_string(freq),
    "-g",
    "-p", std::to_string(pid),
    "-o", output_path,
    "--", "sleep", std::to_string(duration_sec)
  };

  LOG_INFO("Executing: perf record -F " + std::to_string(freq) +
           " -g -p " + std::to_string(pid) +
           " -o " + output_path +
           " -- sleep " + std::to_string(duration_sec));

  // 超时 = 采集时长 + 30 秒缓冲
  return ExecCommand(args, "", duration_sec + 30);
}

int Perf::Script(const std::string& perf_data_path,
                  const std::string& output_path) {
  // perf script -i <perf_data> > <output>
  std::vector<std::string> args = {
    "perf", "script",
    "-i", perf_data_path
  };

  LOG_INFO("Executing: perf script -i " + perf_data_path +
           " > " + output_path);

  // stdout 重定向到 output_path
  return ExecCommand(args, output_path, 120);
}

int Perf::ExecCommand(const std::vector<std::string>& args,
                       const std::string& stdout_path,
                       int timeout_sec) {
  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t pid = fork();
  if (pid == -1) {
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    return -1;
  }

  if (pid == 0) {
    // 子进程：创建新的进程组
    setpgid(0, 0);

    // 重定向 stdout 到文件（用于 perf script > output）
    if (!stdout_path.empty()) {
      int fd = open(stdout_path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
      if (fd < 0) {
        _exit(127);
      }
      dup2(fd, STDOUT_FILENO);
      close(fd);
    }

    // 关闭不需要的文件描述符（保留 stdin/stdout/stderr）
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

    execvp(c_args[0], c_args.data());
    const char* err = "execvp failed\n";
    write(STDERR_FILENO, err, strlen(err));
    _exit(127);
  }

  // 父进程：启动超时监控
  ProcessKiller killer(pid, timeout_sec);
  killer.Start();

  int status;
  waitpid(pid, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    LOG_ERROR("Process killed due to timeout (" + std::to_string(timeout_sec) + "s)");
    return -2;
  }

  if (WIFEXITED(status)) {
    int exit_code = WEXITSTATUS(status);
    if (exit_code != 0) {
      LOG_ERROR("Process exited with code " + std::to_string(exit_code));
    }
    return exit_code;
  }
  return -1;
}

}  // namespace drop
