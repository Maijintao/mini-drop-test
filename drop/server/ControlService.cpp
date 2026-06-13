#include "ControlService.h"
#include <iostream>

namespace drop {

ControlService::ControlService(HotmethodService* hotmethod_service)
    : hotmethod_service_(hotmethod_service) {}

grpc::Status ControlService::CreateTask(grpc::ServerContext* context,
                                         const CreateTaskRequest* request,
                                         CreateTaskResponse* response) {
  std::cout << "CreateTask: target_ip=" << request->target_ip()
            << " task_id=" << request->task_desc().task_id() << std::endl;

  hotmethod_service_->PushTask(request->target_ip(), request->task_desc());

  response->set_code(0);
  response->set_message("OK");
  return grpc::Status::OK;
}

grpc::Status ControlService::FetchData(grpc::ServerContext* context,
                                        const FetchDataRequest* request,
                                        FetchDataResponse* response) {
  // TODO: 实现数据获取
  response->set_code(-1);
  response->set_message("Not implemented");
  return grpc::Status::OK;
}

grpc::Status ControlService::StatAgent(grpc::ServerContext* context,
                                        const StatAgentRequest* request,
                                        StatAgentResponse* response) {
  // TODO: 实现 Agent 状态查询
  response->set_code(-1);
  return grpc::Status::OK;
}

}  // namespace drop
