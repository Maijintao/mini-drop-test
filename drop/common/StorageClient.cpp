#include "StorageClient.h"
#include <iostream>
#include <fstream>
#include <cstdlib>

namespace drop {

MinIOClient::MinIOClient(const std::string& endpoint,
                           const std::string& access_key,
                           const std::string& secret_key,
                           const std::string& bucket,
                           bool use_ssl)
    : endpoint_(endpoint),
      access_key_(access_key),
      secret_key_(secret_key),
      bucket_(bucket),
      use_ssl_(use_ssl) {}

int MinIOClient::Upload(const std::string& local_path,
                         const std::string& remote_key) {
  // 使用 mc 命令行工具上传（简化实现）
  std::string protocol = use_ssl_ ? "https" : "http";
  std::string cmd = "mc cp " + local_path + " minio/" + bucket_ + "/" + remote_key;

  std::cout << "Uploading: " << local_path << " -> " << remote_key << std::endl;
  int ret = system(cmd.c_str());

  if (ret == 0) {
    std::cout << "Upload successful." << std::endl;
  } else {
    std::cerr << "Upload failed with code " << ret << std::endl;
  }

  return ret;
}

int MinIOClient::Download(const std::string& remote_key,
                           const std::string& local_path) {
  std::string cmd = "mc cp minio/" + bucket_ + "/" + remote_key + " " + local_path;

  std::cout << "Downloading: " << remote_key << " -> " << local_path << std::endl;
  int ret = system(cmd.c_str());

  if (ret == 0) {
    std::cout << "Download successful." << std::endl;
  } else {
    std::cerr << "Download failed with code " << ret << std::endl;
  }

  return ret;
}

bool MinIOClient::Exists(const std::string& remote_key) {
  std::string cmd = "mc stat minio/" + bucket_ + "/" + remote_key + " > /dev/null 2>&1";
  return system(cmd.c_str()) == 0;
}

std::string MinIOClient::GetPresignedUrl(const std::string& remote_key,
                                          int expire_seconds) {
  // 简化实现：返回直接 URL
  std::string protocol = use_ssl_ ? "https" : "http";
  return protocol + "://" + endpoint_ + "/" + bucket_ + "/" + remote_key;
}

}  // namespace drop
