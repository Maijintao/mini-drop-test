#include "ScriptRunner.h"
#include "Log.h"
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>

namespace drop {

int ScriptRunner::Execute(const std::string& script_path,
                          const std::vector<std::string>& args) {
  std::vector<char*> c_args;
  c_args.push_back(const_cast<char*>(script_path.c_str()));
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

  int status;
  waitpid(pid, &status, 0);

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

}  // namespace drop
