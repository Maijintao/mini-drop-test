# ---- 构建阶段 ----
FROM golang:1.22-alpine AS builder

WORKDIR /app
ENV GOPROXY=https://goproxy.cn,direct

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o apiserver .

# ---- 运行阶段 ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/apiserver .
COPY config/apiserver.yaml.example config/apiserver.yaml

EXPOSE 8191

ENTRYPOINT ["./apiserver", "-c", "config/apiserver.yaml"]
