FROM golang:1.25-bookworm AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/apiserver ./main.go

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata python3 py3-pip perl curl \
    && pip3 install --no-cache-dir --break-system-packages \
      minio psycopg2-binary pyyaml configparser

WORKDIR /app
COPY --from=builder /out/apiserver ./apiserver
COPY config/apiserver.yaml.example config/apiserver.yaml

EXPOSE 8191

ENTRYPOINT ["./apiserver"]
CMD ["-c", "config/apiserver.yaml"]
