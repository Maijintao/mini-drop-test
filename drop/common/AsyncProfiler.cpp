#include "AsyncProfiler.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
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
  if (access(PROFILER_PATH, X_OK) == 0) {
    return RecordWithAsyncProfiler(pid, duration_sec, freq, output_path);
  }

  LOG_INFO(std::string(PROFILER_PATH) + " not found; falling back to jstack sampling");
  return RecordWithJstack(pid, duration_sec, freq, output_path);
}

int AsyncProfiler::RecordWithAsyncProfiler(int pid, int duration_sec, int freq,
                                            const std::string& output_path) {
  // async-profiler 命令：
  // asprof -d <duration> -f <output> -e cpu -i <interval> <pid>
  std::vector<std::string> args = {
    PROFILER_PATH,
    "-d", std::to_string(duration_sec),
    "-o", "collapsed",
    "-f", output_path,
    "-e", "cpu",
    "-i", std::to_string(1000000 / freq) + "us",  // 转换为微秒
    std::to_string(pid)
  };

  LOG_INFO("Executing: " + std::string(PROFILER_PATH) + " -d " + std::to_string(duration_sec) +
           " -o collapsed -f " + output_path + " -e cpu -i " + std::to_string(1000000 / freq) + "us" +
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

int AsyncProfiler::RecordWithJstack(int pid, int duration_sec, int freq,
                                     const std::string& output_path) {
  int interval_ms = std::max(50, 1000 / std::max(1, freq));
  int max_samples = std::max(1, duration_sec * 1000 / interval_ms);
  std::map<std::string, int> collapsed;
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(duration_sec);

  for (int sample = 0;
       sample < max_samples && std::chrono::steady_clock::now() < deadline;
       ++sample) {
    std::string cmd = "jstack -l " + std::to_string(pid) + " 2>/dev/null";
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) {
      LOG_ERROR("failed to execute jstack");
      return -1;
    }

    char buffer[4096];
    std::vector<std::string> stack;
    bool in_thread = false;
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
      std::string line(buffer);
      while (!line.empty() && (line.back() == '\n' || line.back() == '\r')) {
        line.pop_back();
      }

      if (!line.empty() && line.front() == '"') {
        if (!stack.empty()) {
          std::reverse(stack.begin(), stack.end());
          std::ostringstream key;
          for (size_t i = 0; i < stack.size(); ++i) {
            if (i) key << ';';
            key << stack[i];
          }
          collapsed[key.str()]++;
        }
        stack.clear();
        in_thread = true;
        continue;
      }

      if (!in_thread) continue;
      if (line.empty()) {
        if (!stack.empty()) {
          std::reverse(stack.begin(), stack.end());
          std::ostringstream key;
          for (size_t i = 0; i < stack.size(); ++i) {
            if (i) key << ';';
            key << stack[i];
          }
          collapsed[key.str()]++;
        }
        stack.clear();
        in_thread = false;
        continue;
      }

      const std::string marker = "\tat ";
      size_t pos = line.find(marker);
      if (pos != std::string::npos) {
        std::string frame = line.substr(pos + marker.size());
        size_t args_pos = frame.find('(');
        if (args_pos != std::string::npos) frame = frame.substr(0, args_pos);
        if (!frame.empty()) stack.push_back(frame);
      }
    }

    if (!stack.empty()) {
      std::reverse(stack.begin(), stack.end());
      std::ostringstream key;
      for (size_t i = 0; i < stack.size(); ++i) {
        if (i) key << ';';
        key << stack[i];
      }
      collapsed[key.str()]++;
    }

    int rc = pclose(pipe);
    if (rc != 0 && collapsed.empty()) {
      LOG_ERROR("jstack failed for pid=" + std::to_string(pid));
      return WIFEXITED(rc) ? WEXITSTATUS(rc) : -1;
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
  }

  if (collapsed.empty()) {
    LOG_ERROR("jstack fallback produced no stack samples");
    return -1;
  }

  std::ofstream out(output_path);
  if (!out.is_open()) {
    LOG_ERROR("failed to open async-profiler fallback output: " + output_path);
    return -1;
  }
  for (const auto& item : collapsed) {
    out << item.first << " " << item.second << "\n";
  }
  LOG_INFO("jstack fallback wrote collapsed stacks: " + output_path);
  return 0;
}

}  // namespace drop
