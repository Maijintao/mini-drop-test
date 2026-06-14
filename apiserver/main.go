package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"mini-drop/apiserver/config"
)

func main() {
	cfgPath := flag.String("c", "config/apiserver.yaml", "config file path")
	flag.Parse()

	if err := config.Load(*cfgPath); err != nil {
		log.Fatalf("load config: %v", err)
	}

	if config.Cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	addr := fmt.Sprintf(":%d", config.Cfg.Server.Port)
	log.Printf("apiserver starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server run: %v", err)
	}
}
