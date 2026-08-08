package server

import (
	"fmt"
	"net/http"
	"time"

	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/fcc"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/ingress"
)

func StartExtension(extensionPort, signPort int, machine *ingress.Machine) <-chan error {
	extension := fcc.New(extensionPort, signPort, machine)
	errCh := make(chan error, 1)
	go func() { errCh <- extension.Server.ListenAndServe() }()
	return errCh
}

func StartMachineIngress(port int, machine *ingress.Machine) (*http.Server, <-chan error) {
	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", port),
		Handler:           ingress.NewMachineHTTPServer(machine).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	errCh := make(chan error, 1)
	go func() { errCh <- httpServer.ListenAndServe() }()
	return httpServer, errCh
}
