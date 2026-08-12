# Hackathon demo video

Status: local captioned capture recorded; owner review and public upload remain
open.

## Recorded artifact

The repository-pinned recorder produced the ignored local file
`evidence/local/xrp-payguard-v2-candidate-demo-2026-08-11.mp4` from the
production alias on 2026-08-12.

| Property | Recorded value |
|---|---|
| Duration | 74.000 seconds |
| Frames | 592 at 8 fps |
| Video | H.264, 1440×900, `yuvj420p` |
| Audio | silent AAC stereo track |
| Size | 2,692,788 bytes |
| SHA-256 | `5f3c36f65b16d702362751787db78f904d047bfc1f1e7466b93c37856dbbad4a` |
| Production manifest | 25 records; 24 chain-114; 3 simulation records |

The MP4 is intentionally Git-ignored. It is a review/upload deliverable, not
public release evidence and not proof that a hackathon submission occurred.

## Safety boundary

The recorder is fixed to `https://xrp-payguard.vercel.app` and writes only
under ignored `evidence/local/`. Before capture it requires the reviewed
testnet-only/static-shell evidence index and all public-safety booleans. It
never reads environment variables, wallet material, source evidence outside the
public endpoint, or VeilBid.

The sequence shows only:

1. the landing-page privacy boundary, guardians, architecture, use cases, and
   public-safe evidence section;
2. the wallet-free Auditor with its overlapping
   25-total/24-chain/3-simulation counts;
3. the primary hosted V2 candidate proof: three registered status-2 simulated
   machines, all-three custody, ALLOW execution, `CAP_EXCEEDED` denial,
   stop/resume/revoke, conservation, and thirteen public checkpoints;
4. the explicit boundary that hardware attestation and verified-release
   promotion remain open. The historical V1 sandbox stays closed by default.

Policy Studio is deliberately excluded because a public recording must not
capture policy plaintext, even when example data is available. Chrome failures
remain fatal except the exact `/favicon.ico` 404 produced by Chrome's raw-JSON
viewer; the application favicon `/favicon.svg` is independently required to
return HTTP 200 by the deployment smoke.

## Reproduce

```sh
export PATH="$PWD/.local/toolchains/bin:$PATH"
pnpm demo:record:test
pnpm demo:record
```

The recorder refuses to replace an existing reviewed file. Use the direct
`record --overwrite` capability only after preserving or consciously replacing
the prior local artifact. Capture happens into an ignored same-filesystem
staging directory; the final MP4 appears only after Chrome, ffmpeg, ffprobe,
duration, codec, resolution, audio, evidence-boundary, storage, overflow, and
browser-failure checks pass.

## Owner-only finish

Review the entire MP4, upload it to the owner's chosen public video host, and
then place the public URL in `docs/submission-draft.md`. Account login,
MFA/CAPTCHA, channel ownership, and final submission are not inferred from the
local capture.
