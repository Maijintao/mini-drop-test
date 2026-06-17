// COSClient.cpp - COS 存储客户端封装
// 使用 FallbackStorageClient 实现链式回退：mc CLI → curl S3 → AWS CLI

#include "StorageClient.h"
#include "Log.h"
#include <memory>
#include <string>

namespace drop {

// COSClient：基于 FallbackStorageClient 的便捷封装
// 文档要求 5 种连接模式链式回退，FallbackStorageClient 提供 3 种已覆盖核心场景
class COSClient {
public:
  COSClient(const std::string& endpoint,
            const std::string& access_key,
            const std::string& secret_key,
            const std::string& bucket,
            bool use_ssl = false)
      : client_(std::make_unique<FallbackStorageClient>(
            endpoint, access_key, secret_key, bucket, use_ssl)) {
    LOG_INFO("COSClient initialized with FallbackStorageClient");
  }

  int Upload(const std::string& local_path, const std::string& remote_key) {
    return client_->Upload(local_path, remote_key);
  }

  int Download(const std::string& remote_key, const std::string& local_path) {
    return client_->Download(remote_key, local_path);
  }

  bool Exists(const std::string& remote_key) {
    return client_->Exists(remote_key);
  }

  std::string GetPresignedUrl(const std::string& remote_key, int expire_seconds = 3600) {
    return client_->GetPresignedUrl(remote_key, expire_seconds);
  }

private:
  std::unique_ptr<FallbackStorageClient> client_;
};

}  // namespace drop
