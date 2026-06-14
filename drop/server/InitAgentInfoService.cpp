#include "InitAgentInfoService.h"
#include <iostream>

namespace drop {

InitAgentInfoService::InitAgentInfoService(const AgentConfig& config)
    : storage_config_(config) {}

grpc::Status InitAgentInfoService::RegisterAgent(grpc::ServerContext* context,
                                                  const RegisterAgentRequest* request,
                                                  RegisterAgentResponse* response) {
  // 参数校验
  if (request->uid().empty() || request->ip_addr().empty()) {
    response->set_code(-1);
    response->set_message("uid and ip_addr are required");
    return grpc::Status::OK;
  }

  std::lock_guard<std::mutex> lock(mutex_);

  std::cout << "Agent registered: " << request->host_name()
            << " (" << request->ip_addr() << ")" << std::endl;

  registered_agents_[request->uid()] = true;

  response->set_code(0);
  response->set_message("OK");
  return grpc::Status::OK;
}

grpc::Status InitAgentInfoService::FetchConfig(grpc::ServerContext* context,
                                                const FetchConfigRequest* request,
                                                FetchConfigResponse* response) {
  std::cout << "Config requested by agent: " << request->uid() << std::endl;

  // storage_config_ 是不可变的，无需加锁
  auto* cos_config = response->mutable_cos_config();
  cos_config->set_endpoint(storage_config_.endpoint);
  cos_config->set_access_key(storage_config_.access_key);
  cos_config->set_secret_key(storage_config_.secret_key);
  cos_config->set_bucket(storage_config_.bucket);
  cos_config->set_use_ssl(storage_config_.use_ssl);

  response->set_code(0);
  return grpc::Status::OK;
}

}  // namespace drop
