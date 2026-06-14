#include "BpftraceProfiler.h"
#include "ProcessKiller.h"
#include <iostream>
#include <fstream>
#include <string>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>

namespace drop {

int BpftraceProfiler::Record(int pid, int duration_sec, int freq,
                              const std::string& output_path) {
  // 生成 IO 探针脚本
  std::string script = GenerateIOProbeScript(pid, duration_sec);

  // 写入临时脚本文件
  std::string script_path = output_path + ".bt";
  std::ofstream script_file(script_path);
  if (!script_file.is_open()) {
    std::cerr << "Failed to create script file: " << script_path << std::endl;
    return -1;
  }
  script_file << script;
  script_file.close();

  // 构造命令：bpftrace <script> > <output> 2>&1
  std::string cmd = "bpftrace " + script_path + " > " + output_path + " 2>&1";

  std::cout << "Executing: " << cmd << std::endl;

  pid_t child = fork();
  if (child == -1) {
    std::cerr << "fork failed: " << strerror(errno) << std::endl;
    unlink(script_path.c_str());
    return -1;
  }

  if (child == 0) {
    // 子进程：创建独立进程组
    setpgid(0, 0);
    execlp("sh", "sh", "-c", cmd.c_str(), nullptr);
    std::cerr << "execlp failed: " << strerror(errno) << std::endl;
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
    std::cerr << "BpftraceProfiler timed out after " << (duration_sec + 60) << "s" << std::endl;
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
