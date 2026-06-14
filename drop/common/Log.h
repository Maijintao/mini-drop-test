#pragma once

#include <string>

namespace drop {

enum class LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
};

// 设置全局日志级别
void SetLogLevel(LogLevel level);

// 获取当前日志级别
LogLevel GetLogLevel();

// 日志输出函数（内部使用）
void Log(LogLevel level, const char* file, int line, const std::string& msg);

}  // namespace drop

// 日志宏：自动捕获文件名和行号
#define LOG_DEBUG(msg) \
  do { if (drop::GetLogLevel() <= drop::LogLevel::DEBUG) drop::Log(drop::LogLevel::DEBUG, __FILE__, __LINE__, msg); } while(0)

#define LOG_INFO(msg) \
  do { if (drop::GetLogLevel() <= drop::LogLevel::INFO) drop::Log(drop::LogLevel::INFO, __FILE__, __LINE__, msg); } while(0)

#define LOG_WARN(msg) \
  do { if (drop::GetLogLevel() <= drop::LogLevel::WARN) drop::Log(drop::LogLevel::WARN, __FILE__, __LINE__, msg); } while(0)

#define LOG_ERROR(msg) \
  do { if (drop::GetLogLevel() <= drop::LogLevel::ERROR) drop::Log(drop::LogLevel::ERROR, __FILE__, __LINE__, msg); } while(0)
