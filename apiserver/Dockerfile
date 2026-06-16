FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata python3 py3-pip perl curl

# 安装 analysis 的 Python 依赖
RUN pip3 install --no-cache-dir --break-system-packages \
    minio psycopg2-binary pyyaml

WORKDIR /app
COPY apiserver .
COPY config/apiserver.yaml.example config/apiserver.yaml

EXPOSE 8191

ENTRYPOINT ["./apiserver", "-c", "config/apiserver.yaml"]
