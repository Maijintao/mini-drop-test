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
    && cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
    && make -j$(nproc)

# 运行阶段：最小镜像
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# 安装运行时依赖（perf/bpftrace/curl/mc/memray/jmap）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgrpc++1 \
    libprotobuf23 \
    libsqlite3-0 \
    linux-tools-common \
    linux-tools-generic \
    bpftrace \
    gdb \
    curl \
    wget \
    python3 \
    python3-pip \
    openjdk-17-jdk-headless \
    ca-certificates \
    tzdata \
    && pip3 install --no-cache-dir memray \
    && wget -qO /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x /usr/local/bin/mc \
    && rm -rf /var/lib/apt/lists/*

# 创建配置目录
RUN mkdir -p /etc/drop

# Ubuntu's /usr/bin/perf is a wrapper that expects a host-kernel-matched
# linux-tools package. Validation VMs may run non-Ubuntu kernels, so prefer the
# generic perf binary bundled in this image.
RUN set -eux; \
    perf_bin="$(find /usr/lib/linux-tools /usr/lib/linux-tools-* -name perf 2>/dev/null | sort | tail -n 1 || true)"; \
    if [ -n "$perf_bin" ]; then ln -sf "$perf_bin" /usr/local/bin/perf; fi

# 从构建阶段复制二进制
COPY --from=builder /build/build/drop_server /usr/local/bin/
COPY --from=builder /build/build/drop_agent /usr/local/bin/

# 复制示例配置
COPY etc/config.json.example /etc/drop/config.json

# 默认启动 drop_server
ENTRYPOINT ["drop_server"]
CMD ["--port", "50051"]
