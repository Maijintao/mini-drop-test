#include "HotmethodChannel.h"
#include "Perf.h"
#include "IProfiler.h"
#include "BpftraceProfiler.h"
#include "AsyncProfiler.h"
#include "PprofProfiler.h"
#include "MemrayProfiler.h"
#include "JavaHeapDumper.h"
#include "ResourceProfiler.h"
#include "ScriptRunner.h"
#include "Log.h"
#include <iostream>
#include <chrono>
#include <fstream>
#include <memory>
#include <algorithm>

namespace drop {

HotmethodChannel::HotmethodChannel(const std::string& server_addr, const Config& config, std::atomic<bool>& running)
    : server_addr_(server_addr), config_(config), running_(running) {
  auto channel = grpc::CreateChannel(server_addr, grpc::InsecureChannelCredentials());
  stub_ = Hotmethod::NewStub(channel);

  // 初始化存储客户端（链式回退：mc CLI → curl S3 → AWS CLI）
  if (!config.storage_endpoint.empty()) {
    storage_ = std::make_unique<FallbackStorageClient>(
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
  // N23: 重试 3 次，避免网络抖动导致结果丢失、任务超时
  for (int attempt = 1; attempt <= 3; attempt++) {
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
    google::protobuf::Empty empty;
    auto status = stub_->NotifyResult(&context, result, &empty);
    if (status.ok()) {
      LOG_INFO("Task " + result.task_id() + " result reported.");
      return;
    }
    LOG_ERROR("NotifyResult attempt " + std::to_string(attempt) + "/3 failed: " + status.error_message());
    if (attempt < 3) {
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
  }
  LOG_ERROR("NotifyResult all retries exhausted for task " + result.task_id());
}

void HotmethodChannel::ReportStatus(const std::string& task_id, TaskState state, const std::string& reason) {
  for (int attempt = 1; attempt <= 3; attempt++) {
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(5));
    TaskStatusUpdate update;
    update.set_task_id(task_id);
    update.set_status(state);
    update.set_reason(reason);
    google::protobuf::Empty empty;
    auto status = stub_->UpdateTaskStatus(&context, update, &empty);
    if (status.ok()) {
      return;
    }
    LOG_ERROR("UpdateTaskStatus attempt " + std::to_string(attempt) + "/3 failed for task " +
              task_id + ": " + status.error_message());
    if (attempt < 3) {
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
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
      return std::make_unique<PprofProfiler>(config.pprof_host, config.pprof_port,
                                             event == "heap" ? "heap" : "cpu");
    case PROFILER_BPFTRACE:
      return std::make_unique<BpftraceProfiler>(event);
    case PROFILER_MEMRAY:
      return std::make_unique<MemrayProfiler>();
    case PROFILER_JAVA_HEAP:
      return std::make_unique<JavaHeapDumper>();
    case PROFILER_RESOURCE:
      return std::make_unique<ResourceProfiler>();
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
    int duration_sec = static_cast<int>(task.sample_argv().duration());
    if (timeout_sec > 5 && duration_sec > timeout_sec - 5) {
      duration_sec = std::max(1, timeout_sec - 5);
    }

    LOG_INFO("Executing task " + task.task_id() +
             " type=" + std::to_string(task.task_type()) +
             " profiler_type=" + std::to_string(task.profiler_type()) +
             " pid=" + std::to_string(task.sample_argv().pid()) +
             " duration=" + std::to_string(duration_sec) + "s" +
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
    } else if (task.profiler_type() == PROFILER_MEMRAY) {
      ext = ".bin";
    } else if (task.profiler_type() == PROFILER_JAVA_HEAP) {
      ext = ".hprof";
    } else if (task.profiler_type() == PROFILER_RESOURCE) {
      ext = ".json";
    }

    std::string output_path = "/tmp/profiler_" + task.task_id() + ext;
    int ret = -1;
    std::unique_ptr<IProfiler> profiler;

    // 脚本执行任务：有 script_content 时走 ScriptRunner
    if (!task.script_content().empty()) {
      std::string script_path = "/tmp/script_" + task.task_id() + ".sh";
      {
        std::ofstream sf(script_path);
        sf << task.script_content();
      }
      LOG_INFO("Executing script task " + task.task_id() + ": " + script_path);
      ret = ScriptRunner::Execute(script_path, {}, timeout_sec);
      std::remove(script_path.c_str());
    } else {
      // 选择采集器执行（统一走 IProfiler 多态接口）
      profiler = CreateProfiler(task.profiler_type(), config_, task.sample_argv().event());
      if (profiler) {
        ret = profiler->Record(
          task.sample_argv().pid(),
          duration_sec,
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

      // 后处理：格式转换（如 perf script、memray flamegraph）
      std::string upload_path = output_path;
      std::string upload_ext = ext;
      if (profiler) {
        std::string result_ext = ext;
        if (task.profiler_type() == PROFILER_PERF) {
          result_ext = ".txt";  // perf script 文本，analyzer 按 perf script 处理
        } else if (task.profiler_type() == PROFILER_MEMRAY) {
          result_ext = ".html";  // memray flamegraph 产出 HTML
        }
        std::string result_path = "/tmp/result_" + task.task_id() + result_ext;
        int post_ret = profiler->collect_result(output_path, result_path);
        if (post_ret == 0) {
          upload_path = result_path;
          upload_ext = result_ext;
          LOG_INFO("Task " + task.task_id() + " post-processed: " + result_path);
        }
      }

      // 状态迁移：UPLOADING（正在上传到存储）
      ReportStatus(task.task_id(), TASK_UPLOADING, "采集完成，正在上传结果到存储");

      // 上传采集结果到 MinIO
      if (storage_) {
        LOG_INFO("Task " + task.task_id() + " uploading...");
        std::string remote_key = "profiler/" + task.task_id() + "/" + task.task_id() + upload_ext;
        int upload_ret = storage_->Upload(upload_path, remote_key);
        if (upload_ret == 0) {
          LOG_INFO("Task " + task.task_id() + " uploaded to " + remote_key);
          result.set_cos_key(remote_key);  // 设置 cos_key
          std::remove(output_path.c_str());
          if (upload_path != output_path) std::remove(upload_path.c_str());
        } else {
          // 模式 4 回退：将文件内容嵌入 gRPC 消息
          LOG_WARN("Task " + task.task_id() + " upload failed, trying gRPC embed fallback...");
          std::ifstream ifs(upload_path, std::ios::binary | std::ios::ate);
          if (ifs.is_open()) {
            auto size = ifs.tellg();
            ifs.seekg(0);
            // 限制嵌入大小（最大 16MB）
            constexpr size_t MAX_EMBED_SIZE = 16 * 1024 * 1024;
            if (size > 0 && static_cast<size_t>(size) <= MAX_EMBED_SIZE) {
              std::string content(size, '\0');
              ifs.read(content.data(), size);
              auto* file = result.mutable_file();
              file->set_name(task.task_id() + upload_ext);
              file->set_content(content);
              file->set_size(size);
              result.set_error_message("");
              LOG_INFO("Task " + task.task_id() + " embedded in gRPC message (" +
                       std::to_string(size) + " bytes)");
              std::remove(output_path.c_str());
              if (upload_path != output_path) std::remove(upload_path.c_str());
            } else {
              // 模式 5 回退：保留本地文件，报告路径
              LOG_WARN("Task " + task.task_id() + " file too large for embed (" +
                       std::to_string(size) + " bytes), keeping local file");
              result.set_error_message("upload failed, local file: " + upload_path);
            }
          } else {
            result.set_error_message("upload failed and cannot read local file: " + upload_path);
          }
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
