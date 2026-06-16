#include "StorageClient.h"
#include "Log.h"
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
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    return -1;
  }

  if (pid == 0) {
    // 子进程：创建独立进程组，便于超时杀整组
    setpgid(0, 0);

    // 关闭多余 fd（避免泄漏父进程 socket）
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

    execvp(c_args[0], c_args.data());
    const char* err = "execvp failed\n";
    write(STDERR_FILENO, err, strlen(err));
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
      LOG_ERROR("waitpid failed: " + std::string(strerror(errno)));
      return -1;
    }
    // 子进程还在运行，等 1 秒再检查
    sleep(1);
    elapsed++;
  }

  // 超时处理
  if (elapsed >= timeout_sec) {
    timeout = true;
    LOG_ERROR("Command timed out after " + std::to_string(timeout_sec) + "s, sending SIGTERM");
    killpg(getpgid(pid), SIGTERM);
    sleep(3);
    // 还活着就 SIGKILL
    if (kill(pid, 0) == 0) {
      LOG_ERROR("Sending SIGKILL to pid=" + std::to_string(pid));
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

  LOG_INFO("Initializing MinIO alias: " + url);
  int ret = ExecCommand(args, 30);
  if (ret != 0) {
    LOG_WARN("mc alias set failed (code=" + std::to_string(ret) + "), uploads may fail");
  }
}

int MinIOClient::Upload(const std::string& local_path,
                         const std::string& remote_key) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {"mc", "cp", local_path, remote};

  LOG_INFO("Uploading: " + local_path + " -> " + remote);
  int ret = ExecCommand(args);

  if (ret == 0) {
    LOG_INFO("Upload successful.");
  } else {
    LOG_ERROR("Upload failed with code " + std::to_string(ret));
  }
  return ret;
}

int MinIOClient::Download(const std::string& remote_key,
                           const std::string& local_path) {
  std::string remote = "minio/" + bucket_ + "/" + remote_key;
  std::vector<std::string> args = {"mc", "cp", remote, local_path};

  LOG_INFO("Downloading: " + remote + " -> " + local_path);
  int ret = ExecCommand(args);

  if (ret == 0) {
    LOG_INFO("Download successful.");
  } else {
    LOG_ERROR("Download failed with code " + std::to_string(ret));
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

  // 使用 mc share download 生成真正的预签名 URL
  // 通过 pipe 捕获 stdout 输出
  int pipefd[2];
  if (pipe(pipefd) < 0) {
    LOG_ERROR("pipe failed: " + std::string(strerror(errno)));
    return "";
  }

  pid_t pid = fork();
  if (pid == -1) {
    close(pipefd[0]);
    close(pipefd[1]);
    LOG_ERROR("fork failed: " + std::string(strerror(errno)));
    return "";
  }

  if (pid == 0) {
    // 子进程：重定向 stdout 到 pipe
    close(pipefd[0]);
    dup2(pipefd[1], STDOUT_FILENO);
    close(pipefd[1]);

    // 关闭多余 fd
    for (int fd = 3; fd < 1024; fd++) {
      close(fd);
    }

    std::string expire_str = std::to_string(expire_seconds) + "s";
    char* args[] = {
      const_cast<char*>("mc"),
      const_cast<char*>("share"),
      const_cast<char*>("download"),
      const_cast<char*>("--expire"),
      const_cast<char*>(expire_str.c_str()),
      const_cast<char*>(remote.c_str()),
      nullptr
    };
    execvp(args[0], args);
    _exit(127);
  }

  // 父进程：从 pipe 读取输出
  close(pipefd[1]);
  std::string output;
  char buf[4096];
  ssize_t n;
  while ((n = read(pipefd[0], buf, sizeof(buf) - 1)) > 0) {
    buf[n] = '\0';
    output += buf;
  }
  close(pipefd[0]);

  int status;
  waitpid(pid, &status, 0);

  // 解析 mc share 输出，提取 URL
  // mc share 输出格式：URL: <url>
  size_t url_pos = output.find("URL:");
  if (url_pos != std::string::npos) {
    std::string url_line = output.substr(url_pos + 4);
    // 去掉前导空格和尾部换行
    size_t start = url_line.find_first_not_of(" \t\n\r");
    size_t end = url_line.find_last_not_of(" \t\n\r");
    if (start != std::string::npos) {
      return url_line.substr(start, end - start + 1);
    }
  }

  // 回退：返回直接 URL（可能无法访问）
  std::string protocol = use_ssl_ ? "https" : "http";
  return protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;
}

// ========== CurlS3Client ==========

CurlS3Client::CurlS3Client(const std::string& endpoint,
                             const std::string& access_key,
                             const std::string& secret_key,
                             const std::string& bucket,
                             bool use_ssl)
    : endpoint_(endpoint), access_key_(access_key),
      secret_key_(secret_key), bucket_(bucket), use_ssl_(use_ssl) {}

int CurlS3Client::ExecCommand(const std::vector<std::string>& args, int timeout_sec) {
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t pid = fork();
  if (pid == -1) return -1;

  if (pid == 0) {
    setpgid(0, 0);
    for (int fd = 3; fd < 1024; fd++) close(fd);
    execvp(c_args[0], c_args.data());
    _exit(127);
  }

  int elapsed = 0;
  int status = 0;
  while (elapsed < timeout_sec) {
    pid_t ret = waitpid(pid, &status, WNOHANG);
    if (ret == pid) break;
    if (ret == -1) return -1;
    sleep(1);
    elapsed++;
  }
  if (elapsed >= timeout_sec) {
    killpg(getpgid(pid), SIGTERM);
    sleep(3);
    if (kill(pid, 0) == 0) killpg(getpgid(pid), SIGKILL);
    waitpid(pid, nullptr, 0);
    return -2;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return -1;
}

int CurlS3Client::Upload(const std::string& local_path,
                          const std::string& remote_key) {
  // curl -X PUT -T <local> http://endpoint/bucket/key
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string url = protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;

  std::vector<std::string> args = {
    "curl", "-s", "-f", "-X", "PUT",
    "-T", local_path,
    "-u", access_key_ + ":" + secret_key_,
    url
  };

  LOG_INFO("CurlS3: PUT " + url);
  return ExecCommand(args, 300);
}

int CurlS3Client::Download(const std::string& remote_key,
                             const std::string& local_path) {
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string url = protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;

  std::vector<std::string> args = {
    "curl", "-s", "-f", "-o", local_path,
    "-u", access_key_ + ":" + secret_key_,
    url
  };

  LOG_INFO("CurlS3: GET " + url);
  return ExecCommand(args, 300);
}

bool CurlS3Client::Exists(const std::string& remote_key) {
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string url = protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;

  std::vector<std::string> args = {
    "curl", "-s", "-f", "-I",
    "-u", access_key_ + ":" + secret_key_,
    url
  };

  return ExecCommand(args, 30) == 0;
}

std::string CurlS3Client::GetPresignedUrl(const std::string& remote_key,
                                            int /*expire_seconds*/) {
  std::string protocol = use_ssl_ ? "https" : "http";
  return protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;
}

// ========== AwsCliClient ==========

AwsCliClient::AwsCliClient(const std::string& endpoint,
                              const std::string& access_key,
                              const std::string& secret_key,
                              const std::string& bucket,
                              bool use_ssl)
    : endpoint_(endpoint), access_key_(access_key),
      secret_key_(secret_key), bucket_(bucket), use_ssl_(use_ssl) {}

int AwsCliClient::ExecCommand(const std::vector<std::string>& args, int timeout_sec) {
  std::vector<char*> c_args;
  for (const auto& arg : args) {
    c_args.push_back(const_cast<char*>(arg.c_str()));
  }
  c_args.push_back(nullptr);

  pid_t pid = fork();
  if (pid == -1) return -1;

  if (pid == 0) {
    setpgid(0, 0);
    for (int fd = 3; fd < 1024; fd++) close(fd);
    execvp(c_args[0], c_args.data());
    _exit(127);
  }

  int elapsed = 0;
  int status = 0;
  while (elapsed < timeout_sec) {
    pid_t ret = waitpid(pid, &status, WNOHANG);
    if (ret == pid) break;
    if (ret == -1) return -1;
    sleep(1);
    elapsed++;
  }
  if (elapsed >= timeout_sec) {
    killpg(getpgid(pid), SIGTERM);
    sleep(3);
    if (kill(pid, 0) == 0) killpg(getpgid(pid), SIGKILL);
    waitpid(pid, nullptr, 0);
    return -2;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return -1;
}

int AwsCliClient::Upload(const std::string& local_path,
                           const std::string& remote_key) {
  // aws s3 cp <local> s3://bucket/key --endpoint-url http://endpoint
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string s3_path = "s3://" + bucket_ + "/" + remote_key;
  std::string endpoint_url = protocol + "://" + endpoint_;

  std::vector<std::string> args = {
    "aws", "s3", "cp", local_path, s3_path,
    "--endpoint-url", endpoint_url
  };

  LOG_INFO("AwsCli: cp " + local_path + " -> " + s3_path);
  return ExecCommand(args, 300);
}

int AwsCliClient::Download(const std::string& remote_key,
                              const std::string& local_path) {
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string s3_path = "s3://" + bucket_ + "/" + remote_key;
  std::string endpoint_url = protocol + "://" + endpoint_;

  std::vector<std::string> args = {
    "aws", "s3", "cp", s3_path, local_path,
    "--endpoint-url", endpoint_url
  };

  LOG_INFO("AwsCli: cp " + s3_path + " -> " + local_path);
  return ExecCommand(args, 300);
}

bool AwsCliClient::Exists(const std::string& remote_key) {
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string s3_path = "s3://" + bucket_ + "/" + remote_key;
  std::string endpoint_url = protocol + "://" + endpoint_;

  std::vector<std::string> args = {
    "aws", "s3", "ls", s3_path,
    "--endpoint-url", endpoint_url
  };

  return ExecCommand(args, 30) == 0;
}

std::string AwsCliClient::GetPresignedUrl(const std::string& remote_key,
                                            int expire_seconds) {
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string s3_path = "s3://" + bucket_ + "/" + remote_key;
  std::string endpoint_url = protocol + "://" + endpoint_;

  // aws s3 presign s3://bucket/key --expires-in <sec> --endpoint-url <url>
  int pipefd[2];
  if (pipe(pipefd) < 0) return "";

  pid_t pid = fork();
  if (pid == -1) {
    close(pipefd[0]); close(pipefd[1]);
    return "";
  }

  if (pid == 0) {
    close(pipefd[0]);
    dup2(pipefd[1], STDOUT_FILENO);
    close(pipefd[1]);
    for (int fd = 3; fd < 1024; fd++) close(fd);

    char* args[] = {
      const_cast<char*>("aws"), const_cast<char*>("s3"), const_cast<char*>("presign"),
      const_cast<char*>(s3_path.c_str()),
      const_cast<char*>("--expires-in"), const_cast<char*>(std::to_string(expire_seconds).c_str()),
      const_cast<char*>("--endpoint-url"), const_cast<char*>(endpoint_url.c_str()),
      nullptr
    };
    execvp(args[0], args);
    _exit(127);
  }

  close(pipefd[1]);
  std::string output;
  char buf[4096];
  ssize_t n;
  while ((n = read(pipefd[0], buf, sizeof(buf) - 1)) > 0) {
    buf[n] = '\0';
    output += buf;
  }
  close(pipefd[0]);
  waitpid(pid, nullptr, 0);

  // 去掉尾部换行
  size_t end = output.find_last_not_of(" \t\n\r");
  if (end != std::string::npos) return output.substr(0, end + 1);
  return output;
}

// ========== FallbackStorageClient ==========

FallbackStorageClient::FallbackStorageClient(const std::string& endpoint,
                                               const std::string& access_key,
                                               const std::string& secret_key,
                                               const std::string& bucket,
                                               bool use_ssl) {
  // 构建回退链：mc CLI → curl S3 → AWS CLI
  clients_.push_back(std::make_unique<MinIOClient>(endpoint, access_key, secret_key, bucket, use_ssl));
  clients_.push_back(std::make_unique<CurlS3Client>(endpoint, access_key, secret_key, bucket, use_ssl));
  clients_.push_back(std::make_unique<AwsCliClient>(endpoint, access_key, secret_key, bucket, use_ssl));
}

int FallbackStorageClient::Upload(const std::string& local_path,
                                    const std::string& remote_key) {
  for (size_t i = 0; i < clients_.size(); i++) {
    int ret = clients_[i]->Upload(local_path, remote_key);
    if (ret == 0) {
      LOG_INFO("Upload succeeded via client #" + std::to_string(i));
      last_success_ = std::to_string(i);
      return 0;
    }
    LOG_WARN("Upload client #" + std::to_string(i) +
             " failed (code=" + std::to_string(ret) + "), trying next...");
  }
  LOG_ERROR("All upload methods failed");
  return -1;
}

int FallbackStorageClient::Download(const std::string& remote_key,
                                      const std::string& local_path) {
  for (size_t i = 0; i < clients_.size(); i++) {
    int ret = clients_[i]->Download(remote_key, local_path);
    if (ret == 0) return 0;
  }
  return -1;
}

bool FallbackStorageClient::Exists(const std::string& remote_key) {
  for (auto& client : clients_) {
    if (client->Exists(remote_key)) return true;
  }
  return false;
}

std::string FallbackStorageClient::GetPresignedUrl(const std::string& remote_key,
                                                     int expire_seconds) {
  for (auto& client : clients_) {
    std::string url = client->GetPresignedUrl(remote_key, expire_seconds);
    if (!url.empty()) return url;
  }
  return "";
}

}  // namespace drop
