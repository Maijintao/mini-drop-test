#pragma once

#include <grpcpp/grpcpp.h>
#include "init.grpc.pb.h"
#include <map>
#include <mutex>

namespace drop {

struct AgentConfig {
  std::string endpoint;
  std::string access_key;
  std::string secret_key;
  std::string bucket;
  bool use_ssl = false;
};

class InitAgentInfoService final : public Init::Service {
public:
  // 构造时传入配置，避免运行时修改
  explicit InitAgentInfoService(const AgentConfig& config);

  grpc::Status RegisterAgent(grpc::ServerContext* context,
                              const RegisterAgentRequest* request,
                              RegisterAgentResponse* response) override;

  grpc::Status FetchConfig(grpc::ServerContext* context,
                            const FetchConfigRequest* request,
                            FetchConfigResponse* response) override;

private:
  const AgentConfig storage_config_;  // 不可变，天然线程安全
  std::map<std::string, bool> registered_agents_;
  std::mutex mutex_;  // 保护 registered_agents_
};

}  // namespace drop
