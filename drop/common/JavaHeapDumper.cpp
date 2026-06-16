#include "JavaHeapDumper.h"
#include "ProcessKiller.h"
#include "Log.h"
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>

namespace drop {

int JavaHeapDumper::Record(int pid, int /*duration_sec*/, int /*freq*/,
                            const std::string& output_path) {
  // jmap -dump:format=b,file=<output> <pid>
  std::string dump_opt = "format=b,file=" + output_path;
  std::vector<std::string> args = {
    "jmap", "-dump:" + dump_opt, std::to_string(pid)
  };

  LOG_INFO("Executing: jmap -dump:format=b,file=" + output_path +
           " " + std::to_string(pid));

  // jmap dump 可能耗时较长，给 300 秒超时
  return ExecCommand(args, 300);
}

int JavaHeapDumper::ExecCommand(const std::vector<std::string>& args,
                                 int timeout_sec) {
  std::vector<char*> c_args;
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
    setpgid(0, 0);
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }
    execvp(c_args[0], c_args.data());
    const char* err = "execvp failed\n";
    write(STDERR_FILENO, err, strlen(err));
    _exit(127);
  }

  ProcessKiller killer(pid, timeout_sec);
  killer.Start();

  int status;
  waitpid(pid, &status, 0);

  killer.Stop();

  if (killer.IsTimeout()) {
    LOG_ERROR("jmap timed out after " + std::to_string(timeout_sec) + "s");
    return -2;
  }

  if (WIFEXITED(status)) {
    int exit_code = WEXITSTATUS(status);
    if (exit_code != 0) {
      LOG_ERROR("jmap exited with code " + std::to_string(exit_code));
    }
    return exit_code;
  }
  return -1;
}

}  // namespace drop
