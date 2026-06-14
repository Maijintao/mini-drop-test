#include "BpftraceProfiler.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <iostream>
#include <fstream>
#include <string>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>
#include <fcntl.h>

namespace drop {

int BpftraceProfiler::Record(int pid, int duration_sec, int freq,
                              const std::string& output_path) {
  // 生成 IO 探针脚本
  std::string script = GenerateIOProbeScript(pid, duration_sec);

  // 写入临时脚本文件
  std::string script_path = output_path + ".bt";
  std::ofstream script_file(script_path);
  if (!script_file.is_open()) {
    LOG_ERROR("Failed to create script file: " + script_path);
    return -1;
  }
  script_file << script;
  script_file.close();

  LOG_INFO("Executing: bpftrace " + script_path + " > " + output_path);

  pid_t child = fork();
  if (child == -1) {
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    unlink(script_path.c_str());
    return -1;
  }

  if (child == 0) {
    // 子进程：创建独立进程组
    setpgid(0, 0);

    // 重定向 stdout 到 output_path
    int fd = open(output_path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
      _exit(127);
    }
    dup2(fd, STDOUT_FILENO);
    dup2(fd, STDERR_FILENO);  // bpftrace 的输出也可能走 stderr
    close(fd);

    // 关闭多余 fd
    for (int i = 3; i < 1024; i++) {
      close(i);
    }

    // 直接 execvp，不走 shell，避免命令注入
    char* args[] = {
      const_cast<char*>("bpftrace"),
      const_cast<char*>(script_path.c_str()),
      nullptr
    };
    execvp(args[0], args);
    const char* err = "execvp bpftrace failed\n";
    write(STDERR_FILENO, err, strlen(err));
    _exit(127);
  }

  // 父进程：启动超时监控（采集时长 + 60 秒缓冲，eBPF 加载可能较慢）
  ProcessKiller killer(child, duration_sec + 60);
  killer.Start();

  int status;
  waitpid(child, &status, 0);

  killer.Stop();

  // 清理脚本文件
  unlink(script_path.c_str());

  if (killer.IsTimeout()) {
    LOG_ERROR("BpftraceProfiler timed out after " + std::to_string(duration_sec + 60) + "s");
    return -2;
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

std::string BpftraceProfiler::GenerateIOProbeScript(int pid, int duration) {
  // bpftrace 脚本：追踪 IO 延迟
  // 使用 block:block_rq_issue 和 block:block_rq_complete 追踪块设备请求延迟
  return R"(
tracepoint:block:block_rq_issue
/args->dev == 0 && pid == )" + std::to_string(pid) + R"( /
{
  @start[args->sector] = nsecs;
}

tracepoint:block:block_rq_complete
/args->dev == 0 && @start[args->sector]/
{
  @usecs = hist((nsecs - @start[args->sector]) / 1000);
  delete(@start[args->sector]);
}

interval:s:)" + std::to_string(duration) + R"(
{
  exit();
}
)";
}

std::string BpftraceProfiler::GenerateSchedProbeScript(int pid, int duration) {
  // bpftrace 脚本：追踪调度延迟
  // 使用 sched:sched_wakeup 和 sched:sched_switch 追踪进程调度延迟
  return R"(
tracepoint:sched:sched_wakeup
/args->pid == )" + std::to_string(pid) + R"( /
{
  @start[args->pid] = nsecs;
}

tracepoint:sched:sched_switch
/args->prev_pid == )" + std::to_string(pid) + R"( && @start[args->prev_pid]/
{
  @usecs = hist((nsecs - @start[args->prev_pid]) / 1000);
  delete(@start[args->prev_pid]);
}

interval:s:)" + std::to_string(duration) + R"(
{
  exit();
}
)";
}

}  // namespace drop
