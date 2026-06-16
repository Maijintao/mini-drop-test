#pragma once

#include <string>
#include <vector>
#include <memory>

namespace drop {

class StorageClient {
public:
  virtual ~StorageClient() = default;

  // 上传文件
  virtual int Upload(const std::string& local_path,
                     const std::string& remote_key) = 0;

  // 下载文件
  virtual int Download(const std::string& remote_key,
                       const std::string& local_path) = 0;

  // 检查文件是否存在
  virtual bool Exists(const std::string& remote_key) = 0;

  // 获取预签名 URL
  virtual std::string GetPresignedUrl(const std::string& remote_key,
                                       int expire_seconds = 3600) = 0;
};

// MinIO 实现
class MinIOClient : public StorageClient {
public:
  MinIOClient(const std::string& endpoint,
              const std::string& access_key,
              const std::string& secret_key,
              const std::string& bucket,
              bool use_ssl = false);

  int Upload(const std::string& local_path,
             const std::string& remote_key) override;

  int Download(const std::string& remote_key,
               const std::string& local_path) override;

  bool Exists(const std::string& remote_key) override;

  std::string GetPresignedUrl(const std::string& remote_key,
                               int expire_seconds = 3600) override;

private:
  std::string endpoint_;
  std::string access_key_;
  std::string secret_key_;
  std::string bucket_;
  bool use_ssl_;
};

// curl S3 API 实现（直接 HTTP PUT）
class CurlS3Client : public StorageClient {
public:
  CurlS3Client(const std::string& endpoint,
               const std::string& access_key,
               const std::string& secret_key,
               const std::string& bucket,
               bool use_ssl = false);

  int Upload(const std::string& local_path,
             const std::string& remote_key) override;
  int Download(const std::string& remote_key,
               const std::string& local_path) override;
  bool Exists(const std::string& remote_key) override;
  std::string GetPresignedUrl(const std::string& remote_key,
                               int expire_seconds = 3600) override;
private:
  std::string endpoint_;
  std::string access_key_;
  std::string secret_key_;
  std::string bucket_;
  bool use_ssl_;
  static int ExecCommand(const std::vector<std::string>& args, int timeout_sec = 300);
};

// AWS CLI 实现
class AwsCliClient : public StorageClient {
public:
  AwsCliClient(const std::string& endpoint,
                const std::string& access_key,
                const std::string& secret_key,
                const std::string& bucket,
                bool use_ssl = false);

  int Upload(const std::string& local_path,
             const std::string& remote_key) override;
  int Download(const std::string& remote_key,
               const std::string& local_path) override;
  bool Exists(const std::string& remote_key) override;
  std::string GetPresignedUrl(const std::string& remote_key,
                               int expire_seconds = 3600) override;
private:
  std::string endpoint_;
  std::string access_key_;
  std::string secret_key_;
  std::string bucket_;
  bool use_ssl_;
  static int ExecCommand(const std::vector<std::string>& args, int timeout_sec = 300);
};

// 链式回退存储客户端：按顺序尝试多种上传方式
class FallbackStorageClient : public StorageClient {
public:
  FallbackStorageClient(const std::string& endpoint,
                         const std::string& access_key,
                         const std::string& secret_key,
                         const std::string& bucket,
                         bool use_ssl = false);

  int Upload(const std::string& local_path,
             const std::string& remote_key) override;
  int Download(const std::string& remote_key,
               const std::string& local_path) override;
  bool Exists(const std::string& remote_key) override;
  std::string GetPresignedUrl(const std::string& remote_key,
                               int expire_seconds = 3600) override;

  // 获取回退链中最后一个成功上传的客户端名称
  std::string GetLastSuccessClient() const { return last_success_; }

private:
  std::vector<std::unique_ptr<StorageClient>> clients_;
  std::string last_success_;
};

}  // namespace drop
