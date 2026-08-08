# Threat model

## 1. Protected assets

- Private policy rules and relationships.
- Integrity of `ALLOW`/`DENY` evaluation.
- Vault funds and exact public conservation.
- Owner/request/machine/code/domain binding.
- Replay, schedule, occurrence, and spend-window state.
- Wallet, XRPL, FCC, proxy/indexer, and deployment credentials.
- Accuracy and honesty of public release evidence.

## 2. Adversaries

- Malicious policy owner attempting to bypass policy after activation.
- Malicious requester, payee, delegated spender, or executor.
- Compromised browser or injected wallet provider.
- Compromised ingress, proxy, relay, indexer, RPC, DA, or hosted UI.
- One or more faulty/compromised FCC machines.
- Stale/replayed FDC proof or FTSO input.
- Contract reentrancy, malicious token, callback, or target adapter.
- Deployment/governance operator using wrong code, machine, address, or network.
- Public observer correlating transfers and timing.

## 3. Security properties

### Confidentiality

Policy content is visible to the intended FCC runtime/machine operators inside
the documented TEE boundary. It is not visible in public chain state, browser
persistence, logs, evidence, or finalizer clients. This is not zero knowledge
and does not protect against all TEE/hardware/cloud compromise.

### Authorization integrity

Only two distinct policy-fixed registered machines signing the same exact result
can authorize execution. Owner/admin/client/relay cannot provide a decision.

### State integrity

Public chain checkpoint/root/nonce/occurrence state is canonical. TEE sealed
state cannot roll back to authorize against an earlier spend window.

### Fund safety

Every deposit has exactly one accounting destination. Adapter and token failure
reverts atomically. Recovery never creates an approval.

### Availability

One result-machine outage is tolerated after common policy custody. Two-machine
loss, dependency failure, stale data, split decision, or missing proof fails
closed. Owner recovery is time-bounded and cannot race execution.

## 4. Attack table

| Attack | Required mitigation |
|---|---|
| Client submits `ALLOW` | ABI has no client decision input; threshold digest verification |
| Policy ciphertext published | Contracts reject ciphertext-shaped fields; scans and ingress separation |
| Relay substitutes binding/ciphertext/machine | Owner signature binds the full binding digest, ciphertext hash, exact machine/key, nonce, and short time window |
| Receipt for another policy/owner | Full receipt domain, nonce, expiry, registered machine/key check |
| Mixed policy copies across TEEs | All-three matching custody receipts and commitment |
| Two machines sign different requests | Exact digest comparison; no threshold across split results |
| Sealed-store rollback | Bind canonical chain spend/root/nonce and reject stale checkpoint |
| Request replay | Per-policy nonce, request ID, occurrence, attempt, expiry, terminal-state guards |
| Permissionless request locks owner funds | Pending/deny paths never reserve; reserve only after an exact threshold `ALLOW` |
| Empty delegate list authorizes public callers | Empty means owner-only; every non-owner must be explicitly listed and still passes all other rules |
| Double scheduled payment | Unique schedule slot/occurrence plus atomic checkpoint advance |
| FTSO manipulation/staleness | Official feed, freshness/bounds, deterministic rounding, fail closed |
| FDC proof substitution | Verify type/source/response fields/MIC/domain/freshness and used transaction ID |
| XRPL operation substitution | Bind owner, PersonalAccount, memo/user-op hash, nonce, fees, target, events |
| Ingress/proxy logs private payload | Structured redaction, bodyless logs, output scans, access controls |
| Malicious target/reentrancy | Adapter allowlist, CEI/reentrancy guard, atomic accounting, bounded gas |
| Emergency withdrawal races action | Stop/reservation/grace state machine and atomic terminal transition |
| Identity restart assumed stable | Replacement registration; frozen old policy fails closed/recovery |
| Caller substitutes FCC foundation domain | Sender constructs chain/sender/extension/code fields; canonical Go decoder and binding hash reject drift |
| Sender binds a foreign/reserved extension ID | One-time owner call plus authoritative registry mapping and public-ID bounds |
| Hosted UI lies | Wallet-free independent reader/CLI and verified release manifest |

## 5. Residual trust

Users still trust:

- the selected TEE hardware/cloud/runtime and threshold machine operators;
- official Flare protocols and their provider/governance/security assumptions;
- the semantic correctness of any allowlisted Web2 source;
- wallet software and user device at signing time;
- verified PayGuard contract/extension code and deployment governance;
- public chain liveness and supported testnet infrastructure.

Threshold machines reduce unilateral decision risk but do not make the system
trustless or immune to common-mode compromise.

## 6. Explicit non-claims

- No hidden token transfer, amount, recipient, timing, or graph.
- No anonymity, mixer, legal compliance, fraud prevention, or chargeback guarantee.
- No production custody, formal audit, perfect availability, or mainnet safety
  until separately completed and evidenced.
- No guarantee that an external Web2 source reports a truthful business fact.
- No guarantee that a payee delivered an off-chain service merely because a
  transaction or API response was attested.
