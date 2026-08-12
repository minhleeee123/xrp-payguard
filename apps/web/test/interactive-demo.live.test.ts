import { describe, expect, it } from "vitest";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  collectDemoCustody,
  collectDemoEvaluations,
  createDemoRequest,
  executeDemoRequest,
  executeDemoVaultAction,
  fetchInteractiveDemoConfig,
  governDemoPolicy,
  loadDemoAccount,
  loadDemoRequestStatus,
  registerDemoPolicy,
  submitDemoThreshold,
} from "../src/interactive-demo.js";
import { COSTON2_CHAIN, type Eip1193Provider } from "../src/coston2.js";
import { compileStudioDraft, createStudioEntropy, studioTemplateDraft } from "../src/model.js";

const enabled = process.env.PAYGUARD_INTERACTIVE_LIVE_SMOKE === "1";
const origin = process.env.PAYGUARD_INTERACTIVE_DEMO_ORIGIN ?? "https://xrp-payguard.vercel.app";

describe.skipIf(!enabled)("deployed interactive demo lifecycle", () => {
  it("executes an actor-authorized allow, cap denial, and owner governance", async () => {
    let stage = "bootstrap";
    try {
    const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY as Hex | undefined;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("live smoke test wallet is unavailable");
    const account = privateKeyToAccount(key);
    const provider = localAccountProvider(key);
    const sameOriginFetch: typeof fetch = (input, init) => fetch(new URL(String(input), origin), init);
    const actorFailureReasons = new Set<string>();
    const actorFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (!response.ok) {
        const body = await response.clone().json().catch(() => null) as { reason?: unknown } | null;
        if (typeof body?.reason === "string" && /^[A-Z_]+$/.test(body.reason)) actorFailureReasons.add(body.reason);
      }
      return response;
    };
    const config = await fetchInteractiveDemoConfig(sameOriginFetch);

    stage = "funding";
    const before = await loadDemoAccount(account.address, config);
    if (before.accounting.available < 300_000n) {
      expect(before.tokenBalance).toBeGreaterThanOrEqual(300_000n);
      await executeDemoVaultAction("APPROVE", 300_000n, account.address, provider, config);
      await executeDemoVaultAction("DEPOSIT", 300_000n, account.address, provider, config);
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const compilation = compileStudioDraft({
      ...studioTemplateDraft("delegated-allowance"),
      policyName: `deployed-live-smoke-${now}`,
      owner: account.address,
      target: account.address,
      requester: account.address,
      registry: config.registry,
      vault: config.vault,
      router: config.router,
      asset: config.asset,
      maxPerAction: "0.1",
      dailyCap: "0.15",
      startAt: (now - 60n).toString(),
      endAt: (now + 86_400n).toString(),
      scheduleIntervalSeconds: "0",
      scheduleGraceSeconds: "0",
      maxOccurrences: "10",
    }, createStudioEntropy());
    stage = "custody";
    const session = await collectDemoCustody(compilation.policy, account.address, provider, config, actorFetch);
    stage = "registration";
    const registration = await registerDemoPolicy(session, account.address, provider, config);

    stage = "allow-request";
    const allowRequest = await createDemoRequest(session, 100_000n, account.address, provider, config);
    stage = "allow-evaluation";
    actorFailureReasons.clear();
    const allow = await collectDemoEvaluations(session, allowRequest.request, config, registration.blockNumber, actorFetch);
    stage = `allow-evaluation-${allow.status.toLowerCase()}-${allow.valid.length}-${[...actorFailureReasons].join("-") || "NO_CODE"}`;
    expect(allow.status).toBe("THRESHOLD_READY");
    expect(allow.matching[0]?.result.decision).toBe("ALLOW");
    stage = "allow-threshold";
    await submitDemoThreshold(allow, account.address, provider, config);
    stage = "execution";
    await executeDemoRequest(allowRequest.request.requestId, account.address, provider, config);
    expect((await loadDemoRequestStatus(allowRequest.request.requestId, config)).status).toBe(4);

    stage = "deny-request";
    const denyRequest = await createDemoRequest(session, 100_000n, account.address, provider, config);
    stage = "deny-evaluation";
    actorFailureReasons.clear();
    const deny = await collectDemoEvaluations(session, denyRequest.request, config, registration.blockNumber, actorFetch);
    stage = `deny-evaluation-${deny.status.toLowerCase()}-${deny.valid.length}-${[...actorFailureReasons].join("-") || "NO_CODE"}`;
    expect(deny.status).toBe("THRESHOLD_READY");
    expect(deny.matching[0]?.result.decision).toBe("DENY");
    expect(deny.matching[0]?.result.publicReasonClass).toBe("CAP_EXCEEDED");
    stage = "deny-threshold";
    await submitDemoThreshold(deny, account.address, provider, config);
    expect((await loadDemoRequestStatus(denyRequest.request.requestId, config)).status).toBe(3);

    stage = "governance";
    await governDemoPolicy("STOP", session.binding.policyCommitment, account.address, provider, config);
    await governDemoPolicy("RESUME", session.binding.policyCommitment, account.address, provider, config);
    await governDemoPolicy("REVOKE", session.binding.policyCommitment, account.address, provider, config);
    const after = await loadDemoAccount(account.address, config, session.binding.policyCommitment);
    expect(after.policyStatus).toBe(3);
    expect(after.accounting.deposited).toBe(
      after.accounting.available + after.accounting.reserved + after.accounting.spent
      + after.accounting.withdrawn + after.accounting.refunded,
    );
    } catch {
      // Never let a provider error serialize calldata, ciphertext, signatures,
      // or wallet internals into CI output.
      throw new Error(`deployed interactive lifecycle failed closed at ${stage}`);
    }
  }, 600_000);
});

function localAccountProvider(key: Hex): Eip1193Provider {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: COSTON2_CHAIN, transport: http(COSTON2_CHAIN.rpcUrls.default.http[0]) });
  return {
    async request({ method, params }) {
      if (method === "personal_sign") {
        const digest = Array.isArray(params) ? params[0] : undefined;
        if (typeof digest !== "string") throw new Error("personal_sign digest is unavailable");
        return account.signMessage({ message: { raw: digest as Hex } });
      }
      if (method === "eth_sendTransaction") {
        const transaction = Array.isArray(params) ? params[0] as Record<string, string> | undefined : undefined;
        if (!transaction?.to || !transaction.data) throw new Error("transaction payload is unavailable");
        return wallet.sendTransaction({
          account,
          chain: COSTON2_CHAIN,
          to: transaction.to as Address,
          data: transaction.data as Hex,
          ...(transaction.value ? { value: BigInt(transaction.value) } : {}),
          ...(transaction.gas ? { gas: BigInt(transaction.gas) } : {}),
        });
      }
      if (method === "eth_chainId") return `0x${COSTON2_CHAIN.id.toString(16)}`;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      throw new Error(`unsupported live-smoke wallet method: ${method}`);
    },
  };
}
