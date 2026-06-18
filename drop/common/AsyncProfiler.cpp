#include "AsyncProfiler.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <iostream>
#include <vector>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int AsyncProfiler::Record(int pid, int duration_sec, int freq,
                           const std::string& output_path) {
  // N15: 参数校验，防止除零
  if (freq <= 0) {
    freq = 99;
  }

  // async-profiler 命令：
  // asprof -d <duration> -f <output> -e cpu -i <interval> <pid>
  std::vector<std::string> args = {
    PROFILER_PATH,
    "-d", std::to_string(duration_sec),
    "-f", output_path,
    "-e", "cpu",
    "-i", std::to_string(1000000 / freq) + "us",  // 转换为微秒
    std::to_string(pid)
  };

  LOG_INFO("Executing: " + std::string(PROFILER_PATH) + " -d " + std::to_string(duration_sec) +
           " -f " + output_path + " -e cpu -i " + std::to_string(1000000 / freq) + "us" +
           " " + std::to_string(pid));

  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  // pipe 同步：确保子进程 setpgid 完成后父进程再读 pgid
  int sync_pipe[2];
  if (pipe(sync_pipe) < 0) {
    LOG_ERROR("pipe failed: " + std::string(strerror(errno)));
    return -1;
  }

  pid_t child = fork();
  if (child == -1) {
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    close(sync_pipe[0]);
    close(sync_pipe[1]);
    return -1;
  }

  if (child == 0) {
    // 子进程：创建独立进程组
    setpgid(0, 0);
    // 通知父进程 setpgid 已完成
    close(sync_pipe[0]);
    char ready = 1;
    write(sync_pipe[1], &ready, 1);
    close(sync_pipe[1]);

    // 关闭多余 fd
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

    execvp(c_args[0], c_args.data());
    const char* err = "execvp failed\n";
    write(STDERR_FILENO, err, strlen(err));
    _exit(127);
  }

  // 父进程：等待子进程 setpgid 完成
  close(sync_pipe[1]);
  char ready = 0;
  read(sync_pipe[0], &ready, 1);
  close(sync_pipe[0]);

  // 启动超时监控（采集时长 + 30 秒缓冲）
  ProcessKiller killer(child, child, duration_sec + 30);
  killer.Start();

  int status;
  waitpid(child, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    LOG_ERROR("AsyncProfiler timed out after " + std::to_string(duration_sec + 30) + "s");
    return -2;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
