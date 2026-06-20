package storage

import (
	"context"
	"io"
	"time"
)

type presignEndpointContextKey struct{}

type PresignEndpoint struct {
	Endpoint string
	UseSSL   bool
}

func WithPresignEndpoint(ctx context.Context, endpoint string, useSSL bool) context.Context {
	if endpoint == "" {
		return ctx
	}
	return context.WithValue(ctx, presignEndpointContextKey{}, PresignEndpoint{
		Endpoint: endpoint,
		UseSSL:   useSSL,
	})
}

func PresignEndpointFromContext(ctx context.Context) (endpoint string, useSSL bool, ok bool) {
	v, ok := ctx.Value(presignEndpointContextKey{}).(PresignEndpoint)
	if !ok || v.Endpoint == "" {
		return "", false, false
	}
	return v.Endpoint, v.UseSSL, true
}

// Storage 对象存储抽象接口
type Storage interface {
	// Get 获取文件内容
	Get(ctx context.Context, key string) (io.ReadCloser, error)

	// Put 上传文件
	Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error

	// PreSign 生成临时下载签名URL
	PreSign(ctx context.Context, key string, expiry time.Duration) (string, error)

	// Delete 删除文件
	Delete(ctx context.Context, key string) error

	// IsExist 检查文件是否存在
	IsExist(ctx context.Context, key string) (bool, error)

	// List 列出 prefix 下的对象 key
	List(ctx context.Context, prefix string) ([]string, error)
}
