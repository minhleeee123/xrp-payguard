# Local Web2Json trigger boundary

## Status and scope

`packages/integrations/src/web2-json-trigger.ts` is a locally verified,
fail-closed boundary over the official FDC `IWeb2Json` request and response
shape. It is not a live Coston2 integration and it does not decide policy
authorization. No production source is configured in this repository.

The unit fixture uses the reserved `.invalid` top-level domain. A positive unit
test therefore demonstrates deterministic validation only; it cannot be
mistaken for a Flare-supported URL, retrieved proof, truthful business fact, or
on-chain PayGuard result.

## Frozen source descriptor

Every accepted source is represented by one domain-separated commitment over:

- the official `PublicWeb2` source ID;
- an exact HTTPS URL with no user info, query string, or fragment;
- the exact HTTP method;
- canonical, bounded public JSON for headers, query parameters, and body;
- a deterministic, bounded jq transform;
- a canonical, bounded tuple ABI signature containing `observedAt:uint64` and
  its separate schema commitment; and
- `ATTESTED_RESPONSE_ONLY_SOURCE_TRUTH_NOT_GUARANTEED`.

The consumer supplies an allowlist of those commitments. An empty, malformed,
duplicated, oversized, or non-matching allowlist fails closed. The library has
no default source and does not infer network support from a URL. A future live
consumer must keep this allowlist in canonical governed state. Mainnet also
requires network-governed URL allowlisting; current testnets accept endpoints
through `PublicWeb2`, but that does not remove PayGuard's application allowlist.

All request fields are public FDC input. The adapter rejects credential-bearing
URLs, authorization/cookie/key/token/password/secret-shaped JSON keys, header
line breaks, non-canonical object ordering, floats, excessive nesting/size, and
external/nondeterministic jq facilities. Callers must never place API keys or
private policy data in this descriptor.

## Accepted-proof binding

Acceptance requires all of the following:

1. exact `Web2Json` type and `PublicWeb2` source in both request and response;
2. finalized status, non-zero MIC, positive voting round, and the Web2Json
   `uint64.max` `lowestUsedTimestamp` sentinel;
3. byte-identical request body in the submitted request, returned response, and
   allowlisted source policy;
4. exact ABI-encoded response-data hash plus a decoded, source-asserted
   `observedAt:uint64` inside a PayGuard-specific freshness window;
5. an injected verifier returning a non-zero canonical proof commitment; and
6. unused assertion and proof commitments before and after the asynchronous
   verifier call, with the whole input commitment recomputed to catch mutation.

The in-memory replay sets are preflight protection, not canonical settlement.
A future on-chain consumer must atomically consume its governed source,
assertion, and proof domains in the same transaction as request creation or
state advancement. It must not expose an `ALLOW` parameter or let a relay,
client, source, or administrator directly choose the policy decision.

## Semantic trust boundary

FDC establishes that providers reached consensus over the specified request
and transformed response. It does not establish that the publisher's business
assertion—including its `observedAt` value—is honest, complete, timely in the
business sense, or legally authoritative. PayGuard therefore commits the
semantic limitation in the source descriptor and keeps source correctness in
the residual-trust section of the threat model.

Before any production use, the project still needs:

- a product-approved public source and exact business predicate;
- confirmation that the endpoint satisfies the target network's current source
  rules, including mainnet URL governance when applicable;
- a governed PayGuard source-commitment entry and change/removal process;
- live request, finality, DA retrieval, and `verifyWeb2Json` evidence;
- a canonical on-chain replay consumer and private policy descriptor/snapshot;
- outage, stale-data, transform/schema drift, and source-compromise drills; and
- public-safe evidence that contains no request credential or private policy.

## Official references

- [FDC Web2Json reference](https://dev.flare.network/fdc/reference/IWeb2Json)
- [Web2Json attestation rules](https://dev.flare.network/fdc/attestation-types/web2-json)
- [Web2Json Hardhat guide](https://dev.flare.network/fdc/guides/hardhat/web2-json)
- [FDC overview](https://dev.flare.network/fdc/overview)
- [FDC troubleshooting](https://dev.flare.network/fdc/troubleshooting)
