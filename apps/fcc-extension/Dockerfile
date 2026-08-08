# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM --platform=linux/amd64 golang:1.25.12-trixie@sha256:2ddaec94e9a119c926e843982c01e15c1d4d22a05bd5db8248722d1c50b7cca9 AS builder

ARG SOURCE_DATE_EPOCH=0
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
WORKDIR /build

COPY --chmod=644 go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked go mod download && go mod verify

COPY --chmod=644 cmd/ ./cmd/
COPY --chmod=644 internal/ ./internal/
COPY --chmod=644 pkg/ ./pkg/

RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /out/payguard-fcc ./cmd/docker && \
    if [ "${SOURCE_DATE_EPOCH}" -gt 0 ] 2>/dev/null; then touch -d "@${SOURCE_DATE_EPOCH}" /out/payguard-fcc; fi

FROM --platform=linux/amd64 gcr.io/distroless/static-debian13:nonroot@sha256:23795be0fe67b7d47d1ee62b19c7db750152db627d5bbfa31307e892a7575bec

ARG SOURCE_COMMIT=unknown
ARG SOURCE_DATE_EPOCH=0
LABEL org.opencontainers.image.title="XRP PayGuard FCC extension" \
      org.opencontainers.image.source="https://github.com/minhleeee123/xrp-payguard" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.source-date-epoch="${SOURCE_DATE_EPOCH}"

COPY --chmod=755 --chown=0:0 --from=builder /out/payguard-fcc /payguard-fcc

# Production attestation is the safe image default. Local compose must opt into
# simulated mode explicitly; a production launch must never inherit that override.
ENV MODE=0 \
    SIMULATED_TEE=false \
    CONFIG_PORT=5501 \
    SIGN_PORT=7701 \
    EXTENSION_PORT=7702 \
    PRIVATE_INGRESS_PORT=7703

# tee-node's supported workload runs as root inside the Confidential Space
# boundary. Local compose removes capabilities and makes the filesystem read-only.
USER 0:0

LABEL "tee.launch_policy.allow_env_override"="LOG_LEVEL,PROXY_URL,INITIAL_OWNER,EXTENSION_ID,CHAIN_URL,CHAIN_ID,MODE,SIMULATED_TEE,CONFIG_PORT,SIGN_PORT,EXTENSION_PORT,PRIVATE_INGRESS_PORT,GOVERNANCE_SIGNERS,GOVERNANCE_THRESHOLD"

EXPOSE 5501 7701 7702 7703
ENTRYPOINT ["/payguard-fcc"]
