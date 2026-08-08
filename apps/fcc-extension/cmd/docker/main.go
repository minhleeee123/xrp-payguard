package main

import (
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	teeServer "github.com/flare-foundation/tee-node/pkg/server"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/pkg/server"
)

func main() {
	configPort := intEnv("CONFIG_PORT", 5501)
	signPort := intEnv("SIGN_PORT", 7701)
	extensionPort := intEnv("EXTENSION_PORT", 7702)
	go teeServer.StartServerExtension(configPort, signPort, extensionPort)
	errCh := server.StartExtension(extensionPort, signPort, nil)
	time.Sleep(100 * time.Millisecond)
	select { case err := <-errCh: panic(err); default: }
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	select { case <-signals: case err := <-errCh: if err != nil && err.Error() != "http: Server closed" { panic(err) } }
}

func intEnv(key string, fallback int) int { if value, err := strconv.Atoi(os.Getenv(key)); err == nil { return value }; return fallback }
