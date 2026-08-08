package fcc

import "time"

const (
	Version           = "0.1.0-payguard"
	OPTypePayGuard    = "PAYGUARD"
	OPCommandPing     = "PING_V1"
	OPCommandEvaluate = "EVALUATE_V1"
	ShutdownTimeout   = 5 * time.Second
)
