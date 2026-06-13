cmake_minimum_required(VERSION 3.16)
project(mini-drop VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find dependencies
find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)

# Proto files
set(PROTO_FILES
  common/proto/common.proto
  common/proto/healthcheck.proto
  common/proto/hotmethod.proto
  common/proto/control.proto
  common/proto/init.proto
)

# Generate protobuf/gRPC code
protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS ${PROTO_FILES})
grpc_generate_cpp(GRPC_SRCS GRPC_HDRS ${PROTO_FILES})

# Common library (proto generated code)
add_library(drop_proto STATIC
  ${PROTO_SRCS}
  ${GRPC_SRCS}
)
target_include_directories(drop_proto PUBLIC
  ${CMAKE_CURRENT_BINARY_DIR}
)
target_link_libraries(drop_proto PUBLIC
  protobuf::libprotobuf
  gRPC::grpc++
)

# Agent binary (placeholder)
add_executable(drop_agent
  agent/main.cpp
)
target_link_libraries(drop_agent PRIVATE drop_proto)

# Server binary (placeholder)
add_executable(drop_server
  server/main.cpp
)
target_link_libraries(drop_server PRIVATE drop_proto)
