#include "PprofProfiler.h"
#include "ProcessKiller.h"
#include <iostream>
#include <string>
#include <vector>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int PprofProfiler::Record(int pid, int duration_sec, int freq,
                           const std::string& output_path) {
  // pprof 采集需要进程暴露 HTTP 端口
  // 默认尝试 localhost:6060（Go 默认 pprof 端口）
  // 实际项目中需要从配置读取端口

  std::string host = "localhost";
  int port = 6060;

  return FetchFromHTTP(host, port, duration_sec, output_path);
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
    std::cerr << "fork failed: " << strerror(errno) << std::endl;
    return -1;
  }

  if (child == 0) {
    // 子进程：创建独立进程组
    setpgid(0, 0);
    execvp(c_args[0], c_args.data());
    std::cerr << "execvp failed: " << strerror(errno) << std::endl;
    _exit(127);
  }

  // 父进程：启动超时监控（采集时长 + 60 秒缓冲，网络可能较慢）
  ProcessKiller killer(child, duration_sec + 60);
  killer.Start();

  int status;
  waitpid(child, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    std::cerr << "PprofProfiler timed out after " << (duration_sec + 60) << "s" << std::endl;
    return -2;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
