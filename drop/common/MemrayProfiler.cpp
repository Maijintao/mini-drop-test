#include "MemrayProfiler.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>

namespace drop {

int MemrayProfiler::Record(int pid, int duration_sec, int /*freq*/,
                            const std::string& output_path) {
  // memray attach -o <output> -d <duration> <pid>
  // -d: 采集时长（秒），-o: 输出文件
  std::vector<std::string> args = {
    "memray", "attach",
    "-o", output_path,
    "-d", std::to_string(duration_sec),
    std::to_string(pid)
  };

  LOG_INFO("Executing: memray attach -o " + output_path +
           " -d " + std::to_string(duration_sec) +
           " " + std::to_string(pid));

  // 超时 = 采集时长 + 60 秒缓冲（Python 内存 dump 可能较慢）
  return ExecCommand(args, duration_sec + 60);
}

int MemrayProfiler::collect_result(const std::string& output_path,
                                    const std::string& result_path) {
  // memray flamegraph <output> -o <result>
  // 将 memray 采集结果转换为火焰图 HTML
  std::vector<std::string> args = {
    "memray", "flamegraph",
    output_path,
    "-o", result_path
  };

  LOG_INFO("Executing: memray flamegraph " + output_path + " -o " + result_path);
  return ExecCommand(args, 120);
}

int MemrayProfiler::ExecCommand(const std::vector<std::string>& args,
                                 int timeout_sec) {
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

  pid_t pid = fork();
  if (pid == -1) {
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    close(sync_pipe[0]);
    close(sync_pipe[1]);
    return -1;
  }

  if (pid == 0) {
    setpgid(0, 0);
    // 通知父进程 setpgid 已完成
    close(sync_pipe[0]);
    char ready = 1;
    write(sync_pipe[1], &ready, 1);
    close(sync_pipe[1]);

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

  ProcessKiller killer(pid, pid, timeout_sec);
  killer.Start();

  int status;
  waitpid(pid, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    LOG_ERROR("memray timed out after " + std::to_string(timeout_sec) + "s");
    return -2;
  }

  if (WIFEXITED(status)) {
    int exit_code = WEXITSTATUS(status);
    if (exit_code != 0) {
      LOG_ERROR("memray exited with code " + std::to_string(exit_code));
    }
    return exit_code;
  }
  return -1;
}

}  // namespace drop
