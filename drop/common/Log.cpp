#include <iostream>
#include <string>
#include <ctime>
#include <iomanip>
#include <sstream>

namespace drop {

enum class LogLevel {
  INFO,
  WARN,
  ERROR,
  DEBUG
};

static LogLevel current_level = LogLevel::INFO;

std::string GetCurrentTime() {
  auto now = std::time(nullptr);
  auto tm = *std::localtime(&now);
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
  return oss.str();
}

void SetLogLevel(LogLevel level) {
  current_level = level;
}

void Log(LogLevel level, const std::string& file, int line, const std::string& msg) {
  if (level < current_level) return;

  const char* level_str = "";
  switch (level) {
    case LogLevel::INFO:  level_str = "INFO"; break;
    case LogLevel::WARN:  level_str = "WARN"; break;
    case LogLevel::ERROR: level_str = "ERROR"; break;
    case LogLevel::DEBUG: level_str = "DEBUG"; break;
  }

  std::cout << "[" << GetCurrentTime() << "]"
            << "[" << level_str << "]"
            << " " << file << ":" << line
            << " " << msg << std::endl;
}

}  // namespace drop

#define LOG_INFO(msg)  drop::Log(drop::LogLevel::INFO, __FILE__, __LINE__, msg)
#define LOG_WARN(msg)  drop::Log(drop::LogLevel::WARN, __FILE__, __LINE__, msg)
#define LOG_ERROR(msg) drop::Log(drop::LogLevel::ERROR, __FILE__, __LINE__, msg)
#define LOG_DEBUG(msg) drop::Log(drop::LogLevel::DEBUG, __FILE__, __LINE__, msg)
