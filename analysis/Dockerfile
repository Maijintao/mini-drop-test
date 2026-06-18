FROM python:3.10-bookworm

# 安装系统依赖：perl (flamegraph), linux-perf (CPU profiling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    perl \
    linux-perf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/analysis

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x flamegraph.pl stackcollapse-perf.pl 2>/dev/null || true

# 环境变量配置（Docker 部署时通过 -e 或 compose 注入）
# MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_SECURE
# APISERVER_URL
ENTRYPOINT ["python3", "hotmethod_analyzer.py"]
