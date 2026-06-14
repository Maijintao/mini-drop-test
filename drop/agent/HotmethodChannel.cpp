#include "HotmethodChannel.h"
#include "Perf.h"
#include "IProfiler.h"
#include "BpftraceProfiler.h"
#include "AsyncProfiler.h"
#include "PprofProfiler.h"
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
    std::cout << "Task " << task.task_id() << " cancelled (agent shutdown)" << std::endl;
    task_queue_.pop();
  }
}

void HotmethodChannel::Start() {
  worker_thread_ = std::thread(&HotmethodChannel::WorkerLoop, this);
  std::cout << "Hotmethod channel started." << std::endl;
}

void HotmethodChannel::PushTask(const TaskDesc& task) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (task_queue_.size() >= MAX_TASK_QUEUE_SIZE) {
    std::cerr << "Task queue full, dropping task " << task.task_id() << std::endl;
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
    std::cout << "Task " << result.task_id() << " result reported." << std::endl;
  } else {
    std::cout << "Failed to report result: " << status.error_message() << std::endl;
  }
}

// 根据 profiler_type 选择采集器
static std::unique_ptr<IProfiler> CreateProfiler(int profiler_type) {
  switch (profiler_type) {
    case PROFILER_PERF:
      return nullptr;  // Perf 使用静态方法
    case PROFILER_ASYNC_PROFILER:
      return std::make_unique<AsyncProfiler>();
    case PROFILER_PPROF:
      return std::make_unique<PprofProfiler>();
    case PROFILER_BPFTRACE:
      return std::make_unique<BpftraceProfiler>();
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

    std::cout << "Executing task " << task.task_id()
              << " type=" << task.task_type()
              << " profiler_type=" << task.profiler_type()
              << " pid=" << task.sample_argv().pid()
              << " duration=" << task.sample_argv().duration() << "s" << std::endl;

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

    // 选择采集器执行
    if (task.profiler_type() == PROFILER_PERF) {
      ret = Perf::Record(
        task.sample_argv().pid(),
        task.sample_argv().duration(),
        task.sample_argv().hz(),
        output_path
      );
    } else {
      auto profiler = CreateProfiler(task.profiler_type());
      if (profiler) {
        ret = profiler->Record(
          task.sample_argv().pid(),
          task.sample_argv().duration(),
          task.sample_argv().hz(),
          output_path
        );
      } else {
        std::cerr << "Unknown profiler type: " << task.profiler_type() << std::endl;
      }
    }

    // 上报结果
    TaskResult result;
    result.set_task_id(task.task_id());

    if (ret == 0) {
      std::cout << "Task " << task.task_id() << " completed, output: " << output_path << std::endl;
      result.set_error_message("");

      // 上传采集结果到 MinIO
      if (storage_) {
        std::string remote_key = "profiler/" + task.task_id() + "/" + task.task_id() + ext;
        int upload_ret = storage_->Upload(output_path, remote_key);
        if (upload_ret == 0) {
          std::cout << "Task " << task.task_id() << " uploaded to " << remote_key << std::endl;
          std::remove(output_path.c_str());
        } else {
          std::cerr << "Task " << task.task_id() << " upload failed" << std::endl;
        }
      }
    } else {
      std::cout << "Task " << task.task_id() << " failed with code " << ret << std::endl;
      result.set_error_message("profiler failed with code " + std::to_string(ret));
    }

    ReportResult(result);
  }
}

}  // namespace drop
