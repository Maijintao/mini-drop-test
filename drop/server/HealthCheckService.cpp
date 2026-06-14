#include "HealthCheckService.h"
#include <iostream>

namespace drop {

HealthCheckService::HealthCheckService(HotmethodService* hotmethod_service)
    : hotmethod_service_(hotmethod_service) {}

grpc::Status HealthCheckService::Do(grpc::ServerContext* context,
                                     const HealthCheckRequest* request,
                                     HealthCheckResponse* response) {
  std::cout << "Heartbeat from " << request->host_name()
            << " (" << request->ip_addr() << ")" << std::endl;

  // 更新 Agent 心跳状态（供 StatAgent 查询）
  hotmethod_service_->UpdateAgentStatus(
    request->ip_addr(),
    request->host_name(),
    request->agent_version(),
    request->self_pstats(),
    request->children_pstats()
  );

  response->set_status(HealthCheckResponse::SERVING);

  // 检查是否有待派发任务
  TaskDesc task;
  if (hotmethod_service_->PopTask(request->ip_addr(), &task)) {
    response->set_pending(true);
    *response->mutable_task_desc() = task;
    std::cout << "Dispatching task " << task.task_id()
              << " to " << request->ip_addr() << std::endl;
  } else {
    response->set_pending(false);
  }

  return grpc::Status::OK;
}

}  // namespace drop
