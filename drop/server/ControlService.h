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

  grpc::Status ListAgents(grpc::ServerContext* context,
                          const ListAgentsRequest* request,
                          ListAgentsResponse* response) override;

  grpc::Status StartContinuous(grpc::ServerContext* context,
                               const StartContinuousRequest* request,
                               StartContinuousResponse* response) override;

  grpc::Status StopContinuous(grpc::ServerContext* context,
                              const StopContinuousRequest* request,
                              StopContinuousResponse* response) override;

  grpc::Status ListWindows(grpc::ServerContext* context,
                           const ListWindowsRequest* request,
                           ListWindowsResponse* response) override;

private:
  HotmethodService* hotmethod_service_;
};

}  // namespace drop
