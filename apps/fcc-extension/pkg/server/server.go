package server

import (
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/fcc"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/ingress"
)

func StartExtension(extensionPort, signPort int, machine *ingress.Machine) <-chan error {
	extension := fcc.New(extensionPort, signPort, machine)
	errCh := make(chan error, 1)
	go func() { errCh <- extension.Server.ListenAndServe() }()
	return errCh
}
