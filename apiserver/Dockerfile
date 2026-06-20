FROM --platform=$BUILDPLATFORM golang:1.26.2-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

RUN apk add --no-cache build-base

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -o /out/apiserver ./main.go

FROM golang:1.26.2-alpine

RUN apk add --no-cache ca-certificates tzdata python3 py3-pip perl curl perf graphviz \
    && pip3 install --no-cache-dir --break-system-packages \
      minio psycopg2-binary pyyaml configparser \
    || (apk add --no-cache ca-certificates tzdata python3 py3-pip perl curl linux-tools graphviz \
        && pip3 install --no-cache-dir --break-system-packages minio psycopg2-binary pyyaml configparser)

ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app
COPY --from=builder /out/apiserver ./apiserver
COPY config/apiserver.yaml.example config/apiserver.yaml

EXPOSE 8191

ENTRYPOINT ["./apiserver"]
CMD ["-c", "config/apiserver.yaml"]
