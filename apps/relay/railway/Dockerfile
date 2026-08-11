# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM --platform=linux/amd64 node:24.19.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848

ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.title="XRP PayGuard live FCC relay" \
      org.opencontainers.image.source="https://github.com/minhleeee123/xrp-payguard" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}"

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

RUN npm install --global pnpm@10.33.0 && npm cache clean --force

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/relay/package.json apps/relay/package.json
COPY --chown=node:node packages/protocol/package.json packages/protocol/package.json
COPY --chown=node:node packages/bindings/package.json packages/bindings/package.json

RUN pnpm install --frozen-lockfile --prod --filter @xrp-payguard/relay...

COPY --chown=node:node apps/relay/src/ apps/relay/src/
COPY --chown=node:node packages/protocol/src/ packages/protocol/src/
COPY --chown=node:node packages/bindings/src/ packages/bindings/src/

USER node:node
EXPOSE 8080
CMD ["pnpm", "--filter", "@xrp-payguard/relay", "live:start"]
