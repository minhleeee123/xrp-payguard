# syntax=docker/dockerfile:1.7

FROM --platform=linux/amd64 golang:1.25.12-alpine3.23@sha256:f128118f1f3a7f38949c57f03d29d13e4afdb06b86f840f8f43e8031e6c1a73a AS builder

ARG TEE_PROXY_REF=2e8412990d150a386a2ee5fdc1d2889a04e658aa
ARG SOURCE_COMMIT=unknown
ARG SOURCE_DATE_EPOCH=0

RUN apk add --no-cache git

WORKDIR /build/payguard
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY pkg/ ./pkg/
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /out/payguard-fcc ./cmd/docker

WORKDIR /build/tee-proxy
RUN git init && \
    git remote add origin https://github.com/flare-foundation/tee-proxy.git && \
    git fetch --depth 1 origin "${TEE_PROXY_REF}" && \
    test "$(git rev-parse FETCH_HEAD)" = "${TEE_PROXY_REF}" && \
    git checkout --detach FETCH_HEAD
RUN go mod download && go mod verify && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /out/tee-proxy ./cmd/proxy

FROM --platform=linux/amd64 alpine:3.21@sha256:f27cad9117495d32d067133afff942cb2dc745dfe9163e949f6bfe8a6a245339

ARG SOURCE_COMMIT=unknown
ARG SOURCE_DATE_EPOCH=0
LABEL org.opencontainers.image.title="XRP PayGuard simulated Coston2 FCC machine" \
      org.opencontainers.image.source="https://github.com/minhleeee123/xrp-payguard" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.source-date-epoch="${SOURCE_DATE_EPOCH}" \
      org.opencontainers.image.description="Hackathon-only simulated TEE; not hardware-attested"

RUN apk add --no-cache ca-certificates redis tini

WORKDIR /app
COPY --chmod=755 --from=builder /out/payguard-fcc /app/payguard-fcc
COPY --chmod=755 --from=builder /out/tee-proxy /app/tee-proxy
COPY --chmod=755 railway/render-proxy-config.sh /app/render-proxy-config.sh
COPY --chmod=755 railway/start.sh /app/start.sh

ENV MODE=1 \
    SIMULATED_TEE=true \
    CHAIN_ID=114 \
    CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc \
    CONFIG_PORT=5501 \
    SIGN_PORT=7701 \
    EXTENSION_PORT=7702 \
    PRIVATE_INGRESS_PORT=7703 \
    PORT=6664 \
    PROXY_URL=http://127.0.0.1:6663 \
    PAYGUARD_POLICY_STORE_DIR=/var/lib/payguard/policies \
    LOG_LEVEL=ERROR

EXPOSE 6664 7703
ENTRYPOINT ["/sbin/tini", "--", "/app/start.sh"]
