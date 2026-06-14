#include "ControlService.h"
#include "Log.h"
#include <iostream>

namespace drop {

ControlService::ControlService(HotmethodService* hotmethod_service)
    : hotmethod_service_(hotmethod_service) {}

grpc::Status ControlService::CreateTask(grpc::ServerContext* context,
                                         const CreateTaskRequest* request,
                                         CreateTaskResponse* response) {
  // 参数校验
  if (request->target_ip().empty()) {
    response->set_code(-1);
    response->set_message("target_ip is required");
    return grpc::Status::OK;
  }
  if (request->task_desc().task_id().empty()) {
    response->set_code(-1);
    response->set_message("task_id is required");
    return grpc::Status::OK;
  }

  LOG_INFO("CreateTask: target_ip=" + request->target_ip() +
           " task_id=" + request->task_desc().task_id());

  bool ok = hotmethod_service_->PushTask(request->target_ip(), request->task_desc());
  if (!ok) {
    response->set_code(-1);
    response->set_message("Task queue full for target agent");
    return grpc::Status::OK;
  }

  response->set_code(0);
  response->set_message("OK");
  return grpc::Status::OK;
}

grpc::Status ControlService::FetchData(grpc::ServerContext* context,
                                        const FetchDataRequest* request,
                                        FetchDataResponse* response) {
  if (request->task_id().empty()) {
    response->set_code(-1);
    response->set_message("task_id is required");
    return grpc::Status::OK;
  }

  TaskResult result;
  if (hotmethod_service_->GetResult(request->task_id(), &result)) {
    response->set_code(0);
    response->set_message("OK");
    if (result.has_file()) {
      *response->mutable_file() = result.file();
    }
    response->set_cos_key(result.cos_key());
  } else {
    response->set_code(-1);
    response->set_message("Result not found");
  }
  return grpc::Status::OK;
}

grpc::Status ControlService::StatAgent(grpc::ServerContext* context,
                                        const StatAgentRequest* request,
                                        StatAgentResponse* response) {
  if (request->ip_addr().empty()) {
    response->set_code(-1);
    response->set_message("ip_addr is required");
    return grpc::Status::OK;
  }

  AgentStatus status;
  if (hotmethod_service_->GetAgentStatus(request->ip_addr(), &status)) {
    response->set_code(0);
    response->set_message("OK");
    *response->mutable_self_pstats() = status.self_pstats;
    *response->mutable_children_pstats() = status.children_pstats;
  } else {
    response->set_code(-1);
    response->set_message("Agent not found or no heartbeat received");
  }

  return grpc::Status::OK;
}

}  // namespace drop
