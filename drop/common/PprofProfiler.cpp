#include "PprofProfiler.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <iostream>
#include <string>
#include <vector>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int PprofProfiler::Record(int pid, int duration_sec, int freq,
                           const std::string& output_path) {
  return FetchFromHTTP(host_, port_, duration_sec, output_path);
}

int PprofProfiler::FetchFromHTTP(const std::string& host, int port,
                                  int duration_sec,
                                  const std::string& output_path) {
  // 使用 curl 采集 pprof 数据
  // curl -o <output> "http://<host>:<port>/debug/pprof/profile?seconds=<duration>"
  std::string url = "http://" + host + ":" + std::to_string(port) +
                    "/debug/pprof/profile?seconds=" + std::to_string(duration_sec);

  std::vector<std::string> args = {
    "curl", "-s", "-o", output_path, url
  };

  LOG_INFO("Executing: curl -s -o " + output_path + " " + url);

  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t child = fork();
  if (child == -1) {
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    return -1;
  }

  if (child == 0) {
    // 子进程：创建独立进程组
    setpgid(0, 0);

    // 关闭多余 fd
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

    execvp(c_args[0], c_args.data());
    const char* err = "execvp failed\n";
    write(STDERR_FILENO, err, strlen(err));
    _exit(127);
  }

  // 父进程：启动超时监控（采集时长 + 60 秒缓冲，网络可能较慢）
  ProcessKiller killer(child, duration_sec + 60);
  killer.Start();

  int status;
  waitpid(child, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    LOG_ERROR("PprofProfiler timed out after " + std::to_string(duration_sec + 60) + "s");
    return -2;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
