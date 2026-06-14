#include "StorageClient.h"
#include <iostream>
#include <string>
#include <vector>
#include <cstring>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>

namespace drop {

// 辅助函数：fork+execvp 执行命令，返回退出码
// - 超时秒数由 timeout_sec 控制，默认 300 秒
// - 成功返回进程退出码，失败返回 -1，超时返回 -2
static int ExecCommand(const std::vector<std::string>& args, int timeout_sec = 300) {
  // 转换为 char* 数组
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t pid = fork();
  if (pid == -1) {
    std::cerr << "fork failed: " << strerror(errno) << std::endl;
    return -1;
  }

  if (pid == 0) {
    // 子进程：创建独立进程组，便于超时杀整组
    setpgid(0, 0);
    execvp(c_args[0], c_args.data());
    std::cerr << "execvp failed: " << strerror(errno) << std::endl;
    _exit(127);  // 命令不存在
  }

  // 父进程：等待子进程，带超时
  int elapsed = 0;
  int status = 0;
  bool timeout = false;

  while (elapsed < timeout_sec) {
    pid_t ret = waitpid(pid, &status, WNOHANG);
    if (ret == pid) {
      // 子进程已退出
      break;
    }
    if (ret == -1) {
      std::cerr << "waitpid failed: " << strerror(errno) << std::endl;
      return -1;
    }
    // 子进程还在运行，等 1 秒再检查
    sleep(1);
    elapsed++;
  }

  // 超时处理
  if (elapsed >= timeout_sec) {
    timeout = true;
    std::cerr << "Command timed out after " << timeout_sec << "s, sending SIGTERM" << std::endl;
    killpg(getpgid(pid), SIGTERM);
    sleep(3);
    // 还活着就 SIGKILL
    if (kill(pid, 0) == 0) {
      std::cerr << "Sending SIGKILL to pid=" << pid << std::endl;
      killpg(getpgid(pid), SIGKILL);
    }
    waitpid(pid, nullptr, 0);  // 回收僵尸
    return -2;
  }

  // 正常退出
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
}

MinIOClient::MinIOClient(const std::string& endpoint,
                           const std::string& access_key,
                           const std::string& secret_key,
                           const std::string& bucket,
                           bool use_ssl)
    : endpoint_(endpoint),
      access_key_(access_key),
      secret_key_(secret_key),
      bucket_(bucket),
      use_ssl_(use_ssl) {
  // 构造 mc 别名命令：mc alias set minio http://endpoint access_key secret_key
  // 只在构造时执行一次，后续 Upload/Download 直接用 minio/ 别名
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string url = protocol + "://" + endpoint_;

  std::vector<std::string> args = {
    "mc", "alias", "set", "minio", url, access_key, secret_key, "--api", "S3v4"
  };

  std::cout << "Initializing MinIO alias: " << url << std::endl;
  int ret = ExecCommand(args, 30);
  if (ret != 0) {
    std::cerr << "Warning: mc alias set failed (code=" << ret << "), uploads may fail" << std::endl;
  }
}

int MinIOClient::Upload(const std::string& local_path,
                         const std::string& remote_key) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {"mc", "cp", local_path, remote};

  std::cout << "Uploading: " << local_path << " -> " << remote << std::endl;
  int ret = ExecCommand(args);

  if (ret == 0) {
    std::cout << "Upload successful." << std::endl;
  } else {
    std::cerr << "Upload failed with code " << ret << std::endl;
  }
  return ret;
}

int MinIOClient::Download(const std::string& remote_key,
                           const std::string& local_path) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {"mc", "cp", remote, local_path};

  std::cout << "Downloading: " << remote << " -> " << local_path << std::endl;
  int ret = ExecCommand(args);

  if (ret == 0) {
    std::cout << "Download successful." << std::endl;
  } else {
    std::cerr << "Download failed with code " << ret << std::endl;
  }
  return ret;
}

bool MinIOClient::Exists(const std::string& remote_key) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {"mc", "stat", remote};
  return ExecCommand(args, 30) == 0;
}

std::string MinIOClient::GetPresignedUrl(const std::string& remote_key,
                                          int expire_seconds) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {
    "mc", "share", "download",
    "--expire", std::to_string(expire_seconds) + "s",
    remote
  };

  // mc share download 输出到 stdout，需要捕获
  // 简化实现：返回直接 URL（实际项目应解析 mc 输出）
  std::string protocol = use_ssl_ ? "https" : "http";
  return protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;
}

}  // namespace drop
