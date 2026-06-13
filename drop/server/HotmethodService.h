#pragma once

#include <grpcpp/grpcpp.h>
#include "hotmethod.grpc.pb.h"
#include <map>
#include <deque>
#include <mutex>

namespace drop {

class HotmethodService final : public Hotmethod::Service {
public:
  // 添加任务到队列
  void PushTask(const std::string& target_ip, const TaskDesc& task);

  // 获取待派发任务（心跳时调用）
  bool PopTask(const std::string& target_ip, TaskDesc* task);

  grpc::Status NotifyResult(grpc::ServerContext* context,
                            const TaskResult* request,
                            google::protobuf::Empty* response) override;

private:
  std::map<std::string, std::deque<TaskDesc>> tasks_;
  std::mutex mutex_;
};

}  // namespace drop
