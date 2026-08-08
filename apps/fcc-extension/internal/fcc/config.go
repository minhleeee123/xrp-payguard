package fcc

import "time"

const (
	Version                 = "0.1.0-payguard"
	Coston2ChainID          = 114
	FoundationSchemaVersion = 1
	FoundationDomain        = "PAYGUARD_FCC_FOUNDATION_V1"
	OPTypePayGuard          = "PAYGUARD"
	OPCommandPing           = "PING_V1"
	OPCommandEvaluate       = "EVALUATE_V1"
	ShutdownTimeout         = 5 * time.Second
)
