#include "HealthCheckService.h"
#include "Log.h"
#include <iostream>

namespace drop {

HealthCheckService::HealthCheckService(HotmethodService* hotmethod_service)
    : hotmethod_service_(hotmethod_service) {}

grpc::Status HealthCheckService::Do(grpc::ServerContext* context,
                                     const HealthCheckRequest* request,
                                     HealthCheckResponse* response) {
  // 心跳日志降级为 DEBUG，避免刷屏（每 5 秒一次心跳）
  LOG_DEBUG("Heartbeat from " + request->host_name() + " (" + request->ip_addr() + ")");

  // 更新 Agent 心跳状态（供 StatAgent 查询）
  hotmethod_service_->UpdateAgentStatus(
    request->ip_addr(),
    request->host_name(),
    request->uid(),
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
    LOG_INFO("Dispatching task " + task.task_id() + " to " + request->ip_addr());
  } else {
    response->set_pending(false);
  }

  return grpc::Status::OK;
}

}  // namespace drop
