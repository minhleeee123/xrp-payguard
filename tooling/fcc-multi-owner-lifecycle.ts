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
}

interface WriteResult { transaction: Hash; blockNumber: bigint }

export function parseMultiOwnerCLI(argv: readonly string[]): MultiOwnerCLI {
  const [mode, ...tokens] = argv;
  if (mode === "plan" && tokens.length === 0) return { plan: true, broadcast: false, writeLivePrivatePolicy: false, relayOrigin: defaultRelay };
  if (mode !== "run") throw new Error("mode must be plan or run");
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
  policyCommitment: Hex;
  funding: { gas: Hash; token: Hash };
  custodyFreeze: Hash;
  allow: RelayResult & { create: Hash; execute: Hash };
  governance: { stop: Hash; resume: Hash; revoke: Hash };
  cleanup: { withdraw: Hash; tokenReturn: Hash; gasReturn: Hash };
  accounting: { before: Accounting; afterExecution: Accounting; afterWithdrawal: Accounting };
  recordedAt?: string;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit) || input.sourceAccount === input.policyOwner
    || input.allow.decision !== "ALLOW" || input.allow.routerStatus !== 2
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
      policyLifecycleTransactions: input.governance,
      cleanupTransactions: input.cleanup,
      accounting: input.accounting,
    },
    assertions: {
      sourceFundedIndependentOwner: true,
      independentOwnerAuthorizedThreeCiphertexts: true,
      threeRegisteredMachineReceiptsVerified: true,
      independentOwnerRegisteredPolicy: true,
      registryStoredIndependentOwner: true,
      nonOwnerGovernanceRejected: true,
      wrongEvaluationOwnerRejected: true,
      wrongEvaluationSignerRejected: true,
      exactOwnerEvaluationAccepted: true,
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
      "A fresh Coston2 wallet was generated for this run and funded by the existing testnet source account.",
      "The independent wallet, not the relay executor, authorized custody, registered the policy, authorized evaluation, executed, and governed the policy.",
      "Wrong-owner and wrong-signer evaluation requests, non-owner governance, stopped-policy request creation, and revoked-policy resume all failed closed.",
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
        "generate recoverable ephemeral owner", "fund owner gas and FTestXRP", "owner-authorized A/B/D custody",
        "owner policy registration", "wrong owner/signer negatives", "owner request/evaluation/execute",
        "duplicate evaluation coalescing", "non-owner governance negatives", "owner stop/resume/revoke", "return test funds",
      ],
      broadcasts: false,
      privateMaterialRecorded: false,
    }, null, 2));
    return;
  }

  let stage = "configuration preflight";
  try {
    const configured = loadSourceAccount();
    const client = createPublicClient({ chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
    if (await client.getChainId() !== 114) throw new Error("wrong chain");
    const sourceWallet = createWalletClient({ account: configured.account, chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });
    const owner = await loadOrCreateEphemeralOwner();

    stage = "independent owner funding";
    const gasFundingTarget = parseEther("2");
    const tokenFundingTarget = 1_000_000n;
    const [sourceGas, sourceToken, ownerGasBefore, ownerTokenBefore] = await Promise.all([
      client.getBalance({ address: configured.account.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [configured.account.address] }),
      client.getBalance({ address: owner.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
    ]);
    const gasFunding = ownerGasBefore < gasFundingTarget ? gasFundingTarget - ownerGasBefore : parseEther("0.01");
    const tokenFunding = ownerTokenBefore < tokenFundingTarget ? tokenFundingTarget - ownerTokenBefore : 1n;
    if (sourceGas < gasFunding + parseEther("0.2") || sourceToken < tokenFunding) throw new Error("funding buffer unavailable");
    const gasFundingHash = await sourceWallet.sendTransaction({ account: configured.account, chain: sourceWallet.chain, to: owner.address, value: gasFunding });
    const gasFundingReceipt = await client.waitForTransactionReceipt({ hash: gasFundingHash, confirmations: 2, timeout: 180_000 });
    if (gasFundingReceipt.status !== "success") throw new Error("owner gas funding reverted");
    const tokenFundingResult = await writeContract(client, sourceWallet, configured.account, ftestXrp, erc20Abi, "transfer", [owner.address, tokenFunding]);
    const [ownerGas, ownerToken] = await Promise.all([
      client.getBalance({ address: owner.address }),
      client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
    ]);
    if (ownerGas < gasFundingTarget || ownerToken < tokenFundingTarget) throw new Error("funding postcondition failed");

    stage = "three-machine custody and policy registration";
    const custodyOptions = parseLiveCustodyCLI(["freeze", "--write-live-private-policy", "--broadcast", "--relay", options.relayOrigin]);
    const context = await executeLiveCustody({ ...custodyOptions, ownerAccount: owner, policyProfile: "lifecycle", writeEvidence: false });
    if (!context?.freeze || context.binding.owner !== owner.address || context.account.address !== owner.address
      || context.freeze.registryVersion !== "V2") throw new Error("independent owner custody/registration failed");
    const { sourceCommit, registry, vault, router, binding } = context;
    const ownerWallet = createWalletClient({ account: owner, chain: { ...chain, rpcUrls: { default: { http: [configured.rpc] } } }, transport: http(configured.rpc, { timeout: 15_000, retryCount: 2 }) });

    stage = "non-owner governance rejection";
    await expectSimulationRevert(() => client.simulateContract({ account: configured.account.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "stopPolicy", args: [binding.policyCommitment] }));
    stage = "independent owner vault funding";
    const depositAmount = 500_000n;
    await writeContract(client, ownerWallet, owner, ftestXrp, erc20Abi, "approve", [vault, depositAmount]);
    await writeContract(client, ownerWallet, owner, vault, PayGuardVaultAbi, "deposit", [ftestXrp, depositAmount, owner.address]);
    const accountingBefore = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    if (accountingBefore.available !== depositAmount) throw new Error("independent owner vault deposit failed");

    stage = "independent owner request creation";
    const firstBlock = await client.getBlock({ blockTag: "latest" });
    const request = buildRequest(binding, owner.address, registry, vault, router, 1, genesisSpendCheckpoint(binding.policyCommitment), balanceCheckpoint(accountingBefore, 1n), firstBlock.timestamp);
    const created = await writeContract(client, ownerWallet, owner, router, PayGuardActionRouterAbi, "createRequest", [request]);
    stage = "wrong evaluation authorization rejection";
    await expectRelayAuthorizationRejection(options.relayOrigin, request.requestId, owner.address, configured.account, false);
    await expectRelayAuthorizationRejection(options.relayOrigin, request.requestId, configured.account.address, configured.account, true);
    stage = "independent owner threshold evaluation";
    const allowed = await requestRelayEvaluation(options.relayOrigin, request.requestId, owner);
    if (allowed.decision !== "ALLOW" || allowed.routerStatus !== 2 || !allowed.transactions.dispatch || allowed.transactions.submit.length < 2) {
      throw new Error("independent owner threshold ALLOW failed");
    }
    const repeated = await requestRelayEvaluation(options.relayOrigin, request.requestId, owner);
    if (repeated.transactions.dispatch !== allowed.transactions.dispatch
      || repeated.transactions.submit.join(",") !== allowed.transactions.submit.join(",")) throw new Error("duplicate evaluation was not coalesced");
    stage = "independent owner execution";
    const executed = await writeContract(client, ownerWallet, owner, router, PayGuardActionRouterAbi, "execute", [request.requestId]);
    const accountingAfterExecution = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    if (accountingAfterExecution.available !== accountingBefore.available - request.amount
      || accountingAfterExecution.spent !== accountingBefore.spent + request.amount) throw new Error("independent owner execution conservation failed");

    stage = "owner governance and stopped-policy negatives";
    const stopped = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "stopPolicy", [binding.policyCommitment]);
    const spend = await client.readContract({ address: router, abi: PayGuardActionRouterAbi, functionName: "spendState", args: [binding.policyCommitment] });
    const stoppedBlock = await client.getBlock({ blockTag: "latest" });
    const stoppedRequest = buildRequest(binding, owner.address, registry, vault, router, Number(spend[1]) + 1, spend[0], balanceCheckpoint(accountingAfterExecution, BigInt(Number(spend[1]) + 1)), stoppedBlock.timestamp);
    await expectSimulationRevert(() => client.simulateContract({ account: owner.address, address: router, abi: PayGuardActionRouterAbi, functionName: "createRequest", args: [stoppedRequest] }));
    await expectSimulationRevert(() => client.simulateContract({ account: configured.account.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "resumePolicy", args: [binding.policyCommitment] }));
    const resumed = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "resumePolicy", [binding.policyCommitment]);
    const revoked = await writeContract(client, ownerWallet, owner, registry, PayGuardPolicyRegistryV2Abi, "revokePolicy", [binding.policyCommitment]);
    await expectSimulationRevert(() => client.simulateContract({ account: owner.address, address: registry, abi: PayGuardPolicyRegistryV2Abi, functionName: "resumePolicy", args: [binding.policyCommitment] }));

    stage = "test-fund cleanup";
    const withdrawAmount = accountingAfterExecution.available;
    const withdrawn = await writeContract(client, ownerWallet, owner, vault, PayGuardVaultAbi, "withdraw", [ftestXrp, withdrawAmount, owner.address]);
    const accountingAfterWithdrawal = accountingOf(await client.readContract({ address: vault, abi: PayGuardVaultAbi, functionName: "accounting", args: [owner.address, ftestXrp] }));
    const ownerTokenAfterWithdrawal = await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] });
    const tokenReturned = await writeContract(client, ownerWallet, owner, ftestXrp, erc20Abi, "transfer", [configured.account.address, ownerTokenAfterWithdrawal]);
    const gasReturned = await returnNativeGas(client, ownerWallet, owner, configured.account.address);
    if (await client.readContract({ address: ftestXrp, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }) !== 0n) throw new Error("test token cleanup failed");

    stage = "public-safe evidence write";
    const evidence = buildMultiOwnerEvidence({
      sourceCommit,
      relayOrigin: options.relayOrigin,
      observedBlock: gasReturned.blockNumber,
      sourceAccount: configured.account.address,
      policyOwner: owner.address,
      policyCommitment: binding.policyCommitment,
      funding: { gas: gasFundingHash, token: tokenFundingResult.transaction },
      custodyFreeze: context.freeze.policyFreezeTransaction,
      allow: { ...allowed, create: created.transaction, execute: executed.transaction },
      governance: { stop: stopped.transaction, resume: resumed.transaction, revoke: revoked.transaction },
      cleanup: { withdraw: withdrawn.transaction, tokenReturn: tokenReturned.transaction, gasReturn: gasReturned.transaction },
      accounting: { before: accountingBefore, afterExecution: accountingAfterExecution, afterWithdrawal: accountingAfterWithdrawal },
    });
    await writeEvidence(evidence);
    await unlink(recoveryPath);
    console.log(JSON.stringify({
      status: evidence.status,
      relayOrigin: options.relayOrigin,
      independentPolicyOwner: owner.address,
      policyCommitment: binding.policyCommitment,
      requestId: request.requestId,
      finalBlock: gasReturned.blockNumber.toString(),
      evidencePath,
      recoveryFileRemoved: true,
      privateMaterialRecorded: false,
    }, null, 2));
  } catch (error) {
    void error;
    throw new Error(`multi-owner lifecycle failed closed at ${stage}; ephemeral recovery remains at ${recoveryPath}`);
  }
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

async function persistRecovery(key: Hex, address: Address): Promise<void> {
  await mkdir(recoveryDirectory, { recursive: true });
  await writeFile(recoveryPath, `# Temporary Coston2 multi-owner recovery only. Never commit.\nPAYGUARD_EPHEMERAL_OWNER_ADDRESS=${address}\nPAYGUARD_EPHEMERAL_OWNER_PRIVATE_KEY=${key}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function loadOrCreateEphemeralOwner(): Promise<PrivateKeyAccount> {
  try {
    const body = await readFile(recoveryPath, "utf8");
    const addressMatch = body.match(/^PAYGUARD_EPHEMERAL_OWNER_ADDRESS=(0x[0-9a-fA-F]{40})$/m);
    const keyMatch = body.match(/^PAYGUARD_EPHEMERAL_OWNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m);
    if (!addressMatch || !keyMatch || !isAddress(addressMatch[1])) throw new Error("recovery file is malformed");
    const account = privateKeyToAccount(keyMatch[1] as Hex);
    if (account.address !== getAddress(addressMatch[1])) throw new Error("recovery owner mismatch");
    return account;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("ephemeral recovery file is unavailable");
  }
  const key = `0x${randomBytes(32).toString("hex")}` as Hex;
  const account = privateKeyToAccount(key);
  await persistRecovery(key, account.address);
  return account;
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
  claimedOwner: Address,
  signer: PrivateKeyAccount,
  digestUsesSigner: boolean,
): Promise<void> {
  const issuedAt = BigInt(Math.floor(Date.now() / 1_000));
  const expiry = issuedAt + 240n;
  const digestOwner = digestUsesSigner ? signer.address : claimedOwner;
  const signature = await signer.signMessage({ message: { raw: liveEvaluationAuthorizationDigest({ requestId, owner: digestOwner, issuedAt, expiry }) } });
  const response = await fetch(`${relayOrigin}/v1/requests/${requestId}/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-payguard-owner": claimedOwner,
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
  owner: PrivateKeyAccount,
  recipient: Address,
): Promise<WriteResult> {
  const [balance, gasPrice] = await Promise.all([client.getBalance({ address: owner.address }), client.getGasPrice()]);
  const gas = 21_000n;
  const fee = gas * gasPrice;
  if (balance <= fee) throw new Error("ephemeral owner has insufficient gas to return its remainder");
  const transaction = await wallet.sendTransaction({ account: owner, chain: wallet.chain, to: recipient, value: balance - fee, gas, gasPrice });
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
