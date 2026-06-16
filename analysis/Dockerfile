FROM python:3.10-bookworm

# 安装系统依赖：perl (flamegraph), linux-perf (CPU profiling), golang (java heap analyzer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    perl \
    linux-perf \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/analysis

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x flamegraph.pl stackcollapse-perf.pl 2>/dev/null || true

# 构建 Java heap analyzer
RUN cd java_heap_analyzer && go build -o /app/analysis/java_heap_analyzer/analyzer . 2>/dev/null || true

ENTRYPOINT ["python3", "hotmethod_analyzer.py"]
