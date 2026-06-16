#include "HotmethodChannel.h"
#include "Perf.h"
#include "IProfiler.h"
#include "BpftraceProfiler.h"
#include "AsyncProfiler.h"
#include "PprofProfiler.h"
#include "ScriptRunner.h"
#include "Log.h"
#include <iostream>
#include <chrono>
#include <fstream>
#include <memory>

namespace drop {

HotmethodChannel::HotmethodChannel(const std::string& server_addr, const Config& config, std::atomic<bool>& running)
    : server_addr_(server_addr), config_(config), running_(running) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = Hotmethod::NewStub(channel);

  // 初始化 MinIO 客户端
  if (!config.storage_endpoint.empty()) {
    storage_ = std::make_unique<MinIOClient>(
      config.storage_endpoint,
      config.storage_access_key,
      config.storage_secret_key,
      config.storage_bucket,
      config.storage_use_ssl
    );
  }
}

HotmethodChannel::~HotmethodChannel() {
  // 通知工作线程退出
  cv_.notify_all();
  if (worker_thread_.joinable()) {
    worker_thread_.join();
  }

  // 清空队列中未处理的任务，上报失败
  std::lock_guard<std::mutex> lock(mutex_);
  while (!task_queue_.empty()) {
    auto& task = task_queue_.front();
    TaskResult result;
    result.set_task_id(task.task_id());
    result.set_error_message("agent shutting down");
    ReportResult(result);
    LOG_INFO("Task " + task.task_id() + " cancelled (agent shutdown)");
    task_queue_.pop();
  }
}

void HotmethodChannel::Start() {
  worker_thread_ = std::thread(&HotmethodChannel::WorkerLoop, this);
  LOG_INFO("Hotmethod channel started.");
}

void HotmethodChannel::PushTask(const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (task_queue_.size() >= MAX_TASK_QUEUE_SIZE) {
    LOG_ERROR("Task queue full, dropping task " + task.task_id());
    return;
  }
  task_queue_.push(task);
  cv_.notify_one();
}

void HotmethodChannel::ReportResult(const TaskResult& result) {
  grpc::ClientContext context;
  context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
  google::protobuf::Empty empty;
  auto status = stub_->NotifyResult(&context, result, &empty);
  if (status.ok()) {
    LOG_INFO("Task " + result.task_id() + " result reported.");
  } else {
    LOG_ERROR("Failed to report result: " + status.error_message());
  }
}

void HotmethodChannel::ReportStatus(const std::string& task_id, TaskState state, const std::string& reason) {
  grpc::ClientContext context;
  context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
  TaskStatusUpdate update;
  update.set_task_id(task_id);
  update.set_status(state);
  update.set_reason(reason);
  google::protobuf::Empty empty;
  auto status = stub_->UpdateTaskStatus(&context, update, &empty);
  if (!status.ok()) {
    LOG_ERROR("Failed to report status for task " + task_id + ": " + status.error_message());
  }
}

// 根据 profiler_type 选择采集器
static std::unique_ptr<IProfiler> CreateProfiler(int profiler_type, const Config& config,
                                                  const std::string& event = "") {
  switch (profiler_type) {
    case PROFILER_PERF:
      return std::make_unique<Perf>();
    case PROFILER_ASYNC_PROFILER:
      return std::make_unique<AsyncProfiler>();
    case PROFILER_PPROF:
      return std::make_unique<PprofProfiler>(config.pprof_host, config.pprof_port);
    case PROFILER_BPFTRACE:
      return std::make_unique<BpftraceProfiler>(event);
    default:
      return nullptr;
  }
}

void HotmethodChannel::WorkerLoop() {
  while (running_) {
    TaskDesc task;
    {
      std::unique_lock<std::mutex> lock(mutex_);
      cv_.wait(lock, [this] { return !task_queue_.empty() || !running_; });
      if (!running_) break;
      task = task_queue_.front();
      task_queue_.pop();
    }

    // 使用 TaskDesc.timeout_sec 作为超时保护
    int timeout_sec = task.timeout_sec() > 0 ? task.timeout_sec() : 60;

    LOG_INFO("Executing task " + task.task_id() +
             " type=" + std::to_string(task.task_type()) +
             " profiler_type=" + std::to_string(task.profiler_type()) +
             " pid=" + std::to_string(task.sample_argv().pid()) +
             " duration=" + std::to_string(task.sample_argv().duration()) + "s" +
             " timeout=" + std::to_string(timeout_sec) + "s");

    // 状态迁移：RUNNING（Agent 开始执行采集）
    ReportStatus(task.task_id(), TASK_RUNNING, "Agent 开始执行采集任务");

    // 根据采集器类型选择输出文件扩展名
    std::string ext = ".data";
    if (task.profiler_type() == PROFILER_BPFTRACE) {
      ext = ".txt";
    } else if (task.profiler_type() == PROFILER_ASYNC_PROFILER) {
      ext = ".collapsed";
    } else if (task.profiler_type() == PROFILER_PPROF) {
      ext = ".pb.gz";
    }

    std::string output_path = "/tmp/profiler_" + task.task_id() + ext;
    int ret = -1;

    // 脚本执行任务：有 script_content 时走 ScriptRunner
    if (!task.script_content().empty()) {
      std::string script_path = "/tmp/script_" + task.task_id() + ".sh";
      {
        std::ofstream sf(script_path);
        sf << task.script_content();
      }
      LOG_INFO("Executing script task " + task.task_id() + ": " + script_path);
      ret = ScriptRunner::Execute(script_path, {});
      std::remove(script_path.c_str());
    } else {
      // 选择采集器执行（统一走 IProfiler 多态接口）
      auto profiler = CreateProfiler(task.profiler_type(), config_, task.sample_argv().event());
      if (profiler) {
        ret = profiler->Record(
          task.sample_argv().pid(),
          task.sample_argv().duration(),
          task.sample_argv().hz(),
          output_path
        );
      } else {
        LOG_ERROR("Unknown profiler type: " + std::to_string(task.profiler_type()));
      }
    }

    // 上报结果
    TaskResult result;
    result.set_task_id(task.task_id());

    if (ret == 0) {
      LOG_INFO("Task " + task.task_id() + " completed, output: " + output_path);
      result.set_error_message("");

      // 状态迁移：UPLOADING（正在上传到存储）
      ReportStatus(task.task_id(), TASK_UPLOADING, "采集完成，正在上传结果到存储");

      // 上传采集结果到 MinIO
      if (storage_) {
        LOG_INFO("Task " + task.task_id() + " uploading...");
        std::string remote_key = "profiler/" + task.task_id() + "/" + task.task_id() + ext;
        int upload_ret = storage_->Upload(output_path, remote_key);
        if (upload_ret == 0) {
          LOG_INFO("Task " + task.task_id() + " uploaded to " + remote_key);
          result.set_cos_key(remote_key);  // 设置 cos_key
          std::remove(output_path.c_str());
        } else {
          LOG_ERROR("Task " + task.task_id() + " upload failed, marking task as failed");
          result.set_error_message("upload to storage failed with code " + std::to_string(upload_ret));
        }
      } else {
        LOG_ERROR("Task " + task.task_id() + " no storage configured");
        result.set_error_message("no storage configured, cannot upload result");
      }
    } else {
      LOG_ERROR("Task " + task.task_id() + " failed with code " + std::to_string(ret));
      result.set_error_message("profiler failed with code " + std::to_string(ret));
    }

    ReportResult(result);
  }
}

}  // namespace drop
