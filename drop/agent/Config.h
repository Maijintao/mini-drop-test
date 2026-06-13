#pragma once

#include <string>
#include <vector>

namespace drop {

struct Config {
  std::string uid;
  std::string hostname;
  std::string ip_addr;
  std::vector<std::string> server_ips;
  int server_port = 50051;

  // MinIO 配置
  std::string storage_endpoint;
  std::string storage_access_key;
  std::string storage_secret_key;
  std::string storage_bucket;
  bool storage_use_ssl = false;

  static Config LoadFromFile(const std::string& path);
};

}  // namespace drop
