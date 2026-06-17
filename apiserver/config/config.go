package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	GRPC     GRPCConfig     `mapstructure:"grpc"`
	MinIO    MinIOConfig    `mapstructure:"minio"`
	Log      LogConfig      `mapstructure:"log"`
	Analysis AnalysisConfig `mapstructure:"analysis"`
	Auth     AuthConfig     `mapstructure:"auth"`
	CORS     CORSConfig     `mapstructure:"cors"`
}

type ServerConfig struct {
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"` // debug / release
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
		d.Host, d.User, d.Password, d.DBName, d.Port, d.SSLMode,
	)
}

type GRPCConfig struct {
	Target string `mapstructure:"target"` // drop_server 地址, e.g. "localhost:50051"
}

type MinIOConfig struct {
	Endpoint  string `mapstructure:"endpoint"`
	AccessKey string `mapstructure:"access_key"`
	SecretKey string `mapstructure:"secret_key"`
	Bucket    string `mapstructure:"bucket"`
	UseSSL    bool   `mapstructure:"use_ssl"`
	Region    string `mapstructure:"region"`
}

type LogConfig struct {
	Level string `mapstructure:"level"` // debug / info / warn / error
	Path  string `mapstructure:"path"`
}

type AnalysisConfig struct {
	Command    string `mapstructure:"command"`     // analyzer 可执行路径, e.g. "python3"
	ScriptPath string `mapstructure:"script_path"` // hotmethod_analyzer.py 路径
	ConfigPath string `mapstructure:"config_path"` // analyzer 配置文件路径
}

type AuthConfig struct {
	Secret string `mapstructure:"secret"` // HMAC 签名密钥，空则跳过验证（开发模式）
}

type CORSConfig struct {
	AllowedOrigins []string `mapstructure:"allowed_origins"` // 允许的 Origin 列表，空则允许所有
}

var Cfg Config

func Load(path string) error {
	viper.SetConfigFile(path)
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return fmt.Errorf("read config: %w", err)
	}
	if err := viper.Unmarshal(&Cfg); err != nil {
		return fmt.Errorf("unmarshal config: %w", err)
	}
	return nil
}
