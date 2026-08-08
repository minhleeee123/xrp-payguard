package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/fcc"
)

func main() {
	extension := fcc.New(8080, 9090, nil)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signals
		ctx, cancel := context.WithTimeout(context.Background(), fcc.ShutdownTimeout)
		defer cancel()
		_ = extension.Server.Shutdown(ctx)
	}()
	if err := extension.Server.ListenAndServe(); err != nil && err != http.ErrServerClosed { panic(err) }
}
