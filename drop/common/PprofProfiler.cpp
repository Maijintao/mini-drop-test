#include "PprofProfiler.h"
#include <iostream>
#include <fstream>
#include <string>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int PprofProfiler::Record(int pid, int duration_sec, int freq,
                           const std::string& output_path) {
  // pprof 采集需要进程暴露 HTTP 端口
  // 默认尝试 localhost:6060
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

  std::string cmd = "curl -s -o " + output_path + " \"" + url + "\"";

  std::cout << "Executing: " << cmd << std::endl;

  pid_t child = fork();
  if (child == -1) {
    std::cerr << "fork failed" << std::endl;
    return -1;
  }

  if (child == 0) {
    execlp("sh", "sh", "-c", cmd.c_str(), nullptr);
    _exit(1);
  }

  int status;
  waitpid(child, &status, 0);

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
