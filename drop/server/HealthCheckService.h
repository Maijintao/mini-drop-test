#pragma once

#include <grpcpp/grpcpp.h>
#include "healthcheck.grpc.pb.h"
#include "HotmethodService.h"

namespace drop {

class HealthCheckService final : public HealthCheck::Service {
public:
  HealthCheckService(HotmethodService* hotmethod_service);

  grpc::Status Do(grpc::ServerContext* context,
                  const HealthCheckRequest* request,
                  HealthCheckResponse* response) override;

private:
  HotmethodService* hotmethod_service_;
};

}  // namespace drop
