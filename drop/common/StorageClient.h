#pragma once

#include <string>
#include <vector>

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

}  // namespace drop
