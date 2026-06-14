#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <iostream>
#include <cstdlib>

namespace drop {

int Daemonize() {
  pid_t pid = fork();
  if (pid < 0) {
    std::cerr << "fork failed" << std::endl;
    return -1;
  }
  if (pid > 0) {
    // 父进程退出
    _exit(0);
  }

  // 子进程创建新会话
  if (setsid() < 0) {
    std::cerr << "setsid failed" << std::endl;
    return -1;
  }

  // 第二次 fork
  pid = fork();
  if (pid < 0) {
    std::cerr << "fork failed" << std::endl;
    return -1;
  }
  if (pid > 0) {
    _exit(0);
  }

  // 设置文件权限
  umask(0);

  // 切换到根目录
  if (chdir("/") < 0) {
    std::cerr << "chdir failed" << std::endl;
    return -1;
  }

  // 关闭标准文件描述符
  close(STDIN_FILENO);
  close(STDOUT_FILENO);
  close(STDERR_FILENO);

  // stdin/stdout 重定向到 /dev/null
  open("/dev/null", O_RDONLY);  // stdin
  open("/dev/null", O_WRONLY);  // stdout

  // stderr 重定向到日志文件（保留日志输出能力）
  int log_fd = open("/var/log/mini-drop.log", O_WRONLY | O_CREAT | O_APPEND, 0644);
  if (log_fd < 0) {
    // 日志目录不可写时回退到 /dev/null
    open("/dev/null", O_WRONLY);
  }

  return 0;
}

}  // namespace drop
