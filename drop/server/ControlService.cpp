#include "ControlService.h"
#include "Log.h"
#include <iostream>
#include <string>

namespace drop {

namespace {
int PublicTaskStatus(TaskStatus status) {
  switch (status) {
    case TaskStatus::DISPATCHED:
      return static_cast<int>(TaskStatus::PENDING);
    case TaskStatus::TIMEOUT:
      return static_cast<int>(TaskStatus::FAILED);
    default:
      return static_cast<int>(status);
  }
}
}

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
    if (!result.error_message().empty()) {
      response->set_code(-1);
      response->set_message(result.error_message());
      return grpc::Status::OK;
    }
    response->set_code(0);
    response->set_message("OK");
    if (result.has_file()) {
      *response->mutable_file() = result.file();
    }
    response->set_cos_key(result.cos_key());
  } else {
    TaskStateInfo state;
    if (hotmethod_service_->GetTaskStatus(request->task_id(), &state)) {
      response->set_code(1);
      response->set_message("STATUS:" + std::to_string(PublicTaskStatus(state.status)) + ":" + state.reason);
    } else {
      response->set_code(-1);
      response->set_message("Result not found");
    }
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

grpc::Status ControlService::ListAgents(grpc::ServerContext* context,
                                         const ListAgentsRequest* request,
                                         ListAgentsResponse* response) {
  // 从 HotmethodService 获取所有 agent 状态
  std::vector<AgentStatus> agents;
  hotmethod_service_->GetAllAgentStatus(&agents);

  response->set_code(0);
  response->set_message("OK");

  for (const auto& agent : agents) {
    auto* agent_info = response->add_agents();
    agent_info->set_host_name(agent.host_name);
    agent_info->set_ip_addr(agent.ip_addr);
    agent_info->set_agent_version(agent.agent_version);
    agent_info->set_online(agent.online);
    agent_info->set_uid(agent.uid);
    *agent_info->mutable_self_pstats() = agent.self_pstats;
    *agent_info->mutable_children_pstats() = agent.children_pstats;
  }

  return grpc::Status::OK;
}

grpc::Status ControlService::StartContinuous(grpc::ServerContext* context,
                                              const StartContinuousRequest* request,
                                              StartContinuousResponse* response) {
  if (request->target_ip().empty()) {
    response->set_code(-1);
    response->set_message("target_ip is required");
    return grpc::Status::OK;
  }
  if (request->pid() <= 0) {
    response->set_code(-1);
    response->set_message("pid is required");
    return grpc::Status::OK;
  }

  std::string task_id = hotmethod_service_->StartContinuousTask(
      request->target_ip(), request->pid(), request->hz(),
      request->window_sec(), request->profiler_type(),
      request->callgraph(), request->event());

  if (task_id.empty()) {
    response->set_code(-1);
    response->set_message("Failed to start continuous task");
    return grpc::Status::OK;
  }

  LOG_INFO("StartContinuous: task_id=" + task_id + " target=" + request->target_ip());
  response->set_code(0);
  response->set_message("OK");
  response->set_task_id(task_id);
  return grpc::Status::OK;
}

grpc::Status ControlService::StopContinuous(grpc::ServerContext* context,
                                             const StopContinuousRequest* request,
                                             StopContinuousResponse* response) {
  if (request->task_id().empty()) {
    response->set_code(-1);
    response->set_message("task_id is required");
    return grpc::Status::OK;
  }

  bool ok = hotmethod_service_->StopContinuousTask(request->task_id());
  response->set_code(ok ? 0 : -1);
  response->set_message(ok ? "OK" : "Task not found");
  return grpc::Status::OK;
}

grpc::Status ControlService::ListWindows(grpc::ServerContext* context,
                                          const ListWindowsRequest* request,
                                          ListWindowsResponse* response) {
  if (request->task_id().empty()) {
    response->set_code(-1);
    response->set_message("task_id is required");
    return grpc::Status::OK;
  }

  std::vector<ContinuousWindowRecord> windows;
  hotmethod_service_->GetContinuousWindows(request->task_id(), &windows);

  response->set_code(0);
  response->set_message("OK");
  for (const auto& w : windows) {
    auto* info = response->add_windows();
    info->set_window_tid(w.window_tid);
    info->set_seq(w.seq);
    info->set_start_time(w.start_time);
    info->set_end_time(w.end_time);
    info->set_status(w.status);
    info->set_cos_key(w.cos_key);
  }
  return grpc::Status::OK;
}

}  // namespace drop
