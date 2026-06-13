#pragma once

#include <grpcpp/grpcpp.h>
#include "control.grpc.pb.h"
#include "HotmethodService.h"

namespace drop {

class ControlService final : public Control::Service {
public:
  ControlService(HotmethodService* hotmethod_service);

  grpc::Status CreateTask(grpc::ServerContext* context,
                          const CreateTaskRequest* request,
                          CreateTaskResponse* response) override;

  grpc::Status FetchData(grpc::ServerContext* context,
                         const FetchDataRequest* request,
                         FetchDataResponse* response) override;

  grpc::Status StatAgent(grpc::ServerContext* context,
                         const StatAgentRequest* request,
                         StatAgentResponse* response) override;

private:
  HotmethodService* hotmethod_service_;
};

}  // namespace drop
