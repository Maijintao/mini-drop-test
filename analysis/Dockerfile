FROM python:3.10-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    perl \
    linux-perf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/analysis

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x flamegraph.pl stackcollapse-perf.pl 2>/dev/null || true

ENTRYPOINT ["python3", "hotmethod_analyzer.py"]
