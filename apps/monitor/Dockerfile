# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM --platform=linux/amd64 node:24.19.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848

ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.title="XRP PayGuard production monitor" \
      org.opencontainers.image.source="https://github.com/minhleeee123/xrp-payguard" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}"

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --chown=node:node src/ src/
USER node:node
EXPOSE 8080
CMD ["node", "src/entry.mjs"]
