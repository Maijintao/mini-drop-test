#!/bin/bash
# 生成 protobuf Go 代码
# 前置: brew install protobuf protoc-gen-go protoc-gen-go-grpc

set -e

cd "$(dirname "$0")"

protoc \
  --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  common.proto healthcheck.proto hotmethod.proto control.proto init.proto

echo "proto generation done"
