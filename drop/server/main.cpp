#include <iostream>
#include <string>
#include <grpcpp/grpcpp.h>
#include "HealthCheckService.h"
#include "HotmethodService.h"
#include "ControlService.h"

int main(int argc, char* argv[]) {
  std::string server_address("0.0.0.0:50051");

  drop::HotmethodService hotmethod_service;
  drop::HealthCheckService health_service(&hotmethod_service);
  drop::ControlService control_service(&hotmethod_service);

  grpc::ServerBuilder builder;
  builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
  builder.RegisterService(&health_service);
  builder.RegisterService(&hotmethod_service);
  builder.RegisterService(&control_service);

  auto server = builder.BuildAndStart();
  std::cout << "drop_server listening on " << server_address << std::endl;

  server->Wait();
  return 0;
}