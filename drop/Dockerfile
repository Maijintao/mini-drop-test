FROM ubuntu:22.04 AS builder

# 避免交互式安装
ENV DEBIAN_FRONTEND=noninteractive

# 安装编译依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    wget \
    pkg-config \
    libgrpc++-dev \
    libprotobuf-dev \
    protobuf-compiler-grpc \
    nlohmann-json3-dev \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# 复制源码
COPY . .

# 编译
RUN mkdir -p build && cd build \
    && cmake .. -DCMAKE_BUILD_TYPE=Release \
    && make -j$(nproc)

# 运行阶段：最小镜像
FROM ubuntu:22.04

# 安装运行时依赖（perf/bpftrace/curl/mc）
RUN apt-get update && apt-get install -y \
    libgrpc++1 \
    libprotobuf23 \
    libsqlite3-0 \
    linux-tools-common \
    linux-tools-generic \
    bpftrace \
    curl \
    wget \
    && wget -qO /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x /usr/local/bin/mc \
    && rm -rf /var/lib/apt/lists/*

# 创建配置目录
RUN mkdir -p /etc/drop

# 从构建阶段复制二进制
COPY --from=builder /build/build/drop_server /usr/local/bin/
COPY --from=builder /build/build/drop_agent /usr/local/bin/

# 复制示例配置
COPY etc/config.json.example /etc/drop/config.json

# 默认启动 drop_server
ENTRYPOINT ["drop_server"]
CMD ["--port", "50051"]
