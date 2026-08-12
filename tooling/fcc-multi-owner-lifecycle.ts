import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PayGuardActionRouterAbi, PayGuardPolicyRegistryV2Abi, PayGuardVaultAbi } from "../packages/bindings/src/index.js";
import { genesisSpendCheckpoint, type Hex } from "../packages/protocol/src/index.js";
import { liveEvaluationAuthorizationDigest } from "../apps/relay/src/live-runtime.js";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  parseEther,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  accountingOf,
  balanceCheckpoint,
  buildRequest,
  requestRelayEvaluation,
  sameAccounting,
  type Accounting,
  type RelayResult,
} from "./fcc-hosted-relay-lifecycle.js";
import { executeLiveCustody, parseLiveCustodyCLI } from "./fcc-live-custody.js";

const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(root, "evidence/coston2/fcc-multi-owner-lifecycle.json");
const recoveryDirectory = resolve(root, ".local/multi-owner-live");
const recoveryPath = resolve(recoveryDirectory, ".env.local");
const defaultRelay = "https://payguard-live-relay-production.up.railway.app";
const ftestXrp = getAddress("0x0b6A3645c240605887a5532109323A3E12273dc7");
const registryV2 = getAddress("0xbB89d68Efd3994CD688816c175343511bA5c0E88");
const vaultV2 = getAddress("0xe8f5b30F9adCea6b8532bFbD65f804E771520214");
const chain = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export interface MultiOwnerCLI {
  plan: boolean;
  broadcast: boolean;
  writeLivePrivatePolicy: boolean;
  relayOrigin: string;
  cleanupPolicy?: Hex;
}

interface WriteResult { transaction: Hash; blockNumber: bigint }

export function parseMultiOwnerCLI(argv: readonly string[]): MultiOwnerCLI {
  const [mode, ...tokens] = argv;
  if (mode === "plan" && tokens.length === 0) return { plan: true, broadcast: false, writeLivePrivatePolicy: false, relayOrigin: defaultRelay };
  if (mode === "cleanup") {
    if (tokens.length !== 2 || tokens[0] !== "--policy" || !/^0x[0-9a-fA-F]{64}$/.test(tokens[1] ?? "")) {
      throw new Error("cleanup requires --policy and one exact bytes32 commitment");
    }
    return { plan: false, broadcast: true, writeLivePrivatePolicy: false, relayOrigin: defaultRelay, cleanupPolicy: tokens[1]!.toLowerCase() as Hex };
  }
  if (mode !== "run") throw new Error("mode must be plan, run, or cleanup");
  let broadcast = false;
  let writeLivePrivatePolicy = false;
  let relayOrigin: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--broadcast" && !broadcast) { broadcast = true; continue; }
    if (token === "--write-live-private-policy" && !writeLivePrivatePolicy) { writeLivePrivatePolicy = true; continue; }
    if (token === "--relay" && index + 1 < tokens.length && !relayOrigin) {
      const candidate = tokens[++index]!;
      const origin = new URL(candidate).origin;
      if (origin !== candidate || !origin.startsWith("https://")) throw new Error("relay must be a bare HTTPS origin");
      relayOrigin = origin;
      continue;
    }
    throw new Error(`invalid or duplicate multi-owner argument ${token}`);
  }
  if (!broadcast || !writeLivePrivatePolicy || !relayOrigin) {
    throw new Error("run requires --broadcast, --write-live-private-policy, and --relay");
  }
  return { plan: false, broadcast, writeLivePrivatePolicy, relayOrigin };
}

export function buildMultiOwnerEvidence(input: {
  sourceCommit: string;
  relayOrigin: string;
  observedBlock: bigint;
  sourceAccount: Address;
  policyOwner: Address;
  authorizedRequester: Address;
  policyCommitment: Hex;
  funding: { ownerGas: Hash; ownerToken: Hash; requesterGas: Hash };
  custodyFreeze: Hash;
  allow: RelayResult & { create: Hash; execute: Hash };
  denies: {
    requester: RelayResult & { create: Hash };
    target: RelayResult & { create: Hash };
    cap: RelayResult & { create: Hash };
  };
  governance: { stop: Hash; resume: Hash; revoke: Hash };
  cleanup: { withdraw: Hash; ownerTokenReturn: Hash; requesterTokenReturn: Hash; ownerGasReturn: Hash; requesterGasReturn: Hash };
  accounting: { before: Accounting; afterExecution: Accounting; afterWithdrawal: Accounting };
  recordedAt?: string;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit) || input.sourceAccount === input.policyOwner
    || input.policyOwner === input.authorizedRequester || input.sourceAccount === input.authorizedRequester
    || input.allow.decision !== "ALLOW" || input.allow.routerStatus !== 2
    || Object.values(input.denies).some((item) => item.decision !== "DENY" || item.routerStatus !== 3)
    || input.denies.requester.publicReasonClass !== "REQUESTER_DENIED"
    || input.denies.target.publicReasonClass !== "TARGET_DENIED"
    || input.denies.cap.publicReasonClass !== "CAP_EXCEEDED"
    || input.allow.transactions.submit.length < 2
    || input.accounting.afterExecution.spent !== input.accounting.before.spent + 100_000n
    || input.accounting.afterWithdrawal.available !== 0n) throw new Error("multi-owner evidence input is invalid");
  return {
    schemaVersion: 1,
    suite: "payguard-coston2-hosted-multi-owner-lifecycle",
    status: "verified-hosted-live-simulated-fcc-multi-owner-lifecycle",
    registryVersion: "V2",
    deploymentProfile: "COSTON2_SIMULATED_V2",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    network: { name: "flare-coston2", chainId: 114, observedBlock: input.observedBlock.toString() },
    publicIdentifiers: {
      verificationSourceCommit: input.sourceCommit,
      relayOrigin: input.relayOrigin,
      fundingSource: input.sourceAccount,
      independentPolicyOwner: input.policyOwner,
      independentAuthorizedRequester: input.authorizedRequester,
      policyCommitment: input.policyCommitment,
      fundingTransactions: input.funding,
      custodyFreezeTransaction: input.custodyFreeze,
      allow: {
        requestId: input.allow.requestId,
        instructionId: input.allow.instructionId,
        create: input.allow.create,
        dispatch: input.allow.transactions.dispatch,
        submit: input.allow.transactions.submit,
        execute: input.allow.execute,
      },
      denies: input.denies,
      policyLifecycleTransactions: input.governance,
      cleanupTransactions: input.cleanup,
      accounting: input.accounting,
    },
    assertions: {
      sourceFundedIndependentOwner: true,
      sourceFundedIndependentRequester: true,
      independentOwnerAuthorizedThreeCiphertexts: true,
      threeRegisteredMachineReceiptsVerified: true,
      independentOwnerRegisteredPolicy: true,
      registryStoredIndependentOwner: true,
      nonOwnerGovernanceRejected: true,
      policyOwnerCannotAuthorizeRequesterEvaluation: true,
      wrongEvaluationSignerRejected: true,
      exactRequesterEvaluationAccepted: true,
      requesterCreatedRequestWithoutOwnerSignature: true,
      requesterReceivedAuthorizedTransfer: true,
      unauthorizedRequesterDenied: true,
      unauthorizedTargetDenied: true,
      capExceededDenied: true,
      duplicateEvaluationCoalesced: true,
      twoMatchingAllowSubmittedByRelay: true,
      allowExecutionVerified: true,
      stoppedPolicyRequestRejected: true,
      revokedPolicyResumeRejected: true,
      ownerStopResumeRevokeVerified: true,
      vaultConservationVerified: true,
      testFundsReturned: true,
      clientDecisionAccepted: false,
      hardwareAttestationVerified: false,
      simulatedTee: true,
      v2LiveCandidateVerified: true,
      v2ReleaseVerified: false,
      verifiedPayGuardRelease: false,
      noPrivateKeyRecorded: true,
      noCredentialRecorded: true,
      noPolicyRecorded: true,
      noCiphertextRecorded: true,
      noSignatureRecorded: true,
      testnetOnly: true,
    },
    blockers: ["HARDWARE_ATTESTATION_NOT_VERIFIED", "VERIFIED_RELEASE_NOT_PROMOTED"],
    notes: [
      "Fresh owner and requester Coston2 wallets were generated for this run and funded by the existing testnet source account.",
      "The owner authorized custody, registered and funded the policy; the distinct requester created, authorized, executed, and received the payment without an owner signature on the request path.",
      "Owner-as-requester authorization, wrong signer, unauthorized requester, unauthorized target, cap excess, non-owner governance, stopped-policy request creation, and revoked-policy resume all failed closed.",
      "The relay coalesced a newly signed retry for the same request without new dispatch or result-submission transactions.",
      "Remaining test token and gas were returned; private keys, policies, ciphertexts, authorizations, and signatures are excluded.",
      "This is Coston2 SIMULATED_TEE evidence, not hardware attestation, a verified release, or mainnet readiness.",
    ],
  };
}

async function run(options: MultiOwnerCLI): Promise<void> {
  if (options.plan) {
    console.log(JSON.stringify({
      status: "planned",
      network: "flare-coston2",
      relayOrigin: options.relayOrigin,
      operations: [
        "generate recoverable owner and requester", "fund owner and requester", "owner-authorized A/B/D custody",
        "owner policy registration", "owner/wrong-signer evaluation negatives", "requester request/evaluation/execute",
        "requester, target, and cap denial matrix", "duplicate evaluation coalescing", "non-owner governance negatives",
        "owner stop/resume/revoke", "return all test funds",
      ],
      broadcasts: false,
      privateMaterialRecorded: false,
    }, null, 2));
    return;
  }
  if (options.cleanupPolicy) {
    await cleanupFailedRun(options.cleanupPolicy);
    return;
  }

  let stage = "configuration preflight";
  try {
    const configured = loadSourceAccount();
    const client = createPublicClient({ chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
    if (await client.getChainId() !== 114) throw new Error("wrong chain");
    const sourceWallet = createWalletClient({ account: configured.account, chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
    const { owner, requester } = await loadOrCreateEphemeralAccounts();

    stage = "independent owner and requester funding";
    const ownerGasTarget = parseEther("2");
    const requesterGasTarget = parseEther("1");
    const tokenFundingTarget = 1_000_000n;
    const [sourceGas, sourceToken, ownerGasBefore, ownerTokenBefore, requesterGasBefore] = await Promise.all([
      client.getBalance({ address: configured.account.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [configured.account.address] }),
      client.getBalance({ address: owner.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
      client.getBalance({ address: requester.address }),
    ]);
    const ownerGasFunding = ownerGasBefore < ownerGasTarget ? ownerGasTarget - ownerGasBefore : parseEther("0.01");
    const requesterGasFunding = requesterGasBefore < requesterGasTarget ? requesterGasTarget - requesterGasBefore : parseEther("0.01");
    const tokenFunding = ownerTokenBefore < tokenFundingTarget ? tokenFundingTarget - ownerTokenBefore : 1n;
    if (sourceGas < ownerGasFunding + requesterGasFunding + parseEther("0.2") || sourceToken < tokenFunding) throw new Error("funding buffer unavailable");
    const ownerGasFundingHash = await sourceWallet.sendTransaction({ account: configured.account, chain: sourceWallet.chain, to: owner.address, value: ownerGasFunding });
    const ownerGasFundingReceipt = await client.waitForTransactionReceipt({ hash: ownerGasFundingHash, confirmations: 2, timeout: 180_000 });
    if (ownerGasFundingReceipt.status !== "success") throw new Error("owner gas funding reverted");
    const requesterGasFundingHash = await sourceWallet.sendTransaction({ account: configured.account, chain: sourceWallet.chain, to: requester.address, value: requesterGasFunding });
    const requesterGasFundingReceipt = await client.waitForTransactionReceipt({ hash: requesterGasFundingHash, confirmations: 2, timeout: 180_000 });
    if (requesterGasFundingReceipt.status !== "success") throw new Error("requester gas funding reverted");
    const tokenFundingResult = await writeContract(client, sourceWallet, configured.account, ftestXrp, erc20Abi, "transfer", [owner.address, tokenFunding]);
    const [ownerGas, ownerToken, requesterGas] = await Promise.all([
      client.getBalance({ address: owner.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
      client.getBalance({ address: requester.address }),
    ]);
    if (ownerGas < ownerGasTarget || ownerToken < tokenFundingTarget || requesterGas < requesterGasTarget) throw new Error("funding postcondition failed");

    stage = "three-machine custody and policy registration";
    const custodyOptions = parseLiveCustodyCLI(["freeze", "--write-live-private-policy", "--broadcast", "--relay", options.relayOrigin]);
    const context = await executeLiveCustody({
      ...custodyOptions,
      ownerAccount: owner,
      authorizedRequester: requester.address,
      allowedTarget: requester.address,
      policyProfile: "lifecycle",
      writeEvidence: false,
    });
    if (!context?.freeze || context.binding.owner !== owner.address || context.account.address !== owner.address
      || context.freeze.registryVersion !== "V2") throw new Error("independent owner custody/registration failed");
    const { sourceCommit, registry, vault, router, binding } = context;
    const ownerWallet = createWalletClient({ account: owner, chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
    const requesterWallet = createWalletClient({ account: requester, chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });

    stage = "requester governance rejection";
    await expectSimulationRevert(() => client.simulateContract({ account: requester.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "stopPolicy", args: [binding.policyCommitment] }));
    stage = "independent owner vault funding";
    const depositAmount = 500_000n;
    await writeContract(client, ownerWallet, owner, ftestXrp, erc20Abi, "approve", [vault, depositAmount]);
    await writeContract(client, ownerWallet, owner, vault, PayGuardVaultAbi, "deposit", [ftestXrp, depositAmount, owner.address]);
    const accountingBefore = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    if (accountingBefore.available !== depositAmount) throw new Error("independent owner vault deposit failed");

    stage = "independent requester request creation";
    const firstBlock = await client.getBlock({ blockTag: "latest" });
    const request = buildRequest(
      binding, requester.address, registry, vault, router, 1,
      genesisSpendCheckpoint(binding.policyCommitment), balanceCheckpoint(accountingBefore, 1n), firstBlock.timestamp,
      { target: requester.address },
    );
    const requesterTokenBefore = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [requester.address] });
    const created = await writeContract(client, requesterWallet, requester, router, PayGuardActionRouterAbi, "createRequest", [request]);
    stage = "wrong evaluation authorization rejection";
    await expectRelayAuthorizationRejection(options.relayOrigin, request.requestId, requester.address, owner, false);
    await expectRelayAuthorizationRejection(options.relayOrigin, request.requestId, owner.address, owner, true);
    stage = "independent requester threshold evaluation";
    const allowed = await requestRelayEvaluation(options.relayOrigin, request.requestId, requester);
    if (allowed.decision !== "ALLOW" || allowed.routerStatus !== 2 || !allowed.transactions.dispatch || allowed.transactions.submit.length < 2) {
      throw new Error("independent requester threshold ALLOW failed");
    }
    const repeated = await requestRelayEvaluation(options.relayOrigin, request.requestId, requester);
    if (repeated.transactions.dispatch !== allowed.transactions.dispatch
      || repeated.transactions.submit.join(",") !== allowed.transactions.submit.join(",")) throw new Error("duplicate evaluation was not coalesced");
    stage = "independent requester execution";
    const executed = await writeContract(client, requesterWallet, requester, router, PayGuardActionRouterAbi, "execute", [request.requestId]);
    const accountingAfterExecution = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    const requesterTokenAfterExecution = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [requester.address] });
    if (accountingAfterExecution.available !== accountingBefore.available - request.amount
      || accountingAfterExecution.spent !== accountingBefore.spent + request.amount
      || requesterTokenAfterExecution !== requesterTokenBefore + request.amount) throw new Error("independent requester execution conservation failed");

    stage = "delegated policy denial matrix";
    const spend = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "spendState", args: [binding.policyCommitment] });
    const denialBlock = await client.getBlock({ blockTag: "latest" });
    const occurrence = Number(spend[1]) + 1;
    const checkpoint = balanceCheckpoint(accountingAfterExecution, BigInt(occurrence));
    stage = "unauthorized requester denial";
    const unauthorizedRequester = buildRequest(binding, configured.account.address, registry, vault, router, occurrence, spend[0], checkpoint, denialBlock.timestamp, { target: requester.address });
    const createdRequesterDeny = await writeContract(client, sourceWallet, configured.account, router, PayGuardActionRouterAbi, "createRequest", [unauthorizedRequester]);
    const requesterDeny = await requestRelayEvaluation(options.relayOrigin, unauthorizedRequester.requestId, configured.account);
    if (requesterDeny.decision !== "DENY" || requesterDeny.publicReasonClass !== "REQUESTER_DENIED" || requesterDeny.routerStatus !== 3) throw new Error("unauthorized requester did not fail closed");

    stage = "unauthorized target denial";
    const wrongTarget = buildRequest(binding, requester.address, registry, vault, router, occurrence, spend[0], checkpoint, denialBlock.timestamp, { target: configured.account.address });
    const createdTargetDeny = await writeContract(client, requesterWallet, requester, router, PayGuardActionRouterAbi, "createRequest", [wrongTarget]);
    const targetDeny = await requestRelayEvaluation(options.relayOrigin, wrongTarget.requestId, requester);
    if (targetDeny.decision !== "DENY" || targetDeny.publicReasonClass !== "TARGET_DENIED" || targetDeny.routerStatus !== 3) throw new Error("unauthorized target did not fail closed");

    stage = "cap exceeded denial";
    const capExcess = buildRequest(binding, requester.address, registry, vault, router, occurrence, spend[0], checkpoint, denialBlock.timestamp, { target: requester.address });
    const createdCapDeny = await writeContract(client, requesterWallet, requester, router, PayGuardActionRouterAbi, "createRequest", [capExcess]);
    const capDeny = await requestRelayEvaluation(options.relayOrigin, capExcess.requestId, requester);
    if (capDeny.decision !== "DENY" || capDeny.publicReasonClass !== "CAP_EXCEEDED" || capDeny.routerStatus !== 3) throw new Error("cap excess did not fail closed");
    const accountingAfterDenials = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    if (!sameAccounting(accountingAfterExecution, accountingAfterDenials)) throw new Error("denied delegated requests moved vault accounting");

    stage = "owner governance and stopped-policy negatives";
    const stopped = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "stopPolicy", [binding.policyCommitment]);
    const stoppedBlock = await client.getBlock({ blockTag: "latest" });
    const stoppedRequest = buildRequest(binding, requester.address, registry, vault, router, Number(spend[1]) + 1, spend[0], balanceCheckpoint(accountingAfterExecution, BigInt(Number(spend[1]) + 1)), stoppedBlock.timestamp, { target: requester.address });
    await expectSimulationRevert(() => client.simulateContract({ account: requester.address, address: router, abi: PayGuardActionRouterAbi, functionName: "createRequest", args: [stoppedRequest] }));
    await expectSimulationRevert(() => client.simulateContract({ account: configured.account.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "resumePolicy", args: [binding.policyCommitment] }));
    const resumed = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "resumePolicy", [binding.policyCommitment]);
    const revoked = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "revokePolicy", [binding.policyCommitment]);
    await expectSimulationRevert(() => client.simulateContract({ account: owner.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "resumePolicy", args: [binding.policyCommitment] }));

    stage = "test-fund cleanup";
    const withdrawAmount = accountingAfterExecution.available;
    const withdrawn = await writeContract(client, ownerWallet, owner, vault, PayGuardVaultAbi, "withdraw", [ftestXrp, withdrawAmount, owner.address]);
    const accountingAfterWithdrawal = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    const ownerTokenAfterWithdrawal = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] });
    const requesterTokenAfter = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [requester.address] });
    const ownerTokenReturned = await writeContract(client, ownerWallet, owner, ftestXrp, erc20Abi, "transfer", [configured.account.address, ownerTokenAfterWithdrawal]);
    const requesterTokenReturned = await writeContract(client, requesterWallet, requester, ftestXrp, erc20Abi, "transfer", [configured.account.address, requesterTokenAfter]);
    const ownerGasReturned = await returnNativeGas(client, ownerWallet, owner, configured.account.address);
    const requesterGasReturned = await returnNativeGas(client, requesterWallet, requester, configured.account.address);
    const [ownerTokenFinal, requesterTokenFinal] = await Promise.all([
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [requester.address] }),
    ]);
    if (ownerTokenFinal !== 0n || requesterTokenFinal !== 0n) throw new Error("test token cleanup failed");

    stage = "public-safe evidence write";
    const evidence = buildMultiOwnerEvidence({
      sourceCommit,
      relayOrigin: options.relayOrigin,
      observedBlock: requesterGasReturned.blockNumber,
      sourceAccount: configured.account.address,
      policyOwner: owner.address,
      authorizedRequester: requester.address,
      policyCommitment: binding.policyCommitment,
      funding: { ownerGas: ownerGasFundingHash, ownerToken: tokenFundingResult.transaction, requesterGas: requesterGasFundingHash },
      custodyFreeze: context.freeze.policyFreezeTransaction,
      allow: { ...allowed, create: created.transaction, execute: executed.transaction },
      denies: {
        requester: { ...requesterDeny, create: createdRequesterDeny.transaction },
        target: { ...targetDeny, create: createdTargetDeny.transaction },
        cap: { ...capDeny, create: createdCapDeny.transaction },
      },
      governance: { stop: stopped.transaction, resume: resumed.transaction, revoke: revoked.transaction },
      cleanup: {
        withdraw: withdrawn.transaction,
        ownerTokenReturn: ownerTokenReturned.transaction,
        requesterTokenReturn: requesterTokenReturned.transaction,
        ownerGasReturn: ownerGasReturned.transaction,
        requesterGasReturn: requesterGasReturned.transaction,
      },
      accounting: { before: accountingBefore, afterExecution: accountingAfterExecution, afterWithdrawal: accountingAfterWithdrawal },
    });
    await writeEvidence(evidence);
    await unlink(recoveryPath);
    console.log(JSON.stringify({
      status: evidence.status,
      relayOrigin: options.relayOrigin,
      independentPolicyOwner: owner.address,
      independentAuthorizedRequester: requester.address,
      policyCommitment: binding.policyCommitment,
      requestId: request.requestId,
      finalBlock: requesterGasReturned.blockNumber.toString(),
      evidencePath,
      recoveryFileRemoved: true,
      privateMaterialRecorded: false,
    }, null, 2));
  } catch (error) {
    void error;
    throw new Error(`multi-owner lifecycle failed closed at ${stage}; ephemeral recovery remains at ${recoveryPath}`);
  }
}

async function cleanupFailedRun(policyCommitment: Hex): Promise<void> {
  // Refuse to manufacture new accounts for cleanup: the retained mode-0600
  // recovery file is the explicit proof that a failed run is recoverable.
  await readFile(recoveryPath, "utf8");
  const configured = loadSourceAccount();
  const { owner, requester } = await loadOrCreateEphemeralAccounts();
  const liveChain = { ...chain, rpcUrls: { default: { http: [configured.rpc] } } };
  const client = createPublicClient({ chain: liveChain, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
  const ownerWallet = createWalletClient({ account: owner, chain: liveChain, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
  const requesterWallet = createWalletClient({ account: requester, chain: liveChain, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
  const [binding, status] = await client.readContract({ address: registryV2, abi: PayGuardPolicyRegistryV2Abi, functionName: "getPolicy", args: [policyCommitment] });
  if (getAddress(binding.owner) !== owner.address || Number(status) === 0) throw new Error("cleanup policy is not owned by the retained owner");
  if (Number(status) !== 3) {
    await writeContract(client, ownerWallet, owner, registryV2, PayGuardPolicyRegistryV2Abi, "revokePolicy", [policyCommitment]);
  }
  const accounting = accountingOf(await client.readContract({ address: vaultV2, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
  if (accounting.reserved !== 0n) throw new Error("cleanup cannot withdraw reserved funds");
  if (accounting.available > 0n) {
    await writeContract(client, ownerWallet, owner, vaultV2, PayGuardVaultAbi, "withdraw", [ftestXrp, accounting.available, owner.address]);
  }
  const ownerToken = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] });
  if (ownerToken > 0n) await writeContract(client, ownerWallet, owner, ftestXrp, erc20Abi, "transfer", [configured.account.address, ownerToken]);
  const requesterToken = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [requester.address] });
  if (requesterToken > 0n) await writeContract(client, requesterWallet, requester, ftestXrp, erc20Abi, "transfer", [configured.account.address, requesterToken]);
  const ownerGas = await returnNativeGas(client, ownerWallet, owner, configured.account.address);
  const requesterGas = await returnNativeGas(client, requesterWallet, requester, configured.account.address);
  await unlink(recoveryPath);
  console.log(JSON.stringify({
    status: "failed-run-cleaned",
    policyCommitment,
    ownerGasReturnBlock: ownerGas.blockNumber.toString(),
    requesterGasReturnBlock: requesterGas.blockNumber.toString(),
    recoveryFileRemoved: true,
    privateMaterialRecorded: false,
  }, null, 2));
}

function loadSourceAccount(): { account: PrivateKeyAccount; rpc: string } {
  try { process.loadEnvFile(resolve(root, ".env.local")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const key = process.env.PAYGUARD_DEPLOYER_PRIVATE_KEY;
  const configuredAddress = process.env.PAYGUARD_DEPLOYER_ADDRESS;
  const rpc = process.env.COSTON2_RPC_URL ?? chain.rpcUrls.default.http[0];
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "") || !isAddress(configuredAddress ?? "") || !rpc.startsWith("https://")) {
    throw new Error("source wallet or Coston2 RPC configuration is missing");
  }
  const account = privateKeyToAccount(key as Hex);
  if (account.address !== getAddress(configuredAddress!)) throw new Error("source wallet configuration does not match its key");
  return { account, rpc };
}

async function persistRecovery(input: { ownerKey: Hex; ownerAddress: Address; requesterKey: Hex; requesterAddress: Address }): Promise<void> {
  await mkdir(recoveryDirectory, { recursive: true });
  await writeFile(recoveryPath, `# Temporary Coston2 delegated lifecycle recovery only. Never commit.\nPAYGUARD_EPHEMERAL_OWNER_ADDRESS=${input.ownerAddress}\nPAYGUARD_EPHEMERAL_OWNER_PRIVATE_KEY=${input.ownerKey}\nPAYGUARD_EPHEMERAL_REQUESTER_ADDRESS=${input.requesterAddress}\nPAYGUARD_EPHEMERAL_REQUESTER_PRIVATE_KEY=${input.requesterKey}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function loadOrCreateEphemeralAccounts(): Promise<{ owner: PrivateKeyAccount; requester: PrivateKeyAccount }> {
  try {
    const body = await readFile(recoveryPath, "utf8");
    const ownerAddress = body.match(/^PAYGUARD_EPHEMERAL_OWNER_ADDRESS=(0x[0-9a-fA-F]{40})$/m)?.[1];
    const ownerKey = body.match(/^PAYGUARD_EPHEMERAL_OWNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
    const requesterAddress = body.match(/^PAYGUARD_EPHEMERAL_REQUESTER_ADDRESS=(0x[0-9a-fA-F]{40})$/m)?.[1];
    const requesterKey = body.match(/^PAYGUARD_EPHEMERAL_REQUESTER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
    if (!ownerAddress || !ownerKey || !requesterAddress || !requesterKey || !isAddress(ownerAddress) || !isAddress(requesterAddress)) throw new Error("recovery file is malformed");
    const owner = privateKeyToAccount(ownerKey as Hex);
    const requester = privateKeyToAccount(requesterKey as Hex);
    if (owner.address !== getAddress(ownerAddress) || requester.address !== getAddress(requesterAddress) || owner.address === requester.address) throw new Error("recovery account mismatch");
    return { owner, requester };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("ephemeral recovery file is unavailable");
  }
  const ownerKey = `0x${randomBytes(32).toString("hex")}` as Hex;
  const requesterKey = `0x${randomBytes(32).toString("hex")}` as Hex;
  const owner = privateKeyToAccount(ownerKey);
  const requester = privateKeyToAccount(requesterKey);
  await persistRecovery({ ownerKey, ownerAddress: owner.address, requesterKey, requesterAddress: requester.address });
  return { owner, requester };
}

async function writeContract(
  client: ReturnType<typeof createPublicClient>,
  wallet: ReturnType<typeof createWalletClient>,
  account: PrivateKeyAccount,
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[],
): Promise<WriteResult> {
  const simulation = await client.simulateContract({ account: account.address, address, abi: abi as never, functionName: functionName as never, args: args as never });
  const transaction = await wallet.writeContract({ ...simulation.request, account, chain: wallet.chain } as never) as Hash;
  const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return { transaction, blockNumber: receipt.blockNumber };
}

async function expectSimulationRevert(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error("negative contract simulation unexpectedly succeeded");
}

async function expectRelayAuthorizationRejection(
  relayOrigin: string,
  requestId: Hex,
  claimedRequester: Address,
  signer: PrivateKeyAccount,
  digestUsesSigner: boolean,
): Promise<void> {
  const issuedAt = BigInt(Math.floor(Date.now() / 1_000));
  const expiry = issuedAt + 240n;
  const digestRequester = digestUsesSigner ? signer.address : claimedRequester;
  const signature = await signer.signMessage({ message: { raw: liveEvaluationAuthorizationDigest({ requestId, requester: digestRequester, issuedAt, expiry }) } });
  const response = await fetch(`${relayOrigin}/v1/requests/${requestId}/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-payguard-requester": claimedRequester,
      "x-payguard-issued-at": issuedAt.toString(),
      "x-payguard-expiry": expiry.toString(),
      "x-payguard-authorization": signature,
    },
    body: "{}",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 422) throw new Error(`wrong evaluation authorization returned HTTP ${response.status}`);
}

async function returnNativeGas(
  client: ReturnType<typeof createPublicClient>,
  wallet: ReturnType<typeof createWalletClient>,
  account: PrivateKeyAccount,
  recipient: Address,
): Promise<WriteResult> {
  const [balance, gasPrice] = await Promise.all([client.getBalance({ address: account.address }), client.getGasPrice()]);
  const gas = 21_000n;
  const fee = gas * gasPrice;
  if (balance <= fee) throw new Error("ephemeral owner has insufficient gas to return its remainder");
  const transaction = await wallet.sendTransaction({ account, chain: wallet.chain, to: recipient, value: balance - fee, gas, gasPrice });
  const receipt = await client.waitForTransactionReceipt({ hash: transaction, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("gas return reverted");
  return { transaction, blockNumber: receipt.blockNumber };
}

async function writeEvidence(value: unknown): Promise<void> {
  await mkdir(resolve(root, "evidence/coston2"), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  const serialized = `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
  await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, evidencePath);
}

if (import.meta.url === new URL(process.argv[1]!, "file:").href) {
  run(parseMultiOwnerCLI(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "multi-owner lifecycle failed");
    process.exitCode = 1;
  });
}
