#include "Config.h"
#include "Log.h"
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>

namespace drop {

Config Config::LoadFromFile(const std::string& path) {
  Config config;

  std::ifstream file(path);
  if (!file.is_open()) {
    LOG_ERROR("Failed to open config file: " + path);
    return config;
  }

  nlohmann::json j;
  try {
    file >> j;
  } catch (const nlohmann::json::parse_error& e) {
    LOG_ERROR("Failed to parse config file: " + std::string(e.what()));
    return config;
  }

  config.uid = j.value("uid", "agent-001");
  config.ip_addr = j.value("ip_addr", "127.0.0.1");
  config.server_port = j.value("server_port", 50051);

  if (j.contains("server_ips")) {
    for (const auto& ip : j["server_ips"]) {
      config.server_ips.push_back(ip.get<std::string>());
    }
  }

  if (j.contains("storage")) {
    auto& s = j["storage"];
    config.storage_endpoint = s.value("endpoint", "localhost:9000");
    config.storage_access_key = s.value("access_key", "drop");
    config.storage_secret_key = s.value("secret_key", "dropdrop");
    config.storage_bucket = s.value("bucket", "drop");
    config.storage_use_ssl = s.value("use_ssl", false);
  }

  return config;
}

}  // namespace drop
