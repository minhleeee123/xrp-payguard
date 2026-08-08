package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	teeServer "github.com/flare-foundation/tee-node/pkg/server"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/ingress"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/pkg/server"
)

func main() {
	configPort := intEnv("CONFIG_PORT", 5501)
	signPort := intEnv("SIGN_PORT", 7701)
	extensionPort := intEnv("EXTENSION_PORT", 7702)
	ingressPort := intEnv("PRIVATE_INGRESS_PORT", 7703)
	go teeServer.StartServerExtension(configPort, signPort, extensionPort)
	machine, err := waitForMachine(signPort, 15*time.Second)
	if err != nil {
		panic(err)
	}
	errCh := server.StartExtension(extensionPort, signPort, machine)
	ingressServer, ingressErrCh := server.StartMachineIngress(ingressPort, machine)
	select {
	case err := <-errCh:
		panic(err)
	case err := <-ingressErrCh:
		panic(err)
	default:
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	select {
	case <-signals:
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = ingressServer.Shutdown(ctx)
		cancel()
	case err := <-errCh:
		if err != nil && err.Error() != "http: Server closed" {
			panic(err)
		}
	case err := <-ingressErrCh:
		if err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}
}

func intEnv(key string, fallback int) int {
	if value, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return value
	}
	return fallback
}

func waitForMachine(signPort int, timeout time.Duration) (*ingress.Machine, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		machine, _, err := ingress.NewTeeMachine(signPort)
		if err == nil {
			return machine, nil
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	return nil, fmt.Errorf("TEE identity/decrypt service unavailable: %w", lastErr)
}
