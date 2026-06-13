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
  bool use_ssl;
};

class InitAgentInfoService final : public Init::Service {
public:
  grpc::Status RegisterAgent(grpc::ServerContext* context,
                              const RegisterAgentRequest* request,
                              RegisterAgentResponse* response) override;

  grpc::Status FetchConfig(grpc::ServerContext* context,
                            const FetchConfigRequest* request,
                            FetchConfigResponse* response) override;

  // 设置存储配置
  void SetStorageConfig(const AgentConfig& config);

private:
  AgentConfig storage_config_;
  std::map<std::string, bool> registered_agents_;
  std::mutex mutex_;
};

}  // namespace drop
