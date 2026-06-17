package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"mini-drop/apiserver/config"
	"mini-drop/apiserver/middleware"
	"mini-drop/apiserver/model"
	"mini-drop/apiserver/pkg/storage/minio"
	"mini-drop/apiserver/proto/control"
	"mini-drop/apiserver/server"
)

func main() {
	cfgPath := flag.String("c", "config/apiserver.yaml", "config file path")
	flag.Parse()

	// 1. 加载配置
	if err := config.Load(*cfgPath); err != nil {
		log.Fatalf("load config: %v", err)
	}
	cfg := config.Cfg

	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 2. 初始化日志
	var logger *zap.Logger
	var err error
	if cfg.Log.Level == "debug" {
		logger, err = zap.NewDevelopment()
	} else {
		logger, err = zap.NewProduction()
	}
	if err != nil {
		log.Fatalf("init logger: %v", err)
	}
	defer logger.Sync()

	// 3. 连接数据库
	db, err := gorm.Open(postgres.Open(cfg.Database.DSN()), &gorm.Config{})
	if err != nil {
		logger.Fatal("connect database failed", zap.Error(err))
	}
	sqlDB, err := db.DB()
	if err != nil {
		logger.Fatal("get underlying sql.DB failed", zap.Error(err))
	}
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(3600e9)       // 1 hour
	sqlDB.SetConnMaxIdleTime(300e9) // 5 min

	// 4. 自动建表（表已存在时跳过）
	if err := model.AutoMigrate(db); err != nil {
		logger.Warn("auto migrate failed (tables may already exist)", zap.Error(err))
	} else {
		logger.Info("database migrated")
	}

	// 5. 初始化 MinIO 存储
	store, err := minio.New(
		cfg.MinIO.Endpoint,
		cfg.MinIO.AccessKey,
		cfg.MinIO.SecretKey,
		cfg.MinIO.Bucket,
		cfg.MinIO.UseSSL,
	)
	if err != nil {
		logger.Fatal("init minio failed", zap.Error(err))
	}
	logger.Info("minio connected", zap.String("bucket", cfg.MinIO.Bucket))

	// 6. 连接 drop_server gRPC
	grpcClient, err := control.NewControlClient(cfg.GRPC.Target)
	if err != nil {
		logger.Warn("grpc connect failed, task dispatch will be unavailable", zap.Error(err))
		// 不 fatal，允许 apiserver 独立启动（mock 模式）
	}
	if grpcClient != nil {
		defer grpcClient.Close()
		logger.Info("grpc connected", zap.String("target", cfg.GRPC.Target))
	}

	// 7. 创建 APIServer
	srv := server.New(db, grpcClient, store, cfg.Analysis, cfg.Auth.Secret)

	// 8. 启动定时任务调度器
	srv.Schedule.Start()
	defer srv.Schedule.Stop()

	// 9. 注册路由
	r := setupRouter(srv, logger, cfg)

	// 10. 优雅退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		logger.Info("shutting down...")
		srv.Schedule.Stop()
		if grpcClient != nil {
			grpcClient.Close()
		}

		// 等待后台 goroutine 完成（最多 10 秒）
		done := make(chan struct{})
		go func() {
			srv.WG.Wait()
			close(done)
		}()
		select {
		case <-done:
			logger.Info("all background goroutines finished")
		case <-time.After(10 * time.Second):
			logger.Warn("timeout waiting for background goroutines, forcing exit")
		}

		sqlDB.Close()
		logger.Info("shutdown complete")
		logger.Sync()
		os.Exit(0)
	}()

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	logger.Info("apiserver starting", zap.String("addr", addr))
	if err := r.Run(addr); err != nil {
		logger.Fatal("server run failed", zap.Error(err))
	}
}

func setupRouter(srv *server.APIServer, logger *zap.Logger, cfg config.Config) *gin.Engine {
	r := gin.Default()

	// CORS — 配置化 Origin 白名单
	corsCfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Drop_user_uid", "Drop_user_name", "Drop_user_token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}
	if len(cfg.CORS.AllowedOrigins) > 0 {
		corsCfg.AllowOrigins = cfg.CORS.AllowedOrigins
	} else {
		corsCfg.AllowOriginFunc = func(origin string) bool { return true }
	}
	r.Use(cors.New(corsCfg))

	// Access log
	r.Use(middleware.AccessLog(logger))

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API 路由
	api := r.Group("/api/v1")
	{
		// 不需要鉴权
		api.GET("/healthz", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})
		api.POST("/auth/login", srv.Login)

		// 需要鉴权
		auth := api.Group("")
		auth.Use(middleware.CheckLogin(cfg.Auth.Secret))
		{
			// Auth & User
			auth.GET("/auth/check", srv.AuthCheck)
			auth.GET("/users", srv.GetUsers)

			// Agent
			auth.GET("/agents", srv.GetAgents)
			auth.GET("/agent/stat", srv.StatAgent)

			// Task CRUD
			auth.POST("/tasks", srv.CreateTask)
			auth.GET("/tasks", srv.GetTasks)
			auth.GET("/tasks/:tid", srv.GetTaskDetail)
			auth.DELETE("/tasks/:tid", srv.DeleteTask)
			auth.POST("/tasks/:tid/retry", srv.RetryTask)
			auth.GET("/cosfiles", srv.GetCOSFiles)

			// Suggestion
			auth.GET("/tasks/:tid/suggestions", srv.GetSuggestions)
			auth.POST("/tasks/:tid/suggestions", srv.CreateSuggestion)
			auth.PUT("/tasks/:tid/analysis_status", srv.UpdateAnalysisStatus)

			// Analysis
			auth.POST("/tasks/:tid/analyze", srv.TriggerAnalysis)

			// Flame
			auth.GET("/tasks/:tid/flame", srv.GetFlameData)
			auth.POST("/flame/diff", srv.FlameDiff)

			// Group
			auth.POST("/group", srv.CreateGroup)
			auth.GET("/groups", srv.GetGroups)
			auth.DELETE("/group/:gid", srv.DeleteGroup)
			auth.POST("/group/:gid/members", srv.AddMember)
			auth.DELETE("/group/:gid/members/:uid", srv.RemoveMember)
			auth.GET("/group/:gid/members", srv.GetGroupMembers)

			// Schedule
			auth.POST("/schedule/task", srv.CreateScheduleTask)
			auth.GET("/schedule/tasks", srv.GetScheduleTasks)
			auth.DELETE("/schedule/task/:tid", srv.DeleteScheduleTask)
		}
	}

	return r
}
