#include <iostream>
#include <string>
#include <grpcpp/grpcpp.h>
#include "HealthCheckService.h"
#include "HotmethodService.h"
#include "ControlService.h"
#include "InitAgentInfoService.h"

int main(int argc, char* argv[]) {
  std::string server_address("0.0.0.0:50051");

  drop::HotmethodService hotmethod_service;
  drop::HealthCheckService health_service(&hotmethod_service);
  drop::ControlService control_service(&hotmethod_service);
  drop::InitAgentInfoService init_service;

  // 设置默认存储配置
  drop::AgentConfig storage_config;
  storage_config.endpoint = "localhost:9000";
  storage_config.access_key = "drop";
  storage_config.secret_key = "dropdrop";
  storage_config.bucket = "drop";
  storage_config.use_ssl = false;
  init_service.SetStorageConfig(storage_config);

  grpc::ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&health_service);
  builder.RegisterService(&hotmethod_service);
  builder.RegisterService(&control_service);
  builder.RegisterService(&init_service);

  auto server = builder.BuildAndStart();
  std::cout << "drop_server listening on " << server_address << std::endl;

  server->Wait();
  return 0;
}