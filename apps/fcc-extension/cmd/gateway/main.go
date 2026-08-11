package main

import (
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/gateway"
)

func main() {
	handler, err := gateway.New("http://127.0.0.1:6664", "http://127.0.0.1:7703")
	if err != nil {
		panic(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 * 1024,
		ErrorLog:          log.New(io.Discard, "", 0),
	}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
