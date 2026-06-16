cmake_minimum_required(VERSION 3.16)
project(mini-drop VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find dependencies
set(protobuf_MODULE_COMPATIBLE ON)
find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(Threads REQUIRED)

# Proto files
set(PROTO_FILES
  common/proto/common.proto
  common/proto/healthcheck.proto
  common/proto/hotmethod.proto
  common/proto/control.proto
  common/proto/init.proto
)

# Generate protobuf code
protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS ${PROTO_FILES})

# Generate gRPC code
set(GRPC_SRCS "")
set(GRPC_HDRS "")
set(PROTO_IMPORT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/common/proto")
foreach(PROTO_FILE ${PROTO_FILES})
  get_filename_component(PROTO_NAME ${PROTO_FILE} NAME_WE)
  get_filename_component(PROTO_ABS "${PROTO_FILE}" ABSOLUTE)
  set(GRPC_SRC "${CMAKE_CURRENT_BINARY_DIR}/${PROTO_NAME}.grpc.pb.cc")
  set(GRPC_HDR "${CMAKE_CURRENT_BINARY_DIR}/${PROTO_NAME}.grpc.pb.h")
  list(APPEND GRPC_SRCS ${GRPC_SRC})
  list(APPEND GRPC_HDRS ${GRPC_HDR})
  add_custom_command(
    OUTPUT ${GRPC_SRC} ${GRPC_HDR}
    COMMAND protobuf::protoc
    --grpc_out=${CMAKE_CURRENT_BINARY_DIR}
    --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
    -I ${PROTO_IMPORT_DIR}
    ${PROTO_ABS}
    DEPENDS ${PROTO_ABS} gRPC::grpc_cpp_plugin
    COMMENT "Generating gRPC code for ${PROTO_NAME}"
  )
endforeach()

# Common library (proto generated code)
add_library(drop_proto STATIC
  ${PROTO_SRCS}
  ${GRPC_SRCS}
)
target_include_directories(drop_proto PUBLIC
  ${CMAKE_CURRENT_BINARY_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/common
)
target_link_libraries(drop_proto PUBLIC
  protobuf::libprotobuf
  gRPC::grpc++
)

# Agent binary
add_executable(drop_agent
  agent/main.cpp
  agent/HealthCheckChannel.cpp
  agent/HotmethodChannel.cpp
  agent/Config.cpp
  agent/ContainerInfo.cpp
  common/Perf.cpp
  common/Process.cpp
  common/ProcessKiller.cpp
  common/StorageClient.cpp
  common/BpftraceProfiler.cpp
  common/AsyncProfiler.cpp
  common/PprofProfiler.cpp
  common/Daemon.cpp
  common/Log.cpp
  common/ScriptRunner.cpp
)
target_link_libraries(drop_agent PRIVATE drop_proto Threads::Threads)

# Server binary
find_package(SQLite3 REQUIRED)
add_executable(drop_server
  server/main.cpp
  server/HealthCheckService.cpp
  server/HotmethodService.cpp
  server/ControlService.cpp
  server/InitAgentInfoService.cpp
  common/Log.cpp
)
target_link_libraries(drop_server PRIVATE drop_proto Threads::Threads SQLite::SQLite3)
