# FCC container build and local three-machine gate

Status: reproducible `linux/amd64` image and local simulated three-machine smoke
pass. This is not a registered FCC deployment, stable HTTPS origin, sealed
recovery proof, Coston2 action result, or release image claim.

For the hackathon delivery, this local stack is the selected FCC demonstration
mode. It demonstrates deterministic three-machine identities, ciphertext-only
adapter behavior, restart identity rotation, and fail-closed ingress without
incurring hosted TEE cost. It does not provide hardware confidentiality or
upgrade any live product claim. Hosted FCC infrastructure is deferred until
after the hackathon.

## Image contract

`apps/fcc-extension/Dockerfile` builds only the PayGuard Go module and copies one
static binary into a distroless final image. The build pins:

- Dockerfile frontend `docker/dockerfile:1.7` at
  `sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`;
- `golang:1.25.12-trixie` `linux/amd64` at
  `sha256:2ddaec94e9a119c926e843982c01e15c1d4d22a05bd5db8248722d1c50b7cca9`;
- `gcr.io/distroless/static-debian13:nonroot` `linux/amd64` at
  `sha256:23795be0fe67b7d47d1ee62b19c7db750152db627d5bbfa31307e892a7575bec`.

The module lock is verified before compilation. `CGO_ENABLED=0`, `-trimpath`,
an empty build ID, disabled VCS embedding, fixed `SOURCE_DATE_EPOCH`, and a
root-level final binary avoid host paths and variable directory timestamps.
`pnpm fcc:image:repro` performs two independent `--no-cache` builds and rejects
different image IDs. It removes its temporary image tags afterward.

The image defaults to `MODE=0` and `SIMULATED_TEE=false`. The simulated local
compose must opt into both values. The final image contains no shell, source,
test, `.env`, application private key, proxy credential, or persisted identity.
It runs as root only because the supported tee-node workload uses that model;
the local compose drops every Linux capability, enables
`no-new-privileges`, and mounts the root filesystem read-only.

## Local three-machine smoke

`apps/fcc-extension/compose.local.yaml` is test-only. It starts the same image
three times with independent ephemeral tee-node identities and publishes only
each authenticated private-ingress port on `127.0.0.1`. Sign, decrypt, config,
and extension ports are not published. No secret-bearing env file is loaded.

Run:

```bash
pnpm fcc:container:smoke
```

The smoke waits for startup sign and encrypted decrypt-readiness round trips,
then verifies:

- three distinct signer, machine ID, and key-fingerprint triples;
- signer suffix binding for both public machine identifiers;
- read-only root, dropped capabilities, `no-new-privileges`, and loopback-only
  ingress publication;
- malformed private ingress fails without returning authorization material or
  an `ALLOW` value;
- restarting one simulated machine rotates its identity, proving that restart
  cannot silently restore the old in-memory identity.

The script uses a unique compose project, dynamically allocated loopback ports,
and removes its containers, network, volumes, and temporary image tag. The
compose network has ordinary bridge egress solely for local testing and carries
no credentials. It is not the production network policy.

## Post-hackathon live gate

A live image must be rebuilt from the exact committed source, published by
digest, and placed behind three new stable authenticated HTTPS proxy origins.
Each fresh machine must be registered through the supported Coston2 flow and
checked against its public proxy identity and on-chain record. `MODE=1` must be
reported as simulated TEE. Neither this local smoke nor an image hash may be
promoted to PayGuard custody/evaluation evidence.
