#include "Log.h"
#include <iostream>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <mutex>

namespace drop {

static LogLevel g_current_level = LogLevel::INFO;
static std::mutex g_log_mutex;

std::string GetCurrentTime() {
  auto now = std::time(nullptr);
  auto tm = *std::localtime(&now);
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
  return oss.str();
}

void SetLogLevel(LogLevel level) {
  g_current_level = level;
}

LogLevel GetLogLevel() {
  return g_current_level;
}

void Log(LogLevel level, const char* file, int line, const std::string& msg) {
  const char* level_str = "";
  switch (level) {
    case LogLevel::DEBUG: level_str = "DEBUG"; break;
    case LogLevel::INFO:  level_str = "INFO";  break;
    case LogLevel::WARN:  level_str = "WARN";  break;
    case LogLevel::ERROR: level_str = "ERROR"; break;
  }

  // 只输出文件名，不输出完整路径
  std::string filename(file);
  size_t pos = filename.find_last_of("/\\");
  if (pos != std::string::npos) {
    filename = filename.substr(pos + 1);
  }

  // 加锁保护，防止多线程日志交错
  std::lock_guard<std::mutex> lock(g_log_mutex);
  std::cout << "[" << GetCurrentTime() << "]"
            << "[" << level_str << "]"
            << " " << filename << ":" << line
            << " " << msg << std::endl;
}

}  // namespace drop
