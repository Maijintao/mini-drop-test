#include "ScriptRunner.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>
#include <memory>
#include <fcntl.h>

namespace drop {

int ScriptRunner::Execute(const std::string& script_path,
                          const std::vector<std::string>& args,
                          int timeout_sec) {
  // 用 /bin/bash 执行脚本，不依赖文件权限和 shebang
  std::vector<char*> c_args;
  c_args.push_back(const_cast<char*>("/bin/bash"));
  c_args.push_back(const_cast<char*>(script_path.c_str()));
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

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
    // 子进程：创建独立进程组
    setpgid(0, 0);
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

  close(sync_pipe[1]);
  char ready = 0;
  read(sync_pipe[0], &ready, 1);
  close(sync_pipe[0]);

  // 父进程：启动超时监控
  std::unique_ptr<ProcessKiller> killer;
  if (timeout_sec > 0) {
    killer = std::make_unique<ProcessKiller>(pid, pid, timeout_sec);
    killer->Start();
  }

  int status;
  waitpid(pid, &status, 0);

  // 停止超时监控
  if (killer) {
    killer->Stop();
    if (killer->IsTimeout()) {
      LOG_WARN("script timeout after " + std::to_string(timeout_sec) + "s: " + script_path);
      return -2;
    }
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
