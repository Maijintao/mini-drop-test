#include <gtest/gtest.h>
#include <fstream>
#include <cstdio>
#include "agent/Config.h"
#include "common/Log.h"

using namespace drop;

// 辅助函数：写临时配置文件
static std::string WriteTempConfig(const std::string& content) {
  static int seq = 0;
  std::string path = "/tmp/drop_test_config_" + std::to_string(seq++) + ".json";
  std::ofstream f(path);
  f << content;
  f.close();
  return path;
}

TEST(ConfigTest, LoadValidConfig) {
  auto path = WriteTempConfig(R"({
    "uid": "test-agent",
    "ip_addr": "192.168.1.100",
    "server_port": 50052,
    "server_ips": ["10.0.0.1", "10.0.0.2"],
    "storage": {
      "endpoint": "minio:9000",
      "access_key": "ak",
      "secret_key": "sk",
      "bucket": "my-bucket",
      "use_ssl": true
    },
    "pprof": {
      "host": "0.0.0.0",
      "port": 6061
    }
  })");

  auto cfg = Config::LoadFromFile(path);
  std::remove(path.c_str());

  EXPECT_EQ(cfg.uid, "test-agent");
  EXPECT_EQ(cfg.ip_addr, "192.168.1.100");
  EXPECT_EQ(cfg.server_port, 50052);
  ASSERT_EQ(cfg.server_ips.size(), 2);
  EXPECT_EQ(cfg.server_ips[0], "10.0.0.1");
  EXPECT_EQ(cfg.server_ips[1], "10.0.0.2");
  EXPECT_EQ(cfg.storage_endpoint, "minio:9000");
  EXPECT_EQ(cfg.storage_access_key, "ak");
  EXPECT_EQ(cfg.storage_secret_key, "sk");
  EXPECT_EQ(cfg.storage_bucket, "my-bucket");
  EXPECT_TRUE(cfg.storage_use_ssl);
  EXPECT_EQ(cfg.pprof_host, "0.0.0.0");
  EXPECT_EQ(cfg.pprof_port, 6061);
}

TEST(ConfigTest, LoadPartialConfig) {
  auto path = WriteTempConfig(R"({"uid": "partial-agent"})");
  auto cfg = Config::LoadFromFile(path);
  std::remove(path.c_str());

  EXPECT_EQ(cfg.uid, "partial-agent");
  EXPECT_EQ(cfg.ip_addr, "127.0.0.1");     // 默认值
  EXPECT_EQ(cfg.server_port, 50051);         // 默认值
  EXPECT_TRUE(cfg.server_ips.empty());
  EXPECT_EQ(cfg.pprof_host, "localhost");    // 默认值
  EXPECT_EQ(cfg.pprof_port, 6060);           // 默认值
}

TEST(ConfigTest, LoadMissingFile) {
  auto cfg = Config::LoadFromFile("/tmp/nonexistent_config_12345.json");
  // 缺失文件返回默认空配置
  EXPECT_TRUE(cfg.uid.empty());
  EXPECT_TRUE(cfg.ip_addr.empty());
  EXPECT_EQ(cfg.server_port, 50051);
}

TEST(ConfigTest, LoadInvalidJSON) {
  auto path = WriteTempConfig("{invalid json content");
  auto cfg = Config::LoadFromFile(path);
  std::remove(path.c_str());

  // 解析失败返回默认空配置
  EXPECT_TRUE(cfg.uid.empty());
}

TEST(ConfigTest, LoadEmptyJSON) {
  auto path = WriteTempConfig("{}");
  auto cfg = Config::LoadFromFile(path);
  std::remove(path.c_str());

  EXPECT_EQ(cfg.uid, "agent-001");           // 默认值
  EXPECT_EQ(cfg.ip_addr, "127.0.0.1");       // 默认值
  EXPECT_EQ(cfg.server_port, 50051);
}

TEST(ConfigTest, DefaultValues) {
  Config cfg;
  EXPECT_EQ(cfg.server_port, 50051);
  EXPECT_EQ(cfg.pprof_host, "localhost");
  EXPECT_EQ(cfg.pprof_port, 6060);
  EXPECT_FALSE(cfg.storage_use_ssl);
  EXPECT_TRUE(cfg.server_ips.empty());
}

// TaskStatus 枚举值验证
TEST(TaskStatusTest, EnumValues) {
  EXPECT_EQ(static_cast<int>(TaskStatus::PENDING), 0);
  EXPECT_EQ(static_cast<int>(TaskStatus::DISPATCHED), 1);
  EXPECT_EQ(static_cast<int>(TaskStatus::RUNNING), 2);
  EXPECT_EQ(static_cast<int>(TaskStatus::UPLOADING), 3);
  EXPECT_EQ(static_cast<int>(TaskStatus::DONE), 4);
  EXPECT_EQ(static_cast<int>(TaskStatus::FAILED), 5);
  EXPECT_EQ(static_cast<int>(TaskStatus::TIMEOUT), 6);
}
