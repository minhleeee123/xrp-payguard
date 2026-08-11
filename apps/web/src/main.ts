import "./styles.css";
import "./studio.css";
import {
  unavailableAuditState,
  unavailablePolicyCustodyState,
  unavailableNotificationState,
  unavailablePayeeState,
  unavailableRequestState,
  unavailableWorkspaceState,
  buildPublicNotificationExport,
  buildUnavailableNotificationExport,
  encodePublicNotificationExport,
  type PublicAuditReadState,
  type PublicPolicyCustodyReadState,
  type PublicNotificationReadState,
  type PublicPayeeReadState,
  type PublicRequestReadState,
  type PublicRequestSnapshotV1,
  type PublicWorkspaceReadState,
} from "@xrp-payguard/integrations";
import { formatEther, formatUnits, type Address } from "viem";
import {
  STUDIO_TEMPLATES,
  StudioValidationError,
  compileStudioDraft,
  createStudioEntropy,
  studioTemplateDraft,
  type PreviewItem,
  type StudioCompilation,
  type StudioDraft,
  type StudioIssue,
  type StudioTemplateId,
} from "./model.js";
import { fetchPublicWebEvidenceIndex, type PublicWebEvidenceIndex } from "./web-evidence.js";
import { fetchSimulatedLifecycleEvidence, type SimulatedLifecycleEvidence } from "./demo-evidence.js";
import { landingView } from "./landing.js";
import { appViewHash, durationHint, parseAppRoute, requestStateLabels, unixTimeHint, type View } from "./ui-state.js";
import {
  collectDemoCustody,
  collectDemoEvaluations,
  createDemoRequest,
  executeDemoRequest,
  executeDemoVaultAction,
  fetchInteractiveDemoConfig,
  governDemoPolicy,
  loadDemoAccount,
  registerDemoPolicy,
  submitDemoThreshold,
  type DemoAccountSnapshot,
  type DemoPolicyAction,
  type DemoPolicySession,
  type DemoRequestResult,
  type DemoThresholdResult,
  type DemoTransactionResult,
} from "./interactive-demo.js";
import type { DemoDomainConfig } from "@xrp-payguard/demo";
import {
  collectLiveCustody,
  createLiveRequest,
  evaluateLiveRequest,
  executeLiveRequest,
  fetchLiveFccConfig,
  governLivePolicy,
  loadLivePolicyStatus,
  registerLivePolicy,
  type LiveEvaluationResult,
  type LiveFccConfig,
  type LivePolicyAction,
  type LivePolicySession,
  type LiveRequestResult,
  type LiveTransactionResult,
} from "./live-fcc.js";
import {
  COSTON2_CHAIN,
  PAYGUARD_COSTON2,
  REVIEWED_PENDING_REQUEST_ID,
  RequestTransactionError,
  VaultTransactionError,
  WalletConnectionError,
  connectCoston2Wallet,
  coston2ReadFailureMessage,
  executeRequestTransaction,
  executeVaultTransaction,
  explorerAddress,
  explorerTransaction,
  injectedProvider,
  loadCoston2AccountSnapshot,
  loadCoston2PublicRequest,
  notificationStateFromRequest,
  parseFTestXrpAmount,
  readWalletSession,
  requestTransactionFailureMessage,
  validateRequestTransaction,
  validateVaultTransaction,
  vaultTransactionFailureMessage,
  walletFailureMessage,
  type Coston2AccountSnapshot,
  type RequestTransactionKind,
  type VaultTransactionKind,
} from "./coston2.js";

const COSTON2_FAUCET = "https://faucet.flare.network";
type PublicEvidenceMirrorState =
  | { status: "LOADING" }
  | { status: "READY"; index: PublicWebEvidenceIndex }
  | { status: "UNAVAILABLE"; reason: "NOT_PUBLISHED" | "INVALID" };
type DemoUiState = { status: "LOADING" } | { status: "READY"; evidence: SimulatedLifecycleEvidence } | { status: "UNAVAILABLE" };
type InteractiveConfigUiState = { status: "LOADING" } | { status: "READY"; config: DemoDomainConfig } | { status: "UNAVAILABLE" };
type LiveFccConfigUiState = { status: "LOADING" } | { status: "READY"; config: LiveFccConfig } | { status: "UNAVAILABLE" };
type WalletUiState =
  | { status: "DISCONNECTED" }
  | { status: "CONNECTING" }
  | { status: "CONNECTED"; account: Address }
  | { status: "WRONG_CHAIN"; account: Address; chainId: number }
  | { status: "ERROR"; message: string };
type Coston2UiState =
  | { status: "IDLE" }
  | { status: "LOADING" }
  | { status: "READY"; snapshot: Coston2AccountSnapshot }
  | { status: "UNAVAILABLE"; message: string };
type VaultTransactionUiState =
  | { status: "IDLE" }
  | { status: "SUBMITTING"; kind: VaultTransactionKind; amount: bigint }
  | { status: "SUCCESS"; kind: VaultTransactionKind; amount: bigint; hash: `0x${string}`; blockNumber: bigint }
  | { status: "ERROR"; message: string };
type RequestTransactionUiState =
  | { status: "IDLE" }
  | { status: "SUBMITTING"; kind: RequestTransactionKind }
  | { status: "SUCCESS"; kind: RequestTransactionKind; hash: `0x${string}`; blockNumber: bigint }
  | { status: "ERROR"; message: string };

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("PayGuard root missing");
const app = appElement;
const initialRoute = parseAppRoute(window.location.hash);

let activeView: View = initialRoute.surface === "app" ? initialRoute.view : "overview";
let studioNotice = "No policy data has left this browser tab.";
let studioDraft = studioTemplateDraft("personal-recurring");
let studioEntropy = createStudioEntropy();
let studioCompilation: StudioCompilation | null = null;
let studioIssues: readonly StudioIssue[] = [];
let appNotice = "";
let appNoticeTimer: number | undefined;
let requestState: PublicRequestReadState = unavailableRequestState();
let auditState: PublicAuditReadState = unavailableAuditState();
let custodyState: PublicPolicyCustodyReadState = unavailablePolicyCustodyState();
let payeeState: PublicPayeeReadState = unavailablePayeeState();
let workspaceState: PublicWorkspaceReadState = unavailableWorkspaceState();
let notificationState: PublicNotificationReadState = unavailableNotificationState();
let notificationOpen = false;
let mobileMenuOpen = false;
let landingOpen = initialRoute.surface === "landing";
let publicEvidenceMirrorState: PublicEvidenceMirrorState = { status: "LOADING" };
let demoState: DemoUiState = { status: "LOADING" };
let interactiveConfigState: InteractiveConfigUiState = { status: "LOADING" };
let interactiveSession: DemoPolicySession | null = null;
let interactivePolicyRegistration: DemoTransactionResult | null = null;
let interactiveAccountSnapshot: DemoAccountSnapshot | null = null;
let interactiveRequest: DemoRequestResult | null = null;
let interactiveThreshold: DemoThresholdResult | null = null;
let interactiveThresholdTransactions: DemoTransactionResult[] = [];
let interactiveExecution: DemoTransactionResult | null = null;
let interactiveBusy = "";
let interactiveNotice = "Connect a disposable Coston2 wallet, then prepare a simulation-only policy domain.";
let interactiveFundInput = "1";
let interactiveRequestAmountInput = "0.1";
let interactiveTransactions: { label: string; hash: `0x${string}`; blockNumber: bigint }[] = [];
let liveFccConfigState: LiveFccConfigUiState = { status: "LOADING" };
let liveFccSession: LivePolicySession | null = null;
let liveFccPolicyRegistration: LiveTransactionResult | null = null;
let liveFccPolicyStatus: number | null = null;
let liveFccRequest: LiveRequestResult | null = null;
let liveFccEvaluation: LiveEvaluationResult | null = null;
let liveFccExecution: LiveTransactionResult | null = null;
let liveFccBusy = "";
let liveFccNotice = "Checking the hosted relay and three registered Coston2 machines.";
let liveFccRequestAmountInput = "0.1";
let liveFccTransactions: { label: string; hash: `0x${string}`; blockNumber?: bigint }[] = [];
const walletProvider = injectedProvider();
let walletState: WalletUiState = { status: "DISCONNECTED" };
let coston2State: Coston2UiState = { status: "IDLE" };
let liveReadSequence = 0;
let vaultAmountInput = "1";
let vaultIntent: { kind: VaultTransactionKind; amount: bigint } | null = null;
let vaultTransactionState: VaultTransactionUiState = { status: "IDLE" };
let requestInput: string = REVIEWED_PENDING_REQUEST_ID;
let requestLoading = false;
let requestNotice = "Loading the reviewed Coston2 request from the finalized router…";
let requestFinalizedBlock: bigint | null = null;
let requestFinalizedAt: bigint | null = null;
let requestPolicyOwner: Address | null = null;
let requestReadSequence = 0;
let requestIntent: RequestTransactionKind | null = null;
let requestTransactionState: RequestTransactionUiState = { status: "IDLE" };

const esc = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
const short = (value: string): string => value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

function render(): void {
  if (landingOpen) {
    app.innerHTML = landingView();
    wireEvents();
    return;
  }
  app.innerHTML = `
    <div class="app-shell">
      <a class="skip-link" href="#app-main">Skip to main content</a>
      <aside class="sidebar">
        <button class="brand brand-link" type="button" data-action="landing" aria-label="Open PayGuard landing page"><span class="brand-mark">P</span><span>PayGuard</span><span class="brand-beta">TESTNET</span></button>
        <div class="workspace-label">${connectedAccount() ? "CONNECTED TESTNET WORKSPACE" : "PUBLIC TESTNET EXPLORER"}</div>
        <nav class="primary-nav" aria-label="Primary navigation">
          ${navItem("overview", "Overview", "⌂")}
          ${navItem("studio", "Policy Studio", "◈")}
          ${navItem("vaults", "Vaults", "▣")}
          ${navItem("requests", "Requests", "↗")}
          ${navItem("demo", "Demo lifecycle", "⌁")}
          ${navItem("payee", "Payee", "◍")}
          ${navItem("auditor", "Auditor", "◌")}
          ${navItem("team", "Team & roles", "♧")}
          <button class="nav-item mobile-more" type="button" data-action="mobile-menu" aria-expanded="${mobileMenuOpen}" aria-controls="mobile-secondary-nav"><span class="nav-icon">＋</span>More</button>
        </nav>
        ${mobileMenuOpen ? `<div class="mobile-secondary-nav" id="mobile-secondary-nav" aria-label="Secondary navigation">${navItem("demo", "Demo", "⌁")}${navItem("payee", "Payee", "◍")}${navItem("auditor", "Auditor", "◌")}${navItem("team", "Team & roles", "♧")}</div>` : ""}
        <div class="sidebar-bottom">
          ${sidebarNetworkCard()}
          <button class="help-link" type="button" data-action="landing">? <span>How PayGuard works</span></button>
          ${sidebarUserRow()}
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${label(activeView)}</strong></div><div class="top-actions">${headerBalances()}${networkChip()}<button class="icon-button" type="button" data-action="notifications" aria-label="Notifications" aria-expanded="${notificationOpen}">♢${notificationState.status === "READY" && notificationState.feed.notifications.length > 0 ? '<span class="notification-dot"></span>' : ""}</button><button class="outline-button wallet-button" type="button" data-action="connect">${walletButtonLabel()}</button></div></header>
        ${notificationOpen ? notificationTray() : ""}
        <section class="content" id="app-main" tabindex="-1">${viewContent()}</section>
        ${appNotice ? `<div class="toast" role="status"><span>${esc(appNotice)}</span><button type="button" data-action="dismiss-notice" aria-label="Dismiss notification">×</button></div>` : ""}
      </main>
    </div>`;
  wireEvents();
}

function navItem(view: View, text: string, icon: string): string {
  const requestCount = requestState.status === "UNAVAILABLE" ? "" : '<span class="nav-count">1</span>';
  return `<button class="nav-item nav-item-${view} ${activeView === view ? "active" : ""}" type="button" data-view="${view}"><span class="nav-icon">${icon}</span>${text}${view === "requests" ? requestCount : ""}</button>`;
}

function label(view: View): string { return ({ overview: "Overview", studio: "Policy Studio", vaults: "Vaults", requests: "Requests", demo: "Demo lifecycle", payee: "Payee", auditor: "Auditor", team: "Team & roles" })[view]; }

function connectedAccount(): Address | null {
  return walletState.status === "CONNECTED" || walletState.status === "WRONG_CHAIN" ? walletState.account : null;
}

function walletButtonLabel(): string {
  if (walletState.status === "CONNECTING") return "Connecting…";
  const account = connectedAccount();
  return account ? short(account) : "Connect wallet";
}

function networkChip(): string {
  if (coston2State.status === "READY") return `<span class="network-chip"><span class="status-dot green"></span>Coston2 <em>finalized #${coston2State.snapshot.finalizedBlock}</em></span>`;
  if (coston2State.status === "LOADING" || walletState.status === "CONNECTING") return `<span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>checking</em></span>`;
  if (coston2State.status === "UNAVAILABLE") return `<span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>read failed</em></span>`;
  if (walletState.status === "WRONG_CHAIN") return `<span class="network-chip"><span class="status-dot amber"></span>Wrong network <em>chain ${walletState.chainId}</em></span>`;
  return `<span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>not connected</em></span>`;
}

function headerBalances(): string {
  const live = liveSnapshot();
  return `<div class="header-balances" aria-label="Coston2 wallet balances"><span class="header-balance" title="FTestXRP wallet balance"><small>FTESTXRP</small><strong>${live ? token(live.tokenBalance) : "—"}</strong></span><span class="header-balance" title="C2FLR gas balance"><small>C2FLR</small><strong>${live ? nativeToken(live.nativeBalance) : "—"}</strong></span><a class="header-faucet" href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer" aria-label="Get Coston2 test tokens">FAUCET ↗</a></div>`;
}

function sidebarNetworkCard(): string {
  if (coston2State.status === "READY") return `<div class="security-card live-card"><span class="status-dot green"></span><div><strong>Verified Coston2 reads</strong><small>Runtime, wiring & asset checked</small></div></div>`;
  if (coston2State.status === "LOADING") return `<div class="security-card"><span class="status-dot amber"></span><div><strong>Checking Coston2</strong><small>Reading one finalized block</small></div></div>`;
  return `<div class="security-card"><span class="status-dot amber"></span><div><strong>Testnet dApp</strong><small>FCC authorization remains simulated</small></div></div>`;
}

function sidebarUserRow(): string {
  const account = connectedAccount();
  const label = walletState.status === "WRONG_CHAIN" ? "Switch to Coston2" : account ? short(account) : "Wallet not connected";
  return `<div class="user-row"><div class="avatar">${account ? account.slice(2, 4).toUpperCase() : "—"}</div><div><strong>${account ? "Owner view" : "No active owner"}</strong><small>${esc(label)}</small></div></div>`;
}

function token(value: bigint): string {
  return displayUnits(formatUnits(value, 6), 6);
}

function utc(value: bigint): string {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return "—";
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function nativeToken(value: bigint): string {
  return displayUnits(formatEther(value), 4);
}

function displayUnits(value: string, maximumFractionDigits: number): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  const visibleFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return visibleFraction ? `${grouped}.${visibleFraction}` : grouped;
}

function liveSnapshot(): Coston2AccountSnapshot | null {
  return coston2State.status === "READY" ? coston2State.snapshot : null;
}

function viewContent(): string {
  if (activeView === "studio") return studioView();
  if (activeView === "vaults") return vaultsView();
  if (activeView === "requests") return requestsView();
  if (activeView === "demo") return demoView();
  if (activeView === "payee") return payeeView();
  if (activeView === "auditor") return auditorView();
  if (activeView === "team") return teamView();
  return overviewView();
}

function pageIntro(eyebrow: string, title: string, copy: string, action = ""): string {
  const actionLabels: Record<string, string> = { "new-policy": "Open Policy Studio" };
  return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${action ? `<button class="primary-button" type="button" data-action="${action}">${actionLabels[action] ?? action}</button>` : ""}</div>`;
}

function quickStartView(): string {
  const account = connectedAccount();
  const live = liveSnapshot();
  const request = requestState.status === "UNAVAILABLE" ? null : requestState;
  const reviewed = isReviewedRequestInput();
  return `<section class="panel quick-start" aria-labelledby="quick-start-title"><div class="panel-heading"><div><div class="eyebrow">FIRST-TIME TEST PATH</div><h2 id="quick-start-title">Try the product without guessing</h2></div><span class="state-tag gray-tag">COSTON2 ONLY</span></div><p class="panel-copy">Start with the wallet-free proof, then connect a disposable testnet wallet only when you want to move faucet tokens.</p><div class="quick-start-grid">
    <article><span class="quick-index">01</span><div><strong>Inspect the reviewed lifecycle</strong><small>No wallet. Review three simulated machines, ALLOW, DENY, governance, and 14 Coston2 transactions.</small></div><button class="text-button" type="button" data-view="demo">View lifecycle ↗</button></article>
    <article><span class="quick-index">02</span><div><strong>${account ? "Coston2 wallet connected" : "Prepare a testnet wallet"}</strong><small>${account ? `${esc(short(account))} · PayGuard never receives its private key.` : "Use an injected EVM wallet. Get C2FLR gas and FTestXRP only from the official faucet."}</small></div>${account ? `<button class="text-button" type="button" data-action="refresh">Verify again ↗</button>` : `<div class="quick-actions"><button class="text-button" type="button" data-action="connect">Connect ↗</button><a href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer">Official faucet ↗</a></div>`}</article>
    <article><span class="quick-index">03</span><div><strong>${live ? "Vault controls ready" : "Fund and inspect your vault"}</strong><small>${live ? `${token(live.tokenBalance)} FTestXRP in wallet · every write uses an exact two-step preview.` : "Approve, deposit, and withdraw are enabled only after finalized runtime, wiring, and accounting checks."}</small></div><button class="text-button" type="button" data-view="vaults">Open vault ↗</button></article>
    <article><span class="quick-index">04</span><div><strong>${request ? `${reviewed ? "Reviewed" : "Public"} request loaded` : "Verify a public request"}</strong><small>${request ? `On-chain ${request.status} · timing ${requestReadinessLabel(request.readiness)}.${reviewed ? " This public example is not your wallet activity." : " This is the public ID currently loaded in this tab."}` : "The reviewed request is prefilled. Reading it needs no wallet and reveals no private policy."}</small></div><button class="text-button" type="button" data-view="requests">Inspect request ↗</button></article>
  </div><div class="quick-boundary"><span>◈</span><p><strong>Policy activation is intentionally not a browser shortcut.</strong> Policy Studio computes an in-memory commitment; production activation still requires three registered FCC custody receipts.</p><button class="text-button" type="button" data-view="studio">Draft locally ↗</button></div></section>`;
}

function overviewView(): string {
  const live = liveSnapshot();
  const account = connectedAccount();
  const publicRequest = requestState.status === "UNAVAILABLE" ? null : requestState;
  const reviewed = isReviewedRequestInput();
  const notice = live
    ? `<div class="notice-banner live-notice"><span class="notice-icon">✓</span><div><strong>Finalized Coston2 account state verified</strong><span>Runtime bytecode, router/vault wiring, supported FTestXRP and conservation were checked together at block ${live.finalizedBlock}.</span></div><button type="button" data-action="refresh">Refresh</button></div>`
    : account
      ? `<div class="notice-banner"><span class="notice-icon">◉</span><div><strong>${coston2State.status === "LOADING" ? "Reading finalized Coston2 state" : "Finalized Coston2 state unavailable"}</strong><span>${coston2State.status === "UNAVAILABLE" ? esc(coston2State.message) : "The public account is connected; no balance is asserted until every live check passes."}</span></div><button type="button" data-action="refresh">Retry</button></div>`
      : `<div class="notice-banner"><span class="notice-icon">◉</span><div><strong>Connect a Coston2 wallet</strong><span>Wallet access enables public balance and vault reads. FCC policy authorization remains explicitly simulated.</span></div><button type="button" data-action="connect">Connect</button></div>`;
  return `${pageIntro("PERSONAL PAYGUARD", "Your testnet control center.", "Use real Coston2 account and vault state while private authorization remains separated from the browser.", "new-policy")}
    ${notice}
    ${quickStartView()}
    <div class="metric-grid"><div class="metric-card"><div class="metric-label">VAULT AVAILABLE <span class="public-pill">PUBLIC</span></div><div class="metric-value">${live ? token(live.accounting.available) : "—"} <small>FTestXRP</small></div><div class="metric-foot muted">${live ? `${token(live.tokenBalance)} in connected wallet` : account ? "Live verification unavailable" : "Connect wallet for finalized read"}</div></div><div class="metric-card"><div class="metric-label">RESERVED <span class="public-pill">PUBLIC</span></div><div class="metric-value">${live ? token(live.accounting.reserved) : "—"}</div><div class="metric-foot muted">${live ? "Verified vault accounting" : "Pending state unavailable"}</div></div><div class="metric-card"><div class="metric-label">${reviewed ? "REVIEWED REQUEST" : "LOADED REQUEST"} ${reviewed ? '<span class="sample-pill">EXAMPLE</span>' : '<span class="public-pill">PUBLIC</span>'}</div><div class="metric-value metric-state">${publicRequest ? esc(publicRequest.status) : "—"}</div><div class="metric-foot muted">${publicRequest ? `Timing: ${requestReadinessLabel(publicRequest.readiness)} · ${short(publicRequest.snapshot.requestId)}` : "Finalized request unavailable"}</div></div><div class="metric-card"><div class="metric-label">C2FLR GAS</div><div class="metric-value">${live ? nativeToken(live.nativeBalance) : "—"}</div><div class="metric-foot"><span class="status-dot ${live ? "green" : "amber"}"></span> ${account ? "Wallet connected" : "Wallet not connected"}</div></div><div class="metric-card accent-card"><div class="metric-label">FINALIZED BLOCK</div><div class="metric-value">${live?.finalizedBlock ?? requestFinalizedBlock ?? "—"}</div><div class="metric-foot muted">${live || publicRequest ? "Public reads are pinned to finality" : "No public checkpoint loaded"}</div></div></div>
    <div class="section-grid"><section class="panel activity-panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC ACCOUNT</div><h2>${live ? "Coston2 wallet ready" : account ? "Wallet connected · reads blocked" : "Connect without sharing a key"}</h2></div><button class="text-button" type="button" data-view="vaults">Open vault ↗</button></div>${live ? `<div class="live-account-summary"><div><span>ACCOUNT</span><strong class="mono-value">${esc(live.account)}</strong></div><div><span>FTESTXRP ALLOWANCE</span><strong>${token(live.vaultAllowance)}</strong></div><div><span>ASSET</span><strong>${live.token.symbol} · ${live.token.decimals} decimals</strong></div></div><a class="outline-button inline-link" href="${explorerAddress(live.account)}" target="_blank" rel="noreferrer">Open account explorer ↗</a>` : `<div class="empty-state"><div class="empty-orbit">◌</div><strong>${account ? "No unverified balance displayed" : "No wallet permission yet"}</strong><span>${account ? "Retry the finalized Coston2 checks before trusting any account or vault value." : "PayGuard asks only for the public account. Signing stays inside the injected wallet."}</span><button class="outline-button" type="button" data-action="${account ? "refresh" : "connect"}">${account ? "Retry finalized reads" : "Connect Coston2 wallet"}</button></div>`}</section><section class="panel health-panel"><div class="panel-heading"><div><div class="eyebrow">DEPENDENCY HEALTH</div><h2>Trust surface</h2></div><span class="health-label"><span class="status-dot ${live ? "green" : "amber"}"></span>${live ? "Public live" : "Limited"}</span></div><ul class="health-list"><li><span class="health-icon gray">▣</span><div><strong>PayGuard contracts</strong><small>${live ? "Runtime and wiring verified" : "Waiting for finalized RPC read"}</small></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "VERIFIED" : "WAITING"}</span></li><li><span class="health-icon gray">X</span><div><strong>FTestXRP asset</strong><small>${live ? "Supported asset metadata verified" : "Waiting for account read"}</small></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "VERIFIED" : "WAITING"}</span></li><li><span class="health-icon gray">◇</span><div><strong>FCC machine quorum</strong><small>Registered production machines unavailable</small></div><span class="state-tag gray-tag">SIMULATED</span></li><li><span class="health-icon gray">◈</span><div><strong>FDC/FAssets evidence</strong><small>Reviewed static Coston2 observations</small></div><span class="state-tag gray-tag">EVIDENCE</span></li></ul></section></div>`;
}

function studioView(): string {
  return `${pageIntro("PRIVATE POLICY STUDIO", "Create a payment policy", "Define what can happen in private. Only the commitment, receipts, and public request domain leave this tab.")}
    <div class="template-grid" aria-label="Policy templates">${STUDIO_TEMPLATES.map((template) => `<button class="template-card ${studioDraft.templateId === template.id ? "selected" : ""}" type="button" data-template="${template.id}" aria-pressed="${studioDraft.templateId === template.id}"><strong>${esc(template.name)}</strong><span>${esc(template.summary)}</span></button>`).join("")}</div>
    <div class="studio-layout"><form class="panel studio-form" id="studio-form" novalidate><div class="form-header"><div><h2>Policy rules</h2><p>Version 1 · values stay in this tab until registered FCC ingress exists.</p></div><span class="version-chip">POLICY_SCHEMA_V1</span></div>
      ${studioIssues.length > 0 ? `<div class="validation-summary" role="alert"><strong>Fix ${studioIssues.length} field${studioIssues.length === 1 ? "" : "s"} before computing</strong><span>${esc(studioIssues[0]?.message ?? "Policy draft is invalid.")}</span></div>` : ""}
      ${studioField("policyName", "Policy name", "A local label; the canonical policy ID is derived from it.", "text")}
      <div class="two-col">${studioField("owner", "Owner address", "Public at activation.", "text")}${studioField("target", "Allowed target", "Private rule; public only in a request.", "text")}</div>
      <div class="two-col">${studioField("maxPerAction", "Maximum per action", "Private · public base units only when requested.", "numeric")}${studioField("dailyCap", "Daily cap", "Private rolling/calendar policy input.", "numeric")}</div>
      <div class="two-col">${studioField("startAt", "Starts at (Unix time, UTC)", "Private policy window.", "numeric")}${studioField("endAt", "Ends at (Unix time, UTC)", "Private policy window.", "numeric")}</div>
      <div class="three-col">${studioField("scheduleIntervalSeconds", "Interval (seconds)", "0 selects ad-hoc mode.", "numeric")}${studioField("scheduleGraceSeconds", "Grace (seconds)", "0 only in ad-hoc mode.", "numeric")}${studioField("maxOccurrences", "Occurrence limit", "0 means no policy-specific limit.", "numeric")}</div>
      <details class="domain-details"><summary>Exact public contract domain <span>local example · not verified</span></summary><p>These values bind the commitment. Replace them only with addresses resolved from a future verified PayGuard release.</p><div class="two-col">${studioField("registry", "Policy registry", "Public domain field.", "text")}${studioField("vault", "Vault", "Public domain field.", "text")}${studioField("router", "Action router", "Public domain field.", "text")}${studioField("asset", "Supported asset", "Public token address.", "text")}</div></details>
      <div class="form-divider"></div><div class="private-row"><span class="lock-icon">▣</span><div><strong>Confidential draft only</strong><small>The target rule, caps, schedule and fresh cryptographic salt/nonce remain in memory. No browser storage, logs, analytics, public calldata or evidence receives them.</small></div><span class="state-tag gray-tag">IN MEMORY</span></div><div class="form-actions"><span class="form-note" id="studio-notice">${esc(studioNotice)}</span><button class="primary-button" type="submit">Validate & compute ↗</button></div></form>
      <aside class="studio-side">${studioPreview()}${studioCustodyPanel()}${interactiveStudioPanel()}<section class="privacy-note"><span>✦</span><div><strong>Refresh discards the draft</strong><p>Policy plaintext and ciphertext are never placed in browser persistence. A refresh intentionally cannot recover this draft.</p></div></section></aside></div>`;
}

function interactiveStudioPanel(): string {
  const account = connectedAccount();
  if (interactiveConfigState.status === "LOADING") return `<section class="panel receipt-card interactive-studio-card"><div class="eyebrow">INTERACTIVE TESTNET DEMO</div><h3>Loading isolated demo domain…</h3><p class="panel-copy">No production FCC availability is inferred.</p></section>`;
  if (interactiveConfigState.status === "UNAVAILABLE") return `<section class="panel receipt-card interactive-studio-card"><div class="eyebrow">INTERACTIVE TESTNET DEMO</div><h3>Serverless actors unavailable</h3><div class="activation-block"><span class="status-dot amber"></span><div><strong>No fallback approval</strong><small>The production FCC panel remains blocked independently.</small></div></div></section>`;
  const config = interactiveConfigState.config;
  const exactDomain = studioCompilation
    && studioCompilation.policy.registry.toLowerCase() === config.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === config.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === config.router.toLowerCase()
    && studioCompilation.policy.asset.toLowerCase() === config.asset.toLowerCase()
    && account && studioCompilation.policy.owner.toLowerCase() === account.toLowerCase();
  const rows = interactiveSession
    ? interactiveSession.custody.map((envelope) => `<div class="receipt-row demo-receipt-row"><span class="machine-index">0${envelope.actor}</span><div><strong>${esc(short(envelope.receipt.machineId))}</strong><small>Signed simulation receipt · ${esc(short(envelope.digest))}</small></div><span class="state-tag gray-tag">SIMULATED</span></div>`).join("")
    : config.actors.map((actor) => `<div class="receipt-row demo-receipt-row"><span class="machine-index">0${actor.actor}</span><div><strong>${esc(short(actor.machineId))}</strong><small>Distinct serverless actor · not a TEE</small></div><span class="state-tag gray-tag">READY</span></div>`).join("");
  const action = !account
    ? `<button class="outline-button" type="button" data-action="connect">Connect Coston2 wallet</button>`
    : !exactDomain
      ? `<button class="outline-button" type="button" data-action="prepare-interactive-draft">Use isolated demo domain</button>`
      : !interactiveSession
        ? `<button class="primary-button" type="button" data-action="collect-demo-custody" ${interactiveBusy ? "disabled" : ""}>${interactiveBusy === "CUSTODY" ? "Signing & contacting 3 actors…" : "Collect 3 simulated receipts"}</button>`
        : !interactivePolicyRegistration
          ? `<button class="primary-button" type="button" data-action="register-demo-policy" ${interactiveBusy ? "disabled" : ""}>${interactiveBusy === "REGISTER" ? "Waiting for wallet / finality…" : "Register in demo contracts"}</button>`
          : `<button class="outline-button" type="button" data-view="demo">Open interactive lifecycle ↗</button>`;
  return `<section class="panel receipt-card interactive-studio-card"><div class="eyebrow">INTERACTIVE TESTNET DEMO</div><h3>Separate simulation namespace</h3><span class="state-tag gray-tag">SIMULATED FCC · NOT PRODUCTION TEE</span><p class="panel-copy">Three actor signatures exercise the protocol on Coston2. They share one Vercel operator and do not count as production custody.</p>${rows}<div class="activation-block"><span class="status-dot ${interactivePolicyRegistration ? "green" : "amber"}"></span><div><strong>${interactivePolicyRegistration ? "Demo policy registered" : interactiveSession ? "3 / 3 simulated receipts checked" : "Production activation remains blocked"}</strong><small>${interactivePolicyRegistration ? `Coston2 block ${interactivePolicyRegistration.blockNumber}` : "Policy ciphertext and owner signatures stay memory-only; refresh discards them."}</small></div></div>${action}</section>`;
}

function studioCustodyPanel(): string {
  const account = connectedAccount();
  if (liveFccConfigState.status === "LOADING") return `<section class="panel receipt-card"><div class="eyebrow">LIVE FCC · COSTON2</div><h3>Verifying relay and three machines…</h3><p class="panel-copy">No readiness is asserted until the relay checks contracts, manager status, stable HTTPS origins, keys and code hash.</p></section>`;
  if (liveFccConfigState.status === "UNAVAILABLE") return `<section class="panel receipt-card"><div class="eyebrow">LIVE FCC · COSTON2</div><h3>Live path unavailable</h3><div class="activation-block"><span class="status-dot amber"></span><div><strong>Failed closed</strong><small>No local receipt or simulated browser decision replaces the hosted FCC path.</small></div></div></section>`;
  const config = liveFccConfigState.config;
  const exactDomain = studioCompilation
    && studioCompilation.policy.registry.toLowerCase() === config.contracts.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === config.contracts.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === config.contracts.router.toLowerCase()
    && studioCompilation.policy.asset.toLowerCase() === config.contracts.asset.toLowerCase()
    && studioCompilation.policy.owner.toLowerCase() === config.operator.toLowerCase();
  const operatorConnected = account?.toLowerCase() === config.operator.toLowerCase();
  const rows = liveFccSession
    ? liveFccSession.custody.map((receipt, index) => `<div class="receipt-row"><span class="machine-index">0${index + 1}</span><div><strong>${esc(short(receipt.receipt.machineId))}</strong><small>Registered machine receipt · ${esc(short(receipt.digest))}</small></div><span class="state-tag green-tag">SIGNED</span></div>`).join("")
    : config.machines.map((machine) => `<div class="receipt-row"><span class="machine-index">0${machine.index}</span><div><strong>${esc(short(machine.teeId))}</strong><small>Status 2 · ${esc(short(machine.codeHash))}</small></div><span class="state-tag green-tag">PRODUCTION SET</span></div>`).join("");
  const action = !account
    ? `<button class="outline-button" type="button" data-action="connect">Connect operator wallet</button>`
    : !operatorConnected
      ? `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Operator wallet required for V1</strong><small>Expected ${esc(short(config.operator))}. The open public demo remains available below.</small></div></div>`
      : !exactDomain
        ? `<button class="outline-button" type="button" data-action="prepare-live-draft">Use live V1 domain</button>`
        : !liveFccSession
          ? `<button class="primary-button" type="button" data-action="collect-live-custody" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "CUSTODY" ? "Signing & contacting A/B/D…" : "Collect 3 live FCC receipts"}</button>`
          : !liveFccPolicyRegistration
            ? `<button class="primary-button" type="button" data-action="register-live-policy" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "REGISTER" ? "Waiting for finality…" : "Register live policy on Coston2"}</button>`
            : `<button class="outline-button" type="button" data-view="demo">Continue live lifecycle ↗</button>`;
  return `<section class="panel receipt-card"><div class="eyebrow">LIVE FCC · COSTON2 V1</div><h3>Three registered machines</h3><span class="state-tag gray-tag">SIMULATED TEE · NOT HARDWARE / V2 RELEASE</span><p class="panel-copy">The hosted ciphertext-only relay reaches A/B/D. Each machine owns a distinct registered identity and signs its own custody receipt.</p>${rows}<div class="activation-block"><span class="status-dot ${liveFccPolicyRegistration ? "green" : "amber"}"></span><div><strong>${liveFccPolicyRegistration ? "Live V1 policy active" : liveFccSession ? "3 / 3 receipts verified in memory" : "Machines verified; policy not yet registered"}</strong><small>${liveFccPolicyRegistration ? `Coston2 block ${liveFccPolicyRegistration.blockNumber}` : "Private policy, ciphertexts and signatures are discarded on refresh."}</small></div></div>${action}<small class="panel-copy">${esc(liveFccNotice)}</small></section>`;
}

function custodyUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    CUSTODY_UNFINALIZED: "Custody receipts are not finalized",
    CUSTODY_INVALID: "Custody receipt bundle failed validation",
  } as Record<string, string>)[reason] ?? "Custody receipts unavailable";
}

function studioField(field: Exclude<keyof StudioDraft, "templateId">, labelText: string, hint: string, inputMode: "text" | "numeric"): string {
  const issue = studioIssues.find((candidate) => candidate.field === field);
  const hintId = `studio-hint-${field}`;
  return `<label class="studio-field ${issue ? "field-error" : ""}">${esc(labelText)}<input name="${field}" value="${esc(studioDraft[field])}" ${inputMode === "numeric" ? 'inputmode="numeric"' : 'spellcheck="false"'} autocomplete="off" aria-invalid="${Boolean(issue)}" aria-describedby="${hintId}" />${issue ? `<span class="field-message" id="${hintId}">${esc(issue.message)}</span>` : `<small id="${hintId}" data-studio-hint="${field}" data-base-hint="${esc(hint)}">${esc(studioHumanHint(field, studioDraft[field], hint))}</small>`}</label>`;
}

function studioHumanHint(field: Exclude<keyof StudioDraft, "templateId">, value: string, baseHint: string): string {
  if (field === "startAt" || field === "endAt") {
    const human = unixTimeHint(value);
    return human ? `${baseHint} ${human}.` : `${baseHint} Enter an unsigned Unix timestamp.`;
  }
  if (field === "scheduleIntervalSeconds" || field === "scheduleGraceSeconds") {
    const human = durationHint(value);
    return human ? `${baseHint} Current value: ${human}.` : `${baseHint} Enter unsigned seconds.`;
  }
  return baseHint;
}

function updateStudioHumanHints(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>("[data-studio-hint]").forEach((element) => {
    const field = element.dataset.studioHint as Exclude<keyof StudioDraft, "templateId">;
    const input = form.elements.namedItem(field);
    if (!(input instanceof HTMLInputElement)) return;
    element.textContent = studioHumanHint(field, input.value.trim(), element.dataset.baseHint ?? "");
  });
}

function studioPreview(): string {
  const commitment = studioCompilation?.publicEvidence.policyCommitment ?? "Not computed";
  const demoDomain = studioCompilation && interactiveConfigState.status === "READY"
    && studioCompilation.policy.registry.toLowerCase() === interactiveConfigState.config.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === interactiveConfigState.config.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === interactiveConfigState.config.router.toLowerCase();
  return `<section class="panel commitment-card"><div class="eyebrow">DOMAIN-BOUND COMMITMENT</div><div class="commitment-value" id="commitment-value">${esc(commitment)}</div><small>${studioCompilation ? "Validated locally · not registered" : "Validate the in-memory draft to compute"}</small><div class="commitment-state"><span class="status-dot ${demoDomain ? "green" : "amber"}"></span> ${demoDomain ? "Simulation contract domain loaded · not production" : "Production Coston2 release remains unverified"}</div></section>
    <section class="panel boundary-card"><div class="eyebrow">EXACT DATA MAP</div><h3>Public versus private</h3>${studioCompilation ? `${previewGroup("Public at activation", studioCompilation.publicAtActivation, "public")} ${previewGroup("Public at request", studioCompilation.publicAtRequest, "request")} ${previewGroup("Private in FCC", studioCompilation.privateInFcc, "private")}` : `<p class="boundary-empty">Compute the draft to inspect every policy field by when and where it becomes visible.</p>`}</section>`;
}

function previewGroup(title: string, items: readonly PreviewItem[], kind: "public" | "request" | "private"): string {
  return `<details class="preview-group" ${kind === "public" ? "open" : ""}><summary><span class="visibility-dot ${kind}"></span>${esc(title)} <b>${items.length}</b></summary><dl>${items.map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join("")}</dl></details>`;
}

function vaultsView(): string {
  const live = liveSnapshot();
  const account = connectedAccount();
  return `${pageIntro("PUBLIC ASSET VAULTS", "Your Coston2 vault", "Read one finalized public checkpoint before approving, depositing, or withdrawing test tokens.")}
    <div class="vault-card panel"><div class="vault-card-top"><div class="token-symbol">X</div><div><h2>FTestXRP vault</h2><span class="muted">${account ? esc(short(account)) : "Public asset · Coston2"}</span></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "LIVE READ" : account ? "READ BLOCKED" : "CONNECT"}</span></div><div class="vault-balance"><span>Available in vault</span><strong>${live ? token(live.accounting.available) : "—"} <small>FTestXRP</small></strong><span class="muted">${live ? `Finalized block ${live.finalizedBlock}` : account ? "Live verification must pass before balances appear" : "Connect an injected wallet to read account state"}</span></div><div class="vault-stats"><div><span>Deposited</span><strong>${live ? token(live.accounting.deposited) : "—"}</strong></div><div><span>Reserved</span><strong>${live ? token(live.accounting.reserved) : "—"}</strong></div><div><span>Spent</span><strong>${live ? token(live.accounting.spent) : "—"}</strong></div><div><span>Withdrawn</span><strong>${live ? token(live.accounting.withdrawn) : "—"}</strong></div></div><div class="vault-public-state"><div><span>Conservation</span><strong>${live ? "Verified at finalized block" : "Waiting for Coston2"}</strong></div><div><span>Wallet balance</span><strong>${live ? `${token(live.tokenBalance)} FTestXRP` : "—"}</strong></div><div><span>Vault allowance</span><strong>${live ? `${token(live.vaultAllowance)} FTestXRP` : "—"}</strong></div><div><span>Contract runtime</span><strong>${live ? "Verified against deployment evidence" : "—"}</strong></div></div><div class="vault-actions"><button class="primary-button" type="button" data-action="${account ? "refresh" : "connect"}">${live ? "Refresh finalized state" : account ? "Retry finalized reads" : "Connect Coston2 wallet"}</button>${live ? `<a class="outline-button inline-link" href="${explorerAddress(PAYGUARD_COSTON2.vault)}" target="_blank" rel="noreferrer">Vault explorer ↗</a>` : `<a class="outline-button inline-link" href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer">Get test tokens ↗</a>`}</div></div>${vaultTransactionPanel(live, account)}<div class="section-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">EVM TESTNET PATH</div><h2>Wallet → PayGuardVault</h2></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "TRANSACTIONS READY" : account ? "READ BLOCKED" : "CONNECT"}</span></div><div class="step-list"><div class="step-row"><span class="step-number">01</span><div><strong>Verify Coston2 and deployment</strong><small>Chain 114, finalized block, runtime hashes and wiring</small></div></div><div class="step-row"><span class="step-number">02</span><div><strong>Approve exact FTestXRP amount</strong><small>Wallet confirmation required; no private key enters PayGuard</small></div></div><div class="step-row"><span class="step-number">03</span><div><strong>Deposit or withdraw</strong><small>Receipt event and finalized postcondition must match exactly</small></div></div></div><p class="panel-copy phase-note">Only testnet FTestXRP is supported. The official Coston2 faucet currently supplies both C2FLR gas and FTestXRP; FCC authorization remains separate from these public vault controls.</p></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">XRPL-NATIVE PATH</div><h2>XRPL → FDC → Flare</h2></div><span class="state-tag gray-tag">EVIDENCE</span></div><p class="panel-copy">The flagship Smart Account funding path has a reviewed public observation. Interactive XRPL signing remains separate from this EVM recovery/developer path.</p><a class="text-button inline-link" href="/evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json" target="_blank" rel="noreferrer">Open funding evidence ↗</a></section></div>`;
}

function vaultTransactionPanel(live: Coston2AccountSnapshot | null, account: Address | null): string {
  const busy = vaultTransactionState.status === "SUBMITTING";
  const intentCopy = vaultIntent ? ({
    APPROVE: `Set the PayGuardVault allowance to exactly ${token(vaultIntent.amount)} FTestXRP. This replaces the current allowance.`,
    DEPOSIT: `Transfer exactly ${token(vaultIntent.amount)} FTestXRP from the wallet into this account's PayGuard vault.`,
    WITHDRAW: `Withdraw exactly ${token(vaultIntent.amount)} FTestXRP from the vault back to the connected wallet.`,
  })[vaultIntent.kind] : "";
  const result = vaultTransactionState.status === "SUCCESS"
    ? `<div class="transaction-result success-result"><span class="status-dot green"></span><div><strong>${vaultTransactionState.kind} finalized</strong><small>${token(vaultTransactionState.amount)} FTestXRP · block ${vaultTransactionState.blockNumber}</small><a href="${explorerTransaction(vaultTransactionState.hash)}" target="_blank" rel="noreferrer">Open transaction ↗</a></div></div>`
    : vaultTransactionState.status === "ERROR"
      ? `<div class="transaction-result error-result"><span class="status-dot amber"></span><div><strong>Transaction not verified</strong><small>${esc(vaultTransactionState.message)}</small></div></div>`
      : "";
  const review = vaultIntent
    ? `<div class="transaction-review"><div class="eyebrow">EXACT WALLET PREVIEW</div><h3>${vaultIntent.kind} · ${token(vaultIntent.amount)} FTestXRP</h3><p>${intentCopy}</p><dl><div><dt>Network</dt><dd>Coston2 · chain 114</dd></div><div><dt>Account</dt><dd>${account ? esc(account) : "—"}</dd></div><div><dt>Contract</dt><dd>${vaultIntent.kind === "APPROVE" ? PAYGUARD_COSTON2.asset : PAYGUARD_COSTON2.vault}</dd></div><div><dt>Success gate</dt><dd>Receipt + exact event + finalized postcondition</dd></div></dl><div class="transaction-warning">Testnet only. Confirm the same account, amount and contract in your wallet.</div><div class="vault-actions"><button class="outline-button" type="button" data-action="cancel-vault-intent" ${busy ? "disabled" : ""}>Cancel</button><button class="primary-button" type="button" data-action="submit-vault-intent" ${busy ? "disabled" : ""}>${busy ? "Waiting for wallet / finality…" : "Confirm in wallet"}</button></div></div>`
    : "";
  return `<section class="panel vault-transaction-panel"><div class="panel-heading"><div><div class="eyebrow">LIVE TEST-TOKEN CONTROLS</div><h2>Approve, deposit or withdraw</h2></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "COSTON2 LIVE" : "READ REQUIRED"}</span></div><p class="panel-copy">Enter an exact FTestXRP amount. Preparing an action does not open the wallet; the second confirmation does.</p><label class="transaction-amount">Amount in FTestXRP<input id="vault-amount" value="${esc(vaultAmountInput)}" inputmode="decimal" autocomplete="off" placeholder="1.000000" ${!live || busy ? "disabled" : ""} /><small>${live ? `Wallet ${token(live.tokenBalance)} · allowance ${token(live.vaultAllowance)} · vault available ${token(live.accounting.available)}` : "Connect and pass finalized checks first."}</small></label><div class="transaction-actions"><button class="outline-button" type="button" data-vault-kind="APPROVE" ${!live || busy ? "disabled" : ""}>Prepare exact approval</button><button class="primary-button" type="button" data-vault-kind="DEPOSIT" ${!live || busy ? "disabled" : ""}>Prepare deposit</button><button class="outline-button" type="button" data-vault-kind="WITHDRAW" ${!live || busy ? "disabled" : ""}>Prepare withdrawal</button></div>${review}${result}</section>`;
}

function requestsView(): string {
  const snapshot = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const unavailableReason = requestState.status === "UNAVAILABLE" ? requestUnavailableReason(requestState.reason) : "Finalized public request";
  const liveReadiness = requestState.status === "UNAVAILABLE" ? undefined : requestState.readiness;
  const readiness = snapshot && liveReadiness ? requestReadinessLabel(liveReadiness) : "UNAVAILABLE";
  const stateLabels = snapshot && liveReadiness ? requestStateLabels(snapshot.status, liveReadiness) : undefined;
  const requestCell = snapshot ? `<strong>${esc(short(snapshot.requestId))}</strong><small>Occurrence ${snapshot.occurrence} · nonce ${snapshot.requestNonce}</small>` : `<strong>—</strong><small>No verified request ID</small>`;
  const actionCell = snapshot ? `<strong>${esc(short(snapshot.target))}</strong><small>${token(snapshot.amount)} FTestXRP · public transfer</small>` : `<strong>—</strong><small>Target and amount unavailable</small>`;
  const checkpointCell = snapshot ? `<strong>${esc(short(snapshot.spendCheckpoint))}</strong><small>${snapshot.scheduleSlot > 0n ? `Slot ${snapshot.scheduleSlot}` : "Ad-hoc"} · expires ${utc(snapshot.expiry)}</small>` : `<strong>—</strong><small>Waiting for RPC</small>`;
  const publicState = snapshot
    ? `<div class="request-public-state"><div><span>On-chain state</span><strong>${stateLabels?.canonical}</strong></div><div><span>Time readiness</span><strong>${stateLabels?.timing}${stateLabels?.needsExpiryFinalization ? " · finalize expiry on-chain" : ""}</strong></div><div><span>Decision evidence</span><strong>${snapshot.decision === "PENDING" ? "Waiting for threshold" : snapshot.decision === "ALLOW" ? "Threshold ALLOW · public" : `DENY · ${snapshot.publicReasonClass ?? "UNKNOWN"}`}</strong></div><div><span>Checkpoint</span><strong class="mono-value">${esc(short(snapshot.requestHash))}</strong></div></div>`
    : `<div class="request-public-state"><div><span>On-chain state</span><strong>Unavailable</strong></div><div><span>Time readiness</span><strong>Unavailable</strong></div><div><span>Decision evidence</span><strong>No chain result</strong></div><div><span>Checkpoint</span><strong>—</strong></div></div>`;
  return `${pageIntro("PUBLIC REQUEST INSPECTOR", "Inspect a request", "Load any canonical request directly from the finalized Coston2 router. On-chain state and time-derived readiness are shown separately.")}
    ${requestLookup()}
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACTION REQUEST</div><h2>${snapshot ? "Public request state" : requestLoading ? "Reading finalized state…" : "No verified request loaded"}</h2></div><div class="table-tools"><button class="icon-button" type="button" data-action="load-request" aria-label="Refresh request">↻</button></div></div><div class="request-table"><div class="table-head"><span>REQUEST</span><span>PUBLIC ACTION</span><span>CHECKPOINT</span><span>ON-CHAIN STATE</span><span></span></div><div class="table-row"><span>${requestCell}</span><span>${actionCell}</span><span>${checkpointCell}</span><span><span class="state-tag ${snapshot?.status === "ALLOWED" || snapshot?.status === "EXECUTED" ? "green-tag" : snapshot ? "gray-tag" : "amber-tag"}">${esc(snapshot?.status ?? "UNAVAILABLE")}</span><small>${snapshot ? `Timing: ${esc(readiness)}` : "No timing fact"}</small></span><span></span></div></div>${publicState}<div class="table-footer"><span>Showing public finalized state only</span><span class="muted">${requestFinalizedBlock ? `Coston2 block ${requestFinalizedBlock}` : esc(unavailableReason)} · no browser cache</span></div></section>${requestTransactionPanel(snapshot)}<div class="recovery-strip"><div class="recovery-icon">↻</div><div><strong>Fresh-process recovery is built in</strong><p>A relay restart reconstructs work from chain checkpoints, not a private policy database.</p></div><button class="text-button" type="button" data-view="demo">Inspect the recorded lifecycle ↗</button></div>`;
}

function requestLookup(): string {
  const reviewed = isReviewedRequestInput();
  return `<section class="panel request-lookup"><div><div class="eyebrow">FINALIZED ROUTER LOOKUP</div><h2>Inspect a request ID</h2><p class="panel-copy">${reviewed ? "The prefilled ID is a reviewed public XRPL/FDC-triggered Coston2 example. It is not activity from your connected wallet." : "This user-supplied ID is read only from finalized public Coston2 state. It is not inferred to belong to your connected wallet."}</p><span class="state-tag sample-context-tag">${reviewed ? "REVIEWED PUBLIC EXAMPLE" : "USER-SUPPLIED PUBLIC ID"}</span></div><label>Request ID<input id="request-id" value="${esc(requestInput)}" autocomplete="off" spellcheck="false" placeholder="0x…" /></label><button class="primary-button" type="button" data-action="load-request" ${requestLoading ? "disabled" : ""}>${requestLoading ? "Reading finalized block…" : "Load public state"}</button><small>${esc(requestNotice)}</small></section>`;
}

function isReviewedRequestInput(): boolean {
  return requestInput.trim().toLowerCase() === REVIEWED_PENDING_REQUEST_ID.toLowerCase();
}

function demoView(): string {
  return `${pageIntro("LIVE + REVIEWED TESTNET PATHS", "FCC lifecycle on Coston2", "The live operator path reaches three registered simulated-TEE machines. Reviewed evidence and the open simulation remain separate below.")}${liveFccDemoView()}${recordedDemoView()}${interactiveDemoView()}`;
}

function liveFccDemoView(): string {
  if (liveFccConfigState.status === "LOADING") return `${demoSectionIntro("LIVE FCC · COSTON2 V1", "Checking the hosted lifecycle", "The relay is validating contracts and all three registered machine identities.")}<section class="panel demo-loading"><div class="empty-orbit">◌</div><h2>Live preflight in progress…</h2></section>`;
  if (liveFccConfigState.status === "UNAVAILABLE") return `${demoSectionIntro("LIVE FCC · COSTON2 V1", "Hosted lifecycle unavailable", "The path fails closed; the reviewed public evidence below remains independently available.")}<section class="panel"><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No live success asserted</strong><small>The browser cannot substitute a decision, receipt, machine identity, or release claim.</small></div></div></section>`;
  const config = liveFccConfigState.config;
  const account = connectedAccount();
  const operatorConnected = account?.toLowerCase() === config.operator.toLowerCase();
  const snapshot = liveSnapshot();
  const policyActive = Boolean(liveFccPolicyRegistration && liveFccPolicyStatus === 1);
  const request = liveFccRequest?.request;
  const requestStatus = liveFccExecution ? "EXECUTED" : liveFccEvaluation?.routerStatus === 3 ? "DENIED" : liveFccEvaluation?.routerStatus === 2 ? "ALLOWED" : request ? "PENDING" : "NOT CREATED";
  const transactionRows = liveFccTransactions.length === 0
    ? `<div class="boundary-empty">No live wallet or relay transaction has been submitted from this tab.</div>`
    : `<ol class="interactive-transaction-list">${liveFccTransactions.map((item, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.label)}</strong><small>${item.blockNumber ? `Block ${item.blockNumber} · ` : "Relay broadcast · "}${esc(short(item.hash))}</small></div><a href="${explorerTransaction(item.hash)}" target="_blank" rel="noreferrer">↗</a></li>`).join("")}</ol>`;
  return `${demoSectionIntro("LIVE FCC · COSTON2 V1", "Run the registered three-machine lifecycle", "Operator-only V1 control plane: policy ciphertext goes independently to A/B/D; the relay reconstructs public state and submits two matching signed results.")}
    <div class="demo-boundary interactive-boundary"><span class="state-tag green-tag">3 REGISTERED MACHINES · STATUS 2</span><strong>Live Coston2 · ciphertext-only relay</strong><span>SIMULATED_TEE=true · not hardware attestation · not verified V2 release</span></div>
    <div class="demo-actor-mini">${config.machines.map((machine) => `<span>MACHINE ${machine.index} · ${esc(short(machine.teeId))} · PRODUCTION SET</span>`).join("")}</div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">01 · OPERATOR & VAULT</div><h2>${operatorConnected ? "V1 operator connected" : "Operator wallet required"}</h2></div><span class="state-tag ${operatorConnected ? "green-tag" : "amber-tag"}">${operatorConnected ? "AUTHORIZED" : "READ ONLY"}</span></div><p class="panel-copy">The dispatcher is owner-only in deployed V1, so sponsored live broadcasts require ${esc(short(config.operator))}. This restriction prevents public relay balance drain.</p>${operatorConnected ? `<div class="demo-account-grid"><div><span>C2FLR gas</span><strong>${snapshot ? nativeToken(snapshot.nativeBalance) : "—"}</strong></div><div><span>Vault available</span><strong>${snapshot ? token(snapshot.accounting.available) : "—"} FTestXRP</strong></div><div><span>Finalized block</span><strong>${snapshot?.finalizedBlock ?? "—"}</strong></div></div><div class="vault-actions"><button class="outline-button" type="button" data-action="refresh">Refresh</button><button class="primary-button" type="button" data-view="vaults">Fund V1 vault</button></div>` : `<div class="vault-actions"><button class="primary-button" type="button" data-action="connect">Connect wallet</button><button class="outline-button" type="button" data-view="auditor">Wallet-free audit</button></div>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">02 · PRIVATE CUSTODY</div><h2>${liveFccPolicyRegistration ? "Live policy registered" : liveFccSession ? "Three receipts ready" : "Prepare in Policy Studio"}</h2></div><span class="state-tag ${liveFccPolicyRegistration ? "green-tag" : "gray-tag"}">${liveFccPolicyStatus === 1 ? "ACTIVE" : liveFccPolicyStatus === 2 ? "STOPPED" : liveFccPolicyStatus === 3 ? "REVOKED" : "NOT REGISTERED"}</span></div>${liveFccSession ? `<div class="commitment-value">${esc(liveFccSession.binding.policyCommitment)}</div><div class="demo-actor-mini">${liveFccSession.custody.map((item, index) => `<span>MACHINE ${index + 1} · ${esc(short(item.digest))}</span>`).join("")}</div>` : `<p class="panel-copy">Policy Studio encrypts the same private policy independently for all three registered public keys and verifies all three receipts before registration.</p>`}<div class="vault-actions"><button class="outline-button" type="button" data-view="studio">Open Policy Studio</button>${liveFccSession && !liveFccPolicyRegistration && operatorConnected ? `<button class="primary-button" type="button" data-action="register-live-policy" ${liveFccBusy ? "disabled" : ""}>Register policy</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">03 · PUBLIC REQUEST</div><h2>${request ? `Occurrence ${request.occurrence}` : "Create exact action"}</h2></div><span class="state-tag ${request ? "green-tag" : "gray-tag"}">${esc(requestStatus)}</span></div><p class="panel-copy">Amount, target and timing are public. Caps, schedule relationships, salt and policy plaintext remain private.</p>${policyActive && operatorConnected ? `<label class="demo-amount-label">Request amount<input id="live-fcc-request-amount" value="${esc(liveFccRequestAmountInput)}" inputmode="decimal" autocomplete="off" /></label>${request ? `<dl class="demo-request-facts"><div><dt>Request</dt><dd>${esc(short(request.requestId))}</dd></div><div><dt>Amount</dt><dd>${token(request.amount)} FTestXRP</dd></div><div><dt>Checkpoint</dt><dd>${esc(short(request.spendCheckpoint))}</dd></div><div><dt>Expiry</dt><dd>${utc(request.expiry)}</dd></div></dl><button class="outline-button" type="button" data-action="reset-live-request" ${liveFccBusy ? "disabled" : ""}>Prepare next request</button>` : `<button class="primary-button" type="button" data-action="create-live-request" ${liveFccBusy || !snapshot || snapshot.accounting.available <= 0n ? "disabled" : ""}>${liveFccBusy === "REQUEST" ? "Waiting for finality…" : "Create V1 request"}</button>`}` : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Prerequisite missing</strong><small>Connect the operator, fund the V1 vault, and register an active live policy.</small></div></div>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">04 · FCC QUORUM</div><h2>${liveFccEvaluation ? `${liveFccEvaluation.decision} · ${esc(liveFccEvaluation.publicReasonClass)}` : "Dispatch and verify"}</h2></div><span class="state-tag ${liveFccEvaluation ? "green-tag" : "gray-tag"}">${liveFccEvaluation ? `ROUTER ${liveFccEvaluation.routerStatus}` : "WAITING"}</span></div><p class="panel-copy">The browser signs request-specific relay authorization, then sends only an empty JSON object. The relay reads the request from chain; no client decision field exists.</p><div class="vault-actions">${request && !liveFccEvaluation && operatorConnected ? `<button class="primary-button" type="button" data-action="evaluate-live-request" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "EVALUATE" ? "A/B/D evaluating…" : "Evaluate with live A/B/D"}</button>` : ""}${liveFccEvaluation?.decision === "ALLOW" && liveFccEvaluation.routerStatus === 2 && !liveFccExecution ? `<button class="primary-button" type="button" data-action="execute-live-request" ${liveFccBusy ? "disabled" : ""}>Execute authorized transfer</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">05 · GOVERNANCE</div><h2>Canonical owner controls</h2></div><span class="state-tag gray-tag">NO DECISION OVERRIDE</span></div><p class="panel-copy">Stop/resume/revoke changes policy availability only. Revocation remains terminal.</p><div class="vault-actions"><button class="outline-button" type="button" data-live-policy-action="STOP" ${liveFccPolicyStatus !== 1 || liveFccBusy ? "disabled" : ""}>Stop</button><button class="outline-button" type="button" data-live-policy-action="RESUME" ${liveFccPolicyStatus !== 2 || liveFccBusy ? "disabled" : ""}>Resume</button><button class="outline-button" type="button" data-live-policy-action="REVOKE" ${!liveFccPolicyRegistration || liveFccPolicyStatus === 3 || liveFccBusy ? "disabled" : ""}>Revoke</button></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC TRANSACTION LOG</div><h2>${liveFccTransactions.length} writes</h2></div><span class="state-tag gray-tag">THIS TAB ONLY</span></div>${transactionRows}</section></div>
    <div class="interactive-notice" role="status"><span class="status-dot ${liveFccBusy ? "amber" : "green"}"></span><strong>${esc(liveFccBusy ? `Working: ${liveFccBusy}` : liveFccNotice)}</strong></div>`;
}

function interactiveDemoView(): string {
  const account = connectedAccount();
  if (interactiveConfigState.status === "LOADING") return `${demoSectionIntro("INTERACTIVE TESTNET DEMO", "Preparing the optional interactive lifecycle", "Loading the simulation-only Coston2 contract and actor domain.")}<section class="panel demo-loading"><div class="empty-orbit">◌</div><h2>Checking demo configuration…</h2></section>`;
  if (interactiveConfigState.status === "UNAVAILABLE") return `${demoSectionIntro("INTERACTIVE TESTNET DEMO", "Optional interactive actors unavailable", "The reviewed lifecycle above remains usable. The website will not replace an unavailable actor quorum with a browser decision.")}<section class="panel"><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No interactive success asserted</strong><small>The recorded public-safe lifecycle above remains available; production FCC remains blocked independently.</small></div></div></section>`;
  const config = interactiveConfigState.config;
  const snapshot = interactiveAccountSnapshot;
  const policyRegistered = Boolean(interactiveSession && interactivePolicyRegistration);
  const policyReady = policyRegistered && snapshot?.policyStatus === 1;
  const policyLabel = snapshot?.policyStatus === 3 ? "Demo policy revoked"
    : snapshot?.policyStatus === 2 ? "Demo policy stopped"
      : policyReady ? "Demo policy active" : interactiveSession ? "Receipts ready" : "Prepare in Policy Studio";
  const request = interactiveRequest?.request;
  const decision = interactiveThreshold?.status === "THRESHOLD_READY" ? interactiveThreshold.matching[0]?.result : undefined;
  const requestStatus = interactiveExecution ? "EXECUTED" : decision?.decision === "DENY" && interactiveThresholdTransactions.length >= 2 ? "DENIED" : interactiveThresholdTransactions.length >= 2 ? "ALLOWED" : request ? "PENDING" : "NOT CREATED";
  const transactionRows = interactiveTransactions.length === 0
    ? `<div class="boundary-empty">No wallet transaction has been submitted from this interactive session.</div>`
    : `<ol class="interactive-transaction-list">${interactiveTransactions.map((item, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.label)}</strong><small>Block ${item.blockNumber} · ${esc(short(item.hash))}</small></div><a href="${explorerTransaction(item.hash)}" target="_blank" rel="noreferrer">↗</a></li>`).join("")}</ol>`;
  return `${demoSectionIntro("OPTIONAL INTERACTIVE TESTNET DEMO", "Run the isolated simulation", "Use faucet FTestXRP and an injected wallet. Three serverless actors compute signed results; the browser never supplies ALLOW.")}
    <div class="demo-boundary interactive-boundary"><span class="state-tag gray-tag">SIMULATED FCC · COSTON2 TESTNET</span><strong>Real testnet transactions · shared serverless trust domain</strong><span>Not production TEE · not Gate A/B/C</span></div>
    <div class="interactive-stepper" aria-label="Interactive demo progress">${["FUND", "RECEIPTS", "REGISTER", "REQUEST", "QUORUM", "EXECUTE / DENY", "GOVERNANCE"].map((step, index) => `<span class="${interactiveStepReached(index) ? "reached" : ""}">${String(index + 1).padStart(2, "0")} ${step}</span>`).join("")}</div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">01 · TEST TOKEN FUNDING</div><h2>Simulation-only vault</h2></div><span class="state-tag ${snapshot ? "green-tag" : "gray-tag"}">${snapshot ? "FINALIZED READ" : "NOT LOADED"}</span></div><p class="panel-copy">Approve and deposit faucet FTestXRP into the separate demo vault. The production-observation vault remains untouched.</p>${account ? `<div class="demo-account-grid"><div><span>Wallet</span><strong>${snapshot ? token(snapshot.tokenBalance) : "—"} FTestXRP</strong></div><div><span>Allowance</span><strong>${snapshot ? token(snapshot.allowance) : "—"}</strong></div><div><span>Demo available</span><strong>${snapshot ? token(snapshot.accounting.available) : "—"}</strong></div></div><label class="demo-amount-label">Funding amount<input id="interactive-fund-amount" value="${esc(interactiveFundInput)}" inputmode="decimal" autocomplete="off" /></label><div class="vault-actions"><button class="outline-button" type="button" data-action="refresh-interactive-account" ${interactiveBusy ? "disabled" : ""}>Refresh finalized state</button><button class="outline-button" type="button" data-action="demo-approve" ${interactiveBusy || !snapshot ? "disabled" : ""}>Approve</button><button class="primary-button" type="button" data-action="demo-deposit" ${interactiveBusy || !snapshot ? "disabled" : ""}>Deposit</button></div>` : `<button class="primary-button" type="button" data-action="connect">Connect Coston2 wallet</button>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">02 · POLICY & CUSTODY</div><h2>${policyLabel}</h2></div><span class="state-tag gray-tag">SIMULATION ONLY</span></div>${interactiveSession ? `<div class="commitment-value">${esc(interactiveSession.binding.policyCommitment)}</div><div class="demo-actor-mini">${interactiveSession.custody.map((item) => `<span>ACTOR ${item.actor} · ${esc(short(item.digest))}</span>`).join("")}</div>` : `<p class="panel-copy">Use the adjacent demo panel in Policy Studio to bind your wallet, encrypt the draft three times, and collect owner-authorized receipts.</p>`}<div class="vault-actions"><button class="outline-button" type="button" data-view="studio">Open Policy Studio</button>${interactiveSession && !interactivePolicyRegistration ? `<button class="primary-button" type="button" data-action="register-demo-policy" ${interactiveBusy ? "disabled" : ""}>Register policy</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">03 · PUBLIC REQUEST</div><h2>${request ? `Occurrence ${request.occurrence}` : "Create an exact action"}</h2></div><span class="state-tag ${request ? "green-tag" : "gray-tag"}">${esc(requestStatus)}</span></div><p class="panel-copy">The target and amount are public here. Private caps and policy relationships stay inside the three actor evaluations.</p>${policyReady && account ? `<label class="demo-amount-label">Request amount<input id="interactive-request-amount" value="${esc(interactiveRequestAmountInput)}" inputmode="decimal" autocomplete="off" /></label>${request ? `<dl class="demo-request-facts"><div><dt>Request</dt><dd>${esc(short(request.requestId))}</dd></div><div><dt>Amount</dt><dd>${token(request.amount)} FTestXRP</dd></div><div><dt>Checkpoint</dt><dd>${esc(short(request.spendCheckpoint))}</dd></div><div><dt>Expiry</dt><dd>${utc(request.expiry)}</dd></div></dl><button class="outline-button" type="button" data-action="reset-demo-request" ${interactiveBusy ? "disabled" : ""}>Prepare next request</button>` : `<button class="primary-button" type="button" data-action="create-demo-request" ${interactiveBusy || !snapshot || snapshot.accounting.available <= 0n ? "disabled" : ""}>${interactiveBusy === "REQUEST" ? "Waiting for wallet / finality…" : "Create public request"}</button>`}` : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Policy or wallet prerequisite missing</strong><small>Register the demo policy and load a funded finalized account first.</small></div></div>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">04 · ACTOR QUORUM</div><h2>${decision ? `${decision.decision} · ${decision.publicReasonClass}` : "Independent evaluation"}</h2></div><span class="state-tag ${interactiveThreshold?.status === "THRESHOLD_READY" ? "green-tag" : "gray-tag"}">${interactiveThreshold?.status ?? "WAITING"}</span></div><div class="demo-actor-mini">${config.actors.map((actor) => { const result = interactiveThreshold?.valid.find((item) => item.actor === actor.actor); return `<span>ACTOR ${actor.actor} · ${result ? `${result.result.decision} · ${esc(short(result.digest))}` : "not evaluated"}</span>`; }).join("")}</div><p class="panel-copy">The API accepts ciphertext and a request ID only. Any client-supplied decision field is rejected.</p><div class="vault-actions">${request && !interactiveThreshold ? `<button class="primary-button" type="button" data-action="evaluate-demo-request" ${interactiveBusy ? "disabled" : ""}>${interactiveBusy === "EVALUATE" ? "Calling 3 actors…" : "Evaluate with 3 actors"}</button>` : ""}${interactiveThreshold?.status === "THRESHOLD_READY" && interactiveThresholdTransactions.length === 0 ? `<button class="primary-button" type="button" data-action="submit-demo-threshold" ${interactiveBusy ? "disabled" : ""}>${interactiveBusy === "THRESHOLD" ? "Submitting 2 signatures…" : "Submit 2 matching results"}</button>` : ""}${decision?.decision === "ALLOW" && interactiveThresholdTransactions.length >= 2 && !interactiveExecution ? `<button class="primary-button" type="button" data-action="execute-demo-request" ${interactiveBusy ? "disabled" : ""}>Execute public transfer</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">05 · GOVERNANCE</div><h2>Stop, resume, or revoke</h2></div><span class="state-tag gray-tag">OWNER ONLY</span></div><p class="panel-copy">Governance can stop new requests, but cannot manufacture a decision. Revocation is terminal.</p><div class="vault-actions"><button class="outline-button" type="button" data-policy-action="STOP" ${snapshot?.policyStatus !== 1 || interactiveBusy ? "disabled" : ""}>Stop</button><button class="outline-button" type="button" data-policy-action="RESUME" ${snapshot?.policyStatus !== 2 || interactiveBusy ? "disabled" : ""}>Resume</button><button class="outline-button" type="button" data-policy-action="REVOKE" ${!policyRegistered || snapshot?.policyStatus === 3 || interactiveBusy ? "disabled" : ""}>Revoke</button></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC TRANSACTION LOG</div><h2>${interactiveTransactions.length} finalized writes</h2></div><span class="state-tag gray-tag">THIS TAB ONLY</span></div>${transactionRows}</section></div>
    <div class="interactive-notice" role="status"><span class="status-dot ${interactiveBusy ? "amber" : "green"}"></span><strong>${esc(interactiveBusy ? `Working: ${interactiveBusy}` : interactiveNotice)}</strong></div>`;
}

function interactiveStepReached(index: number): boolean {
  if (index === 0) return Boolean(interactiveAccountSnapshot?.accounting.available && interactiveAccountSnapshot.accounting.available > 0n);
  if (index === 1) return Boolean(interactiveSession);
  if (index === 2) return Boolean(interactivePolicyRegistration);
  if (index === 3) return Boolean(interactiveRequest);
  if (index === 4) return interactiveThreshold?.status === "THRESHOLD_READY";
  if (index === 5) return Boolean(interactiveExecution || interactiveThresholdTransactions.length >= 2);
  return interactiveAccountSnapshot?.policyStatus === 2 || interactiveAccountSnapshot?.policyStatus === 3;
}

function demoSectionIntro(eyebrow: string, title: string, copy: string): string {
  return `<div class="demo-section-intro" id="interactive-demo"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${copy}</p></div>`;
}

function recordedDemoView(): string {
  if (demoState.status === "LOADING") {
    return `<section class="panel demo-loading recorded-demo-section" id="recorded-lifecycle"><div class="eyebrow">RECORDED SOLUTION 3 EVIDENCE</div><div class="empty-orbit">◌</div><h2>Validating evidence schema…</h2></section>`;
  }
  if (demoState.status === "UNAVAILABLE") {
    return `<section class="panel recorded-demo-section" id="recorded-lifecycle"><div class="eyebrow">RECORDED SOLUTION 3 EVIDENCE</div><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No recorded success asserted</strong><small>Build or evidence validation failed closed. Live FCC remains unavailable independently.</small></div></div></section>`;
  }
  const evidence = demoState.evidence;
  const machines = evidence.machines.map((machine, index) => `<article class="demo-machine machine-${index + 1}"><div class="machine-glyph">${index === 0 ? "◇" : index === 1 ? "⌁" : "▣"}</div><div><span>SIMULATED MACHINE ${index + 1}</span><strong>${esc(short(machine.machineId))}</strong><small>Key ${esc(short(machine.keyFingerprint))}<br>Signer ${esc(short(machine.signer))}</small></div></article>`).join("");
  const steps = evidence.steps.map((step, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(step.label)}</strong><small>Block ${step.blockNumber} · ${esc(short(step.transactionHash))}</small></div><a href="${explorerTransaction(step.transactionHash)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(step.label)} transaction">↗</a></li>`).join("");
  return `<div id="recorded-lifecycle"><div class="recorded-demo-lede"><span class="state-tag sample-context-tag">WALLET-FREE · REVIEWED PUBLIC EVIDENCE</span><p>A prior Coston2 contract run driven by three ephemeral simulated signers. It proves the contract path, not hardware confidentiality or production FCC.</p></div>
    <div class="demo-boundary"><span class="state-tag amber-tag">SIMULATION ONLY</span><strong>On-chain transactions verified · hardware TEE not present</strong><span>Observed through Coston2 block ${evidence.observedBlock}</span></div>
    <section class="demo-machine-grid">${machines}</section>
    <div class="demo-summary-grid"><section class="panel demo-result allow-result"><div class="eyebrow">2 MATCHING RESULTS</div><h2>Recurring payment allowed</h2><strong>${token(evidence.amount)} FTestXRP</strong><p>Two simulated machines produced one matching ALLOW digest, the vault reserved value, and the router executed the exact transfer.</p><span class="mono-value">${esc(short(evidence.allowRequestId))}</span></section><section class="panel demo-result deny-result"><div class="eyebrow">DETERMINISTIC POLICY RESULT</div><h2>Next request denied</h2><strong>CAP_EXCEEDED</strong><p>Two matching DENY results kept the vault unchanged. The private cap itself is not present in this public evidence.</p><span class="mono-value">${esc(short(evidence.denyRequestId))}</span></section><section class="panel demo-result"><div class="eyebrow">VAULT CONSERVATION</div><h2>Accounting still balances</h2><strong>${token(evidence.deposited)} deposited</strong><p>${token(evidence.availableAfter)} available + ${token(evidence.spentAfter)} spent. Stop, resume, and revoke were also verified.</p></section></div>
    <div class="demo-detail-grid"><section class="panel demo-timeline"><div class="panel-heading"><div><div class="eyebrow">COSTON2 TRANSACTION TIMELINE</div><h2>${evidence.steps.length} verified checkpoints</h2></div><span class="state-tag green-tag">PUBLIC EVIDENCE</span></div><ol>${steps}</ol></section><aside class="panel demo-limitations"><div class="eyebrow">NOT PROVEN HERE</div><h2>Production gates stay explicit</h2><ul>${evidence.blockers.map((blocker) => `<li>${esc(blocker.replaceAll("_", " "))}</li>`).join("")}</ul><p>This demonstration cannot activate a new private browser draft or authorize a new request without the future three production FCC machines.</p><a class="outline-button inline-link" href="/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json" target="_blank" rel="noreferrer">Open reviewed JSON ↗</a></aside></div></div>`;
}

function requestTransactionPanel(snapshot: PublicRequestSnapshotV1 | undefined): string {
  const account = connectedAccount();
  const busy = requestTransactionState.status === "SUBMITTING";
  const can = (kind: RequestTransactionKind): boolean => {
    if (!snapshot || !account || !requestPolicyOwner || requestFinalizedAt === null) return false;
    try { validateRequestTransaction(kind, account, snapshot, requestPolicyOwner, requestFinalizedAt); return true; } catch { return false; }
  };
  const result = requestTransactionState.status === "SUCCESS"
    ? `<div class="transaction-result success-result"><span class="status-dot green"></span><div><strong>${requestTransactionState.kind} finalized</strong><small>Coston2 block ${requestTransactionState.blockNumber}</small><a href="${explorerTransaction(requestTransactionState.hash)}" target="_blank" rel="noreferrer">Open transaction ↗</a></div></div>`
    : requestTransactionState.status === "ERROR"
      ? `<div class="transaction-result error-result"><span class="status-dot amber"></span><div><strong>Router transaction not verified</strong><small>${esc(requestTransactionState.message)}</small></div></div>` : "";
  const reviewCopy = requestIntent === "EXECUTE"
    ? "Execute the exact threshold-approved public transfer. The browser cannot choose or override ALLOW."
    : requestIntent === "EXPIRE"
      ? "Finalize this expired request and release any reservation held by an ALLOWED request."
      : "Cancel this request as its creator or policy owner and release any reservation.";
  const review = requestIntent && snapshot
    ? `<div class="transaction-review"><div class="eyebrow">EXACT ROUTER PREVIEW</div><h3>${requestIntent} · ${esc(short(snapshot.requestId))}</h3><p>${reviewCopy}</p><dl><div><dt>Network</dt><dd>Coston2 · chain 114</dd></div><div><dt>Router</dt><dd>${PAYGUARD_COSTON2.router}</dd></div><div><dt>Request hash</dt><dd>${snapshot.requestHash}</dd></div><div><dt>Success gate</dt><dd>Receipt + exact event + finalized terminal state</dd></div></dl><div class="transaction-warning">No policy rule or ALLOW flag is supplied by this action.</div><div class="vault-actions"><button class="outline-button" type="button" data-action="cancel-request-intent" ${busy ? "disabled" : ""}>Back</button><button class="primary-button" type="button" data-action="submit-request-intent" ${busy ? "disabled" : ""}>${busy ? "Waiting for wallet / finality…" : "Confirm in wallet"}</button></div></div>` : "";
  return `<section class="panel request-transaction-panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC ROUTER CONTROLS</div><h2>Advance only the canonical state</h2></div><span class="state-tag ${account ? "green-tag" : "amber-tag"}">${account ? "WALLET CONNECTED" : "CONNECT WALLET"}</span></div><p class="panel-copy">Execute and expire are permissionless only in their exact contract states. Cancel additionally requires the requester or policy owner.</p><div class="transaction-actions"><button class="primary-button" type="button" data-request-kind="EXECUTE" ${!can("EXECUTE") || busy ? "disabled" : ""}>Prepare execution</button><button class="outline-button" type="button" data-request-kind="EXPIRE" ${!can("EXPIRE") || busy ? "disabled" : ""}>Prepare expiry</button><button class="outline-button" type="button" data-request-kind="CANCEL" ${!can("CANCEL") || busy ? "disabled" : ""}>Prepare cancellation</button></div>${!account ? `<button class="text-button request-connect" type="button" data-action="connect">Connect Coston2 wallet ↗</button>` : ""}${review}${result}</section>`;
}

function requestUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    SNAPSHOT_UNFINALIZED: "Snapshot is not finalized",
    SNAPSHOT_INVALID: "Public snapshot failed validation",
  } as Record<string, string>)[reason] ?? "Public request unavailable";
}

function requestReadinessLabel(readiness: string): string {
  return readiness.replaceAll("_", " ");
}

function payeeView(): string {
  const receipt = payeeState.status === "UNAVAILABLE" ? undefined : payeeState.receipt;
  const unavailableReason = payeeState.status === "UNAVAILABLE" ? payeeUnavailableReason(payeeState.reason) : "Finalized public settlement";
  const matchingRequest = receipt && requestState.status !== "UNAVAILABLE" && requestState.snapshot.requestId.toLowerCase() === receipt.requestId.toLowerCase()
    ? requestState : undefined;
  const labels = matchingRequest ? requestStateLabels(matchingRequest.status, matchingRequest.readiness) : undefined;
  const expiredPending = receipt?.status === "PENDING" && labels?.needsExpiryFinalization;
  const expectedPanel = receipt
    ? `<h2>${receipt.status === "SETTLED" ? "Payment settled" : expiredPending ? "Payment window expired" : "Expected payment"}</h2><p class="panel-copy">The payee sees only the public amount, destination, timing window, and settlement checkpoint. Private policy rules remain outside this receipt.</p><div class="request-public-state payee-public-state"><div><span>Amount</span><strong>${token(receipt.expectedAmount)} FTestXRP</strong></div><div><span>Target</span><strong class="mono-value">${esc(short(receipt.payee))}</strong></div><div><span>Expected at</span><strong>${utc(receipt.expectedAt)}</strong></div><div><span>Expiry</span><strong>${utc(receipt.expiry)}</strong></div></div><div class="unavailable-box ${expiredPending ? "expired-window-box" : ""}"><span class="status-dot ${receipt.status === "SETTLED" ? "green" : "amber"}"></span><div><strong>On-chain: ${receipt.status}${labels ? ` · Timing: ${labels.timing}` : ""}</strong><small>${receipt.status === "SETTLED" ? `Transaction ${esc(short(receipt.settlementTransactionHash))} · checkpoint ${esc(short(receipt.settlementCheckpoint))}` : expiredPending ? "The public window has passed, but the canonical request remains PENDING until someone finalizes expiry on-chain. No settlement is asserted." : `Finalized request ${esc(short(receipt.requestId))} · policy details remain private.`}</small></div></div>`
    : `<h2>No verified request yet</h2><p class="panel-copy">A payee can inspect only a finalized public request, transfer receipt, and supported redemption status. Policy rules, caps, delegates, and private denial reasons stay in FCC custody.</p><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Public request endpoint unavailable</strong><small>${esc(unavailableReason)}. No amount, recipient, timing, or transaction is asserted in this local preview.</small></div></div>`;
  return `${pageIntro("PUBLIC SETTLEMENT VIEW", "Payee status", "See the expected public amount, timing, and settlement receipt without learning the private policy behind the request.")}
    ${requestLookup()}
    <div class="section-grid"><section class="panel"><div class="eyebrow">${receipt ? "PUBLIC PAYMENT STATE" : "NO VERIFIED PAYMENT"}</div>${expectedPanel}</section><section class="panel"><div class="eyebrow">WHAT REMAINS PRIVATE</div><h2>Policy boundary</h2><ul class="evidence-list"><li><span class="evidence-icon">▣</span><div><strong>Target groups</strong><small>Not exposed to the payee</small></div><span class="state-tag gray-tag">PRIVATE</span></li><li><span class="evidence-icon">#</span><div><strong>Caps and schedules</strong><small>Only request timing is public</small></div><span class="state-tag gray-tag">PRIVATE</span></li><li><span class="evidence-icon">↗</span><div><strong>Settlement receipt</strong><small>Appears only after finalized public evidence</small></div><span class="state-tag gray-tag">WAITING</span></li></ul></section></div>`;
}

function payeeUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    RECEIPT_UNFINALIZED: "Settlement receipt is not finalized",
    RECEIPT_INVALID: "Public settlement receipt failed validation",
  } as Record<string, string>)[reason] ?? "Public settlement unavailable";
}

function auditorView(): string {
  const evidence = auditState.status === "UNAVAILABLE" ? undefined : auditState.evidence;
  const unavailableReason = auditState.status === "UNAVAILABLE" ? auditUnavailableReason(auditState.reason) : "Finalized public evidence";
  const checklist = evidence
    ? `<li><span class="evidence-icon">#</span><div><strong>Policy commitment</strong><small>${esc(short(evidence.policy.policyCommitment))} · schema ${esc(short(evidence.policy.schema))}</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">♧</span><div><strong>Machine/key binding</strong><small>3 frozen identities · ${evidence.policy.resultThreshold}-of-${evidence.policy.machineIds.length} result threshold</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">↗</span><div><strong>Decision digest</strong><small>${evidence.decision} · ${esc(short(evidence.resultDigest))} · ${evidence.executionStatus}</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">∑</span><div><strong>Conservation</strong><small>${evidence.conservation.deposited} = ${evidence.conservation.available} + ${evidence.conservation.reserved} + ${evidence.conservation.spent} + ${evidence.conservation.withdrawn} + ${evidence.conservation.refunded}</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">◇</span><div><strong>External input</strong><small>${evidence.inputKind} · ${evidence.inputFinalized ? "finalized" : "not required"}</small></div><span class="state-tag green-tag">VERIFIED</span></li>`
    : `<li><span class="evidence-icon">#</span><div><strong>Policy commitment</strong><small>Hash only · no rules or ciphertext</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">♧</span><div><strong>Machine/key binding</strong><small>Three frozen identities · 2-of-3 result threshold</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">↗</span><div><strong>Decision digest</strong><small>Exact request, checkpoint, expiry, and signers</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">∑</span><div><strong>Conservation</strong><small>Deposited = available + reserved + spent + withdrawn + refunded</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">◇</span><div><strong>External input</strong><small>FTSO/FDC commitment and finalization status</small></div><span class="state-tag gray-tag">WAITING</span></li>`;
  const request = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const chainCheckpoint = request
    ? `<div class="unavailable-box live-request-box"><span class="status-dot green"></span><div><strong>Canonical request verified</strong><small>Finalized block ${requestFinalizedBlock ?? "—"} · ${request.status} · hash ${esc(short(request.requestHash))}. This is request-state verification, not FCC evidence.</small></div></div>`
    : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No canonical request verified</strong><small>${esc(requestNotice)} No transaction, proof, signer, or authorization result is asserted.</small></div></div>`;
  return `${pageIntro("WALLET-FREE VERIFIER", "Auditor view", "Inspect public commitments and conservation without connecting a wallet or revealing the policy.")}
    <div class="auditor-grid"><section class="panel verify-card"><div class="eyebrow">PUBLIC REQUEST CHECKPOINT</div><h2>Verify a PayGuard request</h2><p>Read a bytes32 request ID directly from the deployed Coston2 router. Private policy material is never requested.</p><label>Request ID<input id="request-id" value="${esc(requestInput)}" placeholder="0x…" autocomplete="off" spellcheck="false" /></label><button class="primary-button" type="button" data-action="load-request" ${requestLoading ? "disabled" : ""}>${requestLoading ? "Checking…" : "Check finalized state"}</button>${chainCheckpoint}<div class="audit-boundary"><strong>Full FCC evidence</strong><small>${evidence ? `Verified at block ${evidence.evidenceBlock}` : `${esc(unavailableReason)}. Request reads do not invent machine signatures or threshold results.`}</small></div></section><section class="panel evidence-card"><div class="eyebrow">ASSERTION CHECKLIST</div><h2>What an auditor will see</h2><ul class="evidence-list">${checklist}</ul></section></div>
    ${publicEvidenceMirrorView()}`;
}

function publicEvidenceMirrorView(): string {
  if (publicEvidenceMirrorState.status === "LOADING") {
    return `<section class="panel evidence-mirror"><div class="eyebrow">STATIC EVIDENCE MIRROR</div><h2>Checking public index…</h2><p class="panel-copy">Only reviewed testnet metadata is loaded. No policy, signature, or authorization result is requested.</p></section>`;
  }
  if (publicEvidenceMirrorState.status === "UNAVAILABLE") {
    return `<section class="panel evidence-mirror"><div class="eyebrow">STATIC EVIDENCE MIRROR</div><h2>Evidence mirror unavailable</h2><p class="panel-copy">The static public index is not published or failed schema validation. This UI does not substitute a local evidence result.</p><span class="state-tag amber-tag">UNAVAILABLE</span></section>`;
  }
  const { index } = publicEvidenceMirrorState;
  const simulated = index.entries.filter((entry) => entry.path.startsWith("/evidence/simulation/")).length;
  return `<section class="panel evidence-mirror"><div class="panel-heading"><div><div class="eyebrow">STATIC EVIDENCE MIRROR</div><h2>${index.entries.length} reviewed artifacts</h2></div><span class="state-tag green-tag">TESTNET · PUBLIC</span></div><p class="panel-copy">This index exposes public facts and explicitly labelled local simulation records only. It is not a live policy provider or authorization result.</p><div class="evidence-mirror-meta"><span>${index.entries.filter((entry) => entry.chainId === "114").length} Coston2 artifacts</span><span>${simulated} local simulation artifact${simulated === 1 ? "" : "s"}</span><span>Private fields rejected</span><a href="/evidence/index.json" target="_blank" rel="noreferrer">Open index ↗</a></div></section>`;
}

function auditUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    EVIDENCE_UNFINALIZED: "Evidence is not finalized",
    EVIDENCE_INVALID: "Public evidence failed validation",
  } as Record<string, string>)[reason] ?? "Public evidence unavailable";
}

function teamView(): string {
  const workspace = workspaceState.status === "UNAVAILABLE" ? undefined : workspaceState.snapshot;
  const request = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const workspaceReason = workspaceState.status === "UNAVAILABLE" ? workspaceUnavailableReason(workspaceState.reason) : "Finalized public role registry";
  const reviewed = isReviewedRequestInput();
  const requestContext = reviewed ? "reviewed request example" : "currently loaded public request";
  const roleRows = workspace
    ? workspace.roles.map((assignment) => `<div class="role-row"><div class="avatar dashed">◌</div><div class="role-person"><strong>${esc(assignment.role)}</strong><small>${esc(short(assignment.account))} · ${assignment.active ? "Active assignment" : "Inactive assignment"}</small></div><span class="role-permission">Public role only</span></div>`).join("")
    : request && requestPolicyOwner
      ? `<div class="role-row"><div class="avatar purple">O</div><div class="role-person"><strong>Policy owner</strong><small>${esc(short(requestPolicyOwner))} · registry-bound public account</small></div><span class="role-permission">May cancel/recover</span></div><div class="role-row"><div class="avatar dashed">R</div><div class="role-person"><strong>Requester</strong><small>${esc(short(request.requester))} · exact request creator</small></div><span class="role-permission">May cancel</span></div><div class="role-row"><div class="avatar dashed">P</div><div class="role-person"><strong>Payee</strong><small>${esc(short(request.target))} · public transfer target</small></div><span class="role-permission">Receives only after execution</span></div>`
      : `<div class="role-row"><div class="avatar purple">O</div><div class="role-person"><strong>Owner</strong><small>Load a finalized request to observe its registry-bound actors.</small></div><span class="role-permission">Unavailable</span></div>`;
  return `${pageIntro(workspace ? "ROLES & GOVERNANCE" : "PUBLIC REQUEST CONTEXT", workspace ? "Team workspace" : "Observed request actors", workspace ? "Separate policy author, funder, executor, payee, and auditor responsibilities. No role can supply an authorization result." : `These public identities belong to the ${requestContext}. They are not your team, wallet contacts, or editable role grants.`)}
    <section class="panel roles-panel"><div class="panel-heading"><div><div class="eyebrow">${workspace ? "CURRENT WORKSPACE" : "OBSERVED REQUEST ACTORS"}</div><h2>${workspace ? "Personal workspace" : "On-chain identities, not role grants"}</h2></div><span class="state-tag ${workspace || request ? "green-tag" : "gray-tag"}">${workspace ? "VERIFIED" : request ? "OBSERVED" : "UNAVAILABLE"}</span></div>${roleRows}</section><div class="team-note"><span class="lock-icon">▣</span><div><strong>${workspace ? "Public role registry verified" : request ? "No standalone role registry deployed" : "Role registry unavailable"}</strong><p>${request && !workspace ? "The rows above are identities bound by the registry/request contracts, not editable team assignments. " : `${esc(workspaceReason)}. `}No role supplies, overrides, or infers an authorization result.</p></div></div>`;
}

function notificationTray(): string {
  if (notificationState.status === "UNAVAILABLE") {
    return `<aside class="notification-tray panel" role="status"><div class="panel-heading"><div><div class="eyebrow">PUBLIC NOTIFICATIONS</div><h2>Feed unavailable</h2></div><button class="icon-button" type="button" data-action="notifications" aria-label="Close notifications">×</button></div><p class="panel-copy">${esc(notificationUnavailableReason(notificationState.reason))}. This preview never invents request, funding, or execution events.</p><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No public checkpoint feed</strong><small>Only finalized public facts may enter notifications. Policy plaintext, ciphertext, signatures, and private reasons are excluded.</small></div></div><button class="outline-button notification-export" type="button" data-action="export-notifications">Export unavailable report</button></aside>`;
  }
  const rows = notificationState.feed.notifications.length === 0
    ? `<div class="empty-state notification-empty"><strong>No verified events</strong><span>The feed is finalized but contains no public events.</span></div>`
    : `<ul class="notification-list">${notificationState.feed.notifications.map((item) => `<li><span class="evidence-icon">${item.severity === "WARNING" ? "!" : "·"}</span><div><strong>${esc(notificationLabel(item.kind))}</strong><small>Block ${item.blockNumber} · ${utc(item.observedAt)}</small></div><span class="state-tag ${item.severity === "WARNING" ? "amber-tag" : "green-tag"}">${item.severity}</span></li>`).join("")}</ul>`;
  return `<aside class="notification-tray panel" role="status"><div class="panel-heading"><div><div class="eyebrow">PUBLIC NOTIFICATIONS</div><h2>Finalized event feed</h2></div><button class="icon-button" type="button" data-action="notifications" aria-label="Close notifications">×</button></div>${rows}<button class="outline-button notification-export" type="button" data-action="export-notifications">Export public-only report</button></aside>`;
}

function notificationLabel(kind: string): string {
  return ({
    REQUEST_READY: "Request ready for execution",
    REQUEST_DENIED: "Request denied",
    REQUEST_EXECUTED: "Request executed",
    REQUEST_EXPIRED: "Request expired",
    VAULT_STOPPED: "Vault emergency stop",
    FUNDING_DELAYED: "Funding checkpoint delayed",
    EVIDENCE_VERIFIED: "Evidence verified",
  } as Record<string, string>)[kind] ?? "Public event";
}

function notificationUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    FEED_UNFINALIZED: "Notification feed is not finalized",
    FEED_INVALID: "Public notification feed failed validation",
  } as Record<string, string>)[reason] ?? "Public notification feed unavailable";
}

function workspaceUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    REGISTRY_UNFINALIZED: "Role registry is not finalized",
    REGISTRY_INVALID: "Public role registry failed validation",
  } as Record<string, string>)[reason] ?? "Public role registry unavailable";
}

function wireEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.addEventListener("click", () => navigateToView(button.dataset.view as View)));
  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    const activate = (): void => handleAction(button.dataset.action ?? "");
    button.addEventListener("click", activate);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((button) => button.addEventListener("click", () => selectTemplate(button.dataset.template ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-policy-action]").forEach((button) => button.addEventListener("click", () => void submitInteractiveGovernance(button.dataset.policyAction ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-live-policy-action]").forEach((button) => button.addEventListener("click", () => void submitLiveFccGovernance(button.dataset.livePolicyAction ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-request-kind]").forEach((button) => button.addEventListener("click", () => prepareRequestTransaction(button.dataset.requestKind ?? "")));
  app.querySelector<HTMLInputElement>("#request-id")?.addEventListener("input", (event) => {
    requestInput = (event.currentTarget as HTMLInputElement).value;
    requestIntent = null;
    requestTransactionState = { status: "IDLE" };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-vault-kind]").forEach((button) => button.addEventListener("click", () => prepareVaultTransaction(button.dataset.vaultKind ?? "")));
  app.querySelector<HTMLInputElement>("#vault-amount")?.addEventListener("input", (event) => {
    vaultAmountInput = (event.currentTarget as HTMLInputElement).value;
    vaultIntent = null;
    if (vaultTransactionState.status === "ERROR") vaultTransactionState = { status: "IDLE" };
  });
  app.querySelector<HTMLInputElement>("#interactive-fund-amount")?.addEventListener("input", (event) => { interactiveFundInput = (event.currentTarget as HTMLInputElement).value; });
  app.querySelector<HTMLInputElement>("#interactive-request-amount")?.addEventListener("input", (event) => { interactiveRequestAmountInput = (event.currentTarget as HTMLInputElement).value; });
  app.querySelector<HTMLInputElement>("#live-fcc-request-amount")?.addEventListener("input", (event) => { liveFccRequestAmountInput = (event.currentTarget as HTMLInputElement).value; });
  const form = app.querySelector<HTMLFormElement>("#studio-form");
  form?.addEventListener("submit", (event) => { event.preventDefault(); computeStudio(form); });
  form?.addEventListener("input", () => {
    studioDraft = readStudioDraft(form);
    updateStudioHumanHints(form);
    if (studioCompilation) {
      studioCompilation = null;
      const value = app.querySelector<HTMLElement>("#commitment-value");
      if (value) value.textContent = "Draft changed — recompute";
      const notice = app.querySelector<HTMLElement>("#studio-notice");
      if (notice) notice.textContent = "Draft changed. The previous commitment is no longer current.";
      resetInteractivePolicySession("Draft changed. Recompute before collecting new simulated receipts.");
      resetLiveFccPolicySession("Draft changed. Recompute before collecting new live machine receipts.");
    }
  });
  wireLandingMotion();
}

function wireLandingMotion(): void {
  const shell = app.querySelector<HTMLElement>(".landing-shell");
  const items = Array.from(app.querySelectorAll<HTMLElement>(".landing-reveal"));
  if (!shell || items.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || typeof IntersectionObserver === "undefined") return;
  shell.classList.add("reveal-ready");
  const pending = new Set(items);
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      element.classList.add("is-visible");
      observer.unobserve(element);
      pending.delete(element);
    }
    if (pending.size === 0) observer.disconnect();
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  for (const item of items) observer.observe(item);
}

function handleAction(action: string): void {
  if (action === "new-policy") { navigateToView("studio"); return; }
  if (action === "landing") { navigateToLanding(); return; }
  if (action === "open-app") { navigateToView("overview"); return; }
  if (action === "landing-studio") { navigateToView("studio"); return; }
  if (action === "landing-demo") { navigateToView("demo"); return; }
  if (action === "landing-auditor") { navigateToView("auditor"); return; }
  if (action === "dismiss-notice") { clearAppNotice(); render(); return; }
  if (action === "notifications") { notificationOpen = !notificationOpen; render(); return; }
  if (action === "mobile-menu") { mobileMenuOpen = !mobileMenuOpen; render(); return; }
  if (action === "export-notifications") { exportNotifications(); return; }
  if (action === "connect") { void connectWallet(); return; }
  if (action === "refresh") { void refreshCoston2State(); return; }
  if (action === "load-request") { void refreshPublicRequest(); return; }
  if (action === "cancel-request-intent") { requestIntent = null; requestTransactionState = { status: "IDLE" }; render(); return; }
  if (action === "submit-request-intent") { void submitRequestTransaction(); return; }
  if (action === "cancel-vault-intent") { vaultIntent = null; vaultTransactionState = { status: "IDLE" }; render(); return; }
  if (action === "submit-vault-intent") { void submitVaultTransaction(); return; }
  if (action === "prepare-interactive-draft") { prepareInteractiveDraft(); return; }
  if (action === "prepare-live-draft") { prepareLiveFccDraft(); return; }
  if (action === "collect-live-custody") { void submitLiveFccCustody(); return; }
  if (action === "register-live-policy") { void submitLiveFccPolicyRegistration(); return; }
  if (action === "create-live-request") { void submitLiveFccRequest(); return; }
  if (action === "evaluate-live-request") { void submitLiveFccEvaluation(); return; }
  if (action === "execute-live-request") { void submitLiveFccExecution(); return; }
  if (action === "reset-live-request") { resetLiveFccRequest(); return; }
  if (action === "collect-demo-custody") { void submitInteractiveCustody(); return; }
  if (action === "register-demo-policy") { void submitInteractivePolicyRegistration(); return; }
  if (action === "refresh-interactive-account") { void refreshInteractiveAccount(); return; }
  if (action === "demo-approve") { void submitInteractiveVault("APPROVE"); return; }
  if (action === "demo-deposit") { void submitInteractiveVault("DEPOSIT"); return; }
  if (action === "create-demo-request") { void submitInteractiveRequest(); return; }
  if (action === "evaluate-demo-request") { void submitInteractiveEvaluation(); return; }
  if (action === "submit-demo-threshold") { void submitInteractiveThreshold(); return; }
  if (action === "execute-demo-request") { void submitInteractiveExecution(); return; }
  if (action === "reset-demo-request") { resetInteractiveRequest(); return; }
}

function navigateToView(view: View, replace = false): void {
  const method = replace ? "replaceState" : "pushState";
  window.history[method](null, "", `${window.location.pathname}${window.location.search}${appViewHash(view)}`);
  activeView = view;
  landingOpen = false;
  mobileMenuOpen = false;
  notificationOpen = false;
  clearAppNotice();
  render();
  resetPagePosition("app-main");
}

function navigateToLanding(): void {
  window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#landing`);
  landingOpen = true;
  mobileMenuOpen = false;
  notificationOpen = false;
  clearAppNotice();
  render();
  resetPagePosition("landing-main");
}

function syncRouteFromLocation(): void {
  const route = parseAppRoute(window.location.hash);
  if (route.surface === "landing") {
    if (landingOpen) return;
    landingOpen = true;
    mobileMenuOpen = false;
    notificationOpen = false;
    clearAppNotice();
    render();
    if (route.anchor === "landing") resetPagePosition("landing-main");
    else restoreLandingAnchor(route.anchor);
    return;
  }
  if (!landingOpen && activeView === route.view) return;
  activeView = route.view;
  landingOpen = false;
  mobileMenuOpen = false;
  notificationOpen = false;
  clearAppNotice();
  render();
  resetPagePosition("app-main");
}

function resetPagePosition(focusId: string): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById(focusId)?.focus({ preventScroll: true });
  });
}

function restoreLandingAnchor(anchor: string): void {
  window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "auto" }));
}

function showAppNotice(message: string, duration = 7_000): void {
  if (appNoticeTimer !== undefined) window.clearTimeout(appNoticeTimer);
  appNotice = message;
  appNoticeTimer = window.setTimeout(() => {
    appNotice = "";
    appNoticeTimer = undefined;
    if (!landingOpen) render();
  }, duration);
}

function clearAppNotice(): void {
  if (appNoticeTimer !== undefined) window.clearTimeout(appNoticeTimer);
  appNoticeTimer = undefined;
  appNotice = "";
}

function prepareRequestTransaction(value: string): void {
  if (value !== "EXECUTE" && value !== "EXPIRE" && value !== "CANCEL") return;
  const account = connectedAccount();
  const snapshot = requestState.status === "UNAVAILABLE" ? null : requestState.snapshot;
  if (!account || !snapshot || !requestPolicyOwner || requestFinalizedAt === null) {
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message: "Connect the wallet and load a finalized request first." };
    render();
    return;
  }
  try {
    validateRequestTransaction(value, account, snapshot, requestPolicyOwner, requestFinalizedAt);
    requestIntent = value;
    requestTransactionState = { status: "IDLE" };
    showAppNotice("Review the exact public router transition below. The wallet has not opened yet.");
  } catch (error) {
    const message = error instanceof RequestTransactionError
      ? requestTransactionFailureMessage(error.reason) : "The router action could not be prepared safely.";
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message };
    showAppNotice(message, 10_000);
  }
  render();
}

async function submitRequestTransaction(): Promise<void> {
  const kind = requestIntent;
  const account = connectedAccount();
  if (!kind || !account || walletState.status !== "CONNECTED") {
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message: "The wallet or finalized request changed. Prepare the action again." };
    render();
    return;
  }
  requestTransactionState = { status: "SUBMITTING", kind };
  showAppNotice("Confirm the exact Coston2 router call in your wallet, then wait for finalized state verification.", 12_000);
  render();
  try {
    const result = await executeRequestTransaction(kind, requestInput, account, walletProvider);
    if (connectedAccount()?.toLowerCase() !== account.toLowerCase()) throw new RequestTransactionError("POSTCONDITION_FAILED");
    requestState = result.after.request;
    payeeState = result.after.payee;
    requestFinalizedBlock = result.after.finalizedBlock;
    requestFinalizedAt = result.after.finalizedAt;
    requestPolicyOwner = result.after.policyOwner;
    notificationState = notificationStateFromRequest(result.after);
    requestIntent = null;
    requestTransactionState = { status: "SUCCESS", kind, hash: result.hash, blockNumber: result.blockNumber };
    requestNotice = `${kind} verified in finalized Coston2 state at block ${result.after.finalizedBlock}.`;
    showAppNotice(`${kind} receipt, exact router event, and finalized request state matched.`);
  } catch (error) {
    const message = error instanceof RequestTransactionError
      ? requestTransactionFailureMessage(error.reason) : "The router transaction could not be verified safely.";
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message };
    showAppNotice(message, 10_000);
  }
  render();
}

async function refreshPublicRequest(announce = true): Promise<void> {
  const sequence = ++requestReadSequence;
  const requestedId = requestInput.trim();
  requestLoading = true;
  requestFinalizedBlock = null;
  requestFinalizedAt = null;
  requestPolicyOwner = null;
  requestIntent = null;
  requestTransactionState = { status: "IDLE" };
  requestState = unavailableRequestState("RPC_UNAVAILABLE");
  payeeState = unavailablePayeeState("RPC_UNAVAILABLE");
  requestNotice = "Reading one finalized Coston2 block and verifying runtime, wiring, domain and request hash…";
  render();
  try {
    const result = await loadCoston2PublicRequest(requestedId);
    if (sequence !== requestReadSequence || requestedId !== requestInput.trim()) return;
    requestState = result.request;
    payeeState = result.payee;
    requestFinalizedBlock = result.finalizedBlock;
    requestFinalizedAt = result.finalizedAt;
    requestPolicyOwner = result.policyOwner;
    notificationState = notificationStateFromRequest(result);
    requestNotice = `Canonical public state verified at Coston2 block ${result.finalizedBlock}.`;
    if (announce) showAppNotice("Request runtime, wiring, domain, request hash and finalized state matched the deployed Coston2 router.");
  } catch {
    if (sequence !== requestReadSequence) return;
    requestState = unavailableRequestState("SNAPSHOT_INVALID");
    payeeState = unavailablePayeeState("RECEIPT_INVALID");
    notificationState = unavailableNotificationState("FEED_INVALID");
    requestFinalizedAt = null;
    requestPolicyOwner = null;
    requestNotice = "The request was not found or failed finalized runtime/domain/schema validation.";
    if (announce) showAppNotice("No request fact is being asserted because the finalized lookup failed closed.", 10_000);
  } finally {
    if (sequence === requestReadSequence) {
      requestLoading = false;
      render();
    }
  }
}

function prepareVaultTransaction(value: string): void {
  const live = liveSnapshot();
  if (!live || !connectedAccount()) {
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message: "Connect the wallet and pass finalized Coston2 checks first." };
    render();
    return;
  }
  if (value !== "APPROVE" && value !== "DEPOSIT" && value !== "WITHDRAW") return;
  try {
    const amount = parseFTestXrpAmount(vaultAmountInput);
    validateVaultTransaction(value, amount, live);
    vaultIntent = { kind: value, amount };
    vaultTransactionState = { status: "IDLE" };
    showAppNotice("Review the exact testnet intent below. The wallet has not opened yet.");
  } catch (error) {
    const message = error instanceof VaultTransactionError
      ? vaultTransactionFailureMessage(error.reason)
      : "The vault intent could not be prepared safely.";
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message };
    showAppNotice(message, 10_000);
  }
  render();
}

async function submitVaultTransaction(): Promise<void> {
  const intent = vaultIntent;
  const account = connectedAccount();
  if (!intent || !account || walletState.status !== "CONNECTED" || coston2State.status !== "READY") {
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message: "The wallet or finalized preview changed. Prepare the action again." };
    render();
    return;
  }
  vaultTransactionState = { status: "SUBMITTING", ...intent };
  showAppNotice("Confirm the exact Coston2 transaction in your wallet, then wait for finalized postcondition checks.", 12_000);
  render();
  try {
    const result = await executeVaultTransaction(intent.kind, intent.amount, account, walletProvider);
    if (connectedAccount()?.toLowerCase() !== account.toLowerCase()) throw new VaultTransactionError("POSTCONDITION_FAILED");
    coston2State = { status: "READY", snapshot: result.after };
    vaultIntent = null;
    vaultTransactionState = { status: "SUCCESS", kind: result.kind, amount: result.amount, hash: result.hash, blockNumber: result.blockNumber };
    showAppNotice(`${result.kind} finalized at Coston2 block ${result.blockNumber}; receipt, event and account postconditions matched.`);
  } catch (error) {
    const message = error instanceof VaultTransactionError
      ? vaultTransactionFailureMessage(error.reason)
      : "The transaction could not be verified safely.";
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message };
    showAppNotice(message, 10_000);
    if (walletState.status === "CONNECTED") void refreshCoston2State();
  }
  render();
}

async function connectWallet(): Promise<void> {
  walletState = { status: "CONNECTING" };
  coston2State = { status: "IDLE" };
  showAppNotice("Approve public account access and Flare Coston2 in your wallet. PayGuard never requests a private key.", 12_000);
  render();
  try {
    const session = await connectCoston2Wallet(walletProvider);
    walletState = { status: "CONNECTED", account: session.account };
    showAppNotice(`Connected ${short(session.account)} on Coston2. Verifying finalized public state…`, 12_000);
    render();
    await refreshCoston2State();
    if (interactiveConfigState.status === "READY") await refreshInteractiveAccount(false);
    render();
  } catch (error) {
    const message = error instanceof WalletConnectionError
      ? walletFailureMessage(error.reason)
      : "Wallet connection failed safely.";
    walletState = { status: "ERROR", message };
    coston2State = { status: "IDLE" };
    showAppNotice(message, 10_000);
    render();
  }
}

async function refreshCoston2State(): Promise<void> {
  const account = connectedAccount();
  if (!account || walletState.status !== "CONNECTED") {
    await connectWallet();
    return;
  }
  const sequence = ++liveReadSequence;
  coston2State = { status: "LOADING" };
  showAppNotice("Reading runtime, wiring, asset, balance and vault accounting at one finalized Coston2 block…", 12_000);
  render();
  try {
    const snapshot = await loadCoston2AccountSnapshot(account);
    if (sequence !== liveReadSequence || connectedAccount()?.toLowerCase() !== account.toLowerCase()) return;
    coston2State = { status: "READY", snapshot };
    showAppNotice(`Verified finalized Coston2 block ${snapshot.finalizedBlock}. No transaction was signed.`);
  } catch (error) {
    if (sequence !== liveReadSequence) return;
    const message = coston2ReadFailureMessage(error);
    coston2State = { status: "UNAVAILABLE", message };
    showAppNotice(`${message} Reads failed closed; no balance or contract state is being asserted.`, 10_000);
  }
  render();
}

async function restoreWalletSession(): Promise<void> {
  if (!walletProvider) return;
  try {
    const session = await readWalletSession(walletProvider);
    if (!session) return;
    if (session.chainId !== COSTON2_CHAIN.id) {
      walletState = { status: "WRONG_CHAIN", account: session.account, chainId: session.chainId };
      coston2State = { status: "IDLE" };
      render();
      return;
    }
    walletState = { status: "CONNECTED", account: session.account };
    render();
    await refreshCoston2State();
    if (interactiveConfigState.status === "READY") await refreshInteractiveAccount(false);
    render();
  } catch {
    walletState = { status: "ERROR", message: "The injected wallet session could not be read safely." };
    coston2State = { status: "IDLE" };
    render();
  }
}

function walletChanged(): void {
  liveReadSequence += 1;
  walletState = { status: "DISCONNECTED" };
  coston2State = { status: "IDLE" };
  showAppNotice("Wallet account or network changed. Revalidating the public session…", 12_000);
  vaultIntent = null;
  vaultTransactionState = { status: "IDLE" };
  requestIntent = null;
  requestTransactionState = { status: "IDLE" };
  interactiveAccountSnapshot = null;
  interactiveTransactions = [];
  resetInteractivePolicySession("Wallet changed. Prepare a fresh owner-bound simulation policy.");
  liveFccTransactions = [];
  resetLiveFccPolicySession("Wallet changed. Prepare a fresh operator-bound live policy.");
  render();
  void restoreWalletSession();
}

function exportNotifications(): void {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const exported = notificationState.status === "READY"
    ? buildPublicNotificationExport(notificationState.feed, now < notificationState.feed.generatedAt ? notificationState.feed.generatedAt : now)
    : buildUnavailableNotificationExport(notificationState.reason, now);
  const wire = encodePublicNotificationExport(exported);
  const blob = new Blob([JSON.stringify(wire, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "payguard-public-notifications.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showAppNotice(exported.status === "AVAILABLE" ? "Exported finalized public notifications; no private payload included." : "Exported an unavailable public-feed report; no event was asserted.");
  render();
}

function liveFccContext(): { account: Address; config: LiveFccConfig; provider: NonNullable<typeof walletProvider> } {
  if (walletState.status !== "CONNECTED" || !walletProvider || liveFccConfigState.status !== "READY") {
    throw new Error("LIVE_FCC_PREREQUISITE_MISSING");
  }
  if (walletState.account.toLowerCase() !== liveFccConfigState.config.operator.toLowerCase()) {
    throw new Error("LIVE_OPERATOR_WALLET_REQUIRED");
  }
  return { account: walletState.account, config: liveFccConfigState.config, provider: walletProvider };
}

function prepareLiveFccDraft(): void {
  try {
    const { account, config } = liveFccContext();
    const now = BigInt(Math.floor(Date.now() / 1_000));
    studioEntropy = createStudioEntropy();
    studioDraft = {
      ...studioTemplateDraft("delegated-allowance"),
      templateId: "delegated-allowance",
      policyName: `live-fcc-${now}`,
      owner: account,
      target: account,
      registry: config.contracts.registry,
      vault: config.contracts.vault,
      router: config.contracts.router,
      asset: config.contracts.asset,
      maxPerAction: "100000",
      dailyCap: "150000",
      startAt: (now - 60n).toString(),
      endAt: (now + 86_400n).toString(),
      scheduleIntervalSeconds: "0",
      scheduleGraceSeconds: "0",
      maxOccurrences: "10",
    };
    studioCompilation = null;
    studioIssues = [];
    resetLiveFccPolicySession("Live V1 domain loaded. Review private rules, then validate and compute.");
    studioNotice = "Live A/B/D domain loaded with fresh in-memory entropy. Nothing has been sent yet.";
  } catch {
    liveFccNotice = "Connect the exact V1 operator wallet before preparing the live domain.";
  }
  render();
}

function resetLiveFccPolicySession(notice: string): void {
  liveFccSession = null;
  liveFccPolicyRegistration = null;
  liveFccPolicyStatus = null;
  liveFccRequest = null;
  liveFccEvaluation = null;
  liveFccExecution = null;
  liveFccNotice = notice;
}

async function submitLiveFccCustody(): Promise<void> {
  if (!studioCompilation) return;
  liveFccBusy = "CUSTODY";
  liveFccNotice = "Confirm three owner authorizations. Each binds one independent ciphertext to A, B, or D.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    liveFccSession = await collectLiveCustody(studioCompilation.policy, account, provider, config);
    liveFccPolicyRegistration = null;
    liveFccPolicyStatus = null;
    liveFccRequest = null;
    liveFccEvaluation = null;
    liveFccExecution = null;
    liveFccNotice = "Three distinct registered-machine receipts matched one policy binding. Ciphertexts remain memory-only.";
  } catch {
    liveFccSession = null;
    liveFccNotice = "Live custody failed closed. No policy was registered and no receipt quorum is asserted.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

async function submitLiveFccPolicyRegistration(): Promise<void> {
  if (!liveFccSession) return;
  liveFccBusy = "REGISTER";
  liveFccNotice = "Confirm the exact V1 policy binding and three machine receipts, then wait for finalized readback.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    liveFccPolicyRegistration = await registerLivePolicy(liveFccSession, account, provider, config);
    liveFccPolicyStatus = 1;
    addLiveFccTransaction("Register live FCC policy", liveFccPolicyRegistration);
    liveFccNotice = "Live V1 policy is active on Coston2 with all three registered custody receipts.";
    await refreshCoston2State();
  } catch {
    liveFccPolicyRegistration = null;
    liveFccPolicyStatus = null;
    liveFccNotice = "Live policy registration was rejected or failed finalized verification. No activation is asserted.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

async function submitLiveFccRequest(): Promise<void> {
  if (!liveFccSession || !liveFccPolicyRegistration) return;
  liveFccBusy = "REQUEST";
  liveFccNotice = "Confirm the public amount and target. This transaction contains no policy plaintext or decision.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    const amount = parseFTestXrpAmount(liveFccRequestAmountInput);
    liveFccRequest = await createLiveRequest(liveFccSession, amount, account, provider, config);
    addLiveFccTransaction(`Create live request ${short(liveFccRequest.request.requestId)}`, liveFccRequest);
    liveFccEvaluation = null;
    liveFccExecution = null;
    liveFccNotice = "The request is Pending at finality. No funds are reserved until two matching machine results arrive.";
  } catch {
    liveFccRequest = null;
    liveFccNotice = "Live request creation failed closed. No pending action or authorization is asserted.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

async function submitLiveFccEvaluation(): Promise<void> {
  if (!liveFccRequest) return;
  liveFccBusy = "EVALUATE";
  liveFccNotice = "Sign the request-specific relay authorization. A/B/D then compute independently from their custodied policy.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    liveFccEvaluation = await evaluateLiveRequest(liveFccRequest.request.requestId, account, provider, config);
    if (liveFccEvaluation.transactions.dispatch) addLiveFccTransaction("Dispatch public state to A/B/D", { hash: liveFccEvaluation.transactions.dispatch });
    liveFccEvaluation.transactions.submit.forEach((hash, index) => addLiveFccTransaction(`Submit matching FCC result ${index + 1}`, { hash }));
    liveFccNotice = liveFccEvaluation.decision === "ALLOW"
      ? "Two matching machine signatures moved the router to Allowed. The exact amount is reserved; execution remains separate."
      : `Two matching machine signatures finalized Denied · ${liveFccEvaluation.publicReasonClass}. Vault accounting did not move.`;
    await refreshCoston2State();
  } catch {
    liveFccEvaluation = null;
    liveFccNotice = "Live evaluation failed closed. The browser did not supply or infer any decision.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

async function submitLiveFccExecution(): Promise<void> {
  if (!liveFccRequest) return;
  liveFccBusy = "EXECUTE";
  liveFccNotice = "Confirm execution of the already threshold-authorized public transfer.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    liveFccExecution = await executeLiveRequest(liveFccRequest.request.requestId, account, provider, config);
    addLiveFccTransaction("Execute live authorized transfer", liveFccExecution);
    liveFccNotice = "Execution receipt, router event and finalized terminal state matched.";
    await refreshCoston2State();
  } catch {
    liveFccExecution = null;
    liveFccNotice = "Execution failed closed or was cancelled. No public transfer is asserted.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

async function submitLiveFccGovernance(value: string): Promise<void> {
  if ((value !== "STOP" && value !== "RESUME" && value !== "REVOKE") || !liveFccSession) return;
  liveFccBusy = value;
  liveFccNotice = `Confirm owner ${value.toLowerCase()}. Governance cannot manufacture an FCC result.`;
  render();
  try {
    const { account, config, provider } = liveFccContext();
    const result = await governLivePolicy(value as LivePolicyAction, liveFccSession.binding.policyCommitment, account, provider, config);
    addLiveFccTransaction(`${value} live FCC policy`, result);
    liveFccPolicyStatus = await loadLivePolicyStatus(liveFccSession.binding.policyCommitment, config);
    liveFccNotice = `${value} matched finalized registry state. Machine-threshold authorization remains unchanged.`;
  } catch {
    liveFccNotice = `${value} was rejected, cancelled, or failed finalized verification. No governance change is asserted.`;
  } finally {
    liveFccBusy = "";
    render();
  }
}

function resetLiveFccRequest(): void {
  liveFccRequest = null;
  liveFccEvaluation = null;
  liveFccExecution = null;
  liveFccNotice = "Ready to create the next request from the canonical V1 spend checkpoint.";
  render();
}

function addLiveFccTransaction(label: string, result: { hash: `0x${string}`; blockNumber?: bigint }): void {
  if (!liveFccTransactions.some((item) => item.hash.toLowerCase() === result.hash.toLowerCase())) {
    liveFccTransactions.push({ label, hash: result.hash, ...(result.blockNumber === undefined ? {} : { blockNumber: result.blockNumber }) });
  }
}

function interactiveContext(): { account: Address; config: DemoDomainConfig; provider: NonNullable<typeof walletProvider> } {
  if (walletState.status !== "CONNECTED" || !walletProvider || interactiveConfigState.status !== "READY") {
    throw new Error("INTERACTIVE_DEMO_PREREQUISITE_MISSING");
  }
  return { account: walletState.account, config: interactiveConfigState.config, provider: walletProvider };
}

function prepareInteractiveDraft(): void {
  try {
    const { account, config } = interactiveContext();
    const now = BigInt(Math.floor(Date.now() / 1000));
    studioEntropy = createStudioEntropy();
    studioDraft = {
      ...studioTemplateDraft("delegated-allowance"),
      templateId: "delegated-allowance",
      policyName: `interactive-demo-${now}`,
      owner: account,
      target: account,
      registry: config.registry,
      vault: config.vault,
      router: config.router,
      asset: config.asset,
      maxPerAction: "100000",
      dailyCap: "150000",
      startAt: (now - 60n).toString(),
      endAt: (now + 86_400n).toString(),
      scheduleIntervalSeconds: "0",
      scheduleGraceSeconds: "0",
      maxOccurrences: "10",
    };
    studioCompilation = null;
    studioIssues = [];
    resetInteractivePolicySession("Isolated Coston2 demo domain loaded. Review private rules, then validate and compute.");
    studioNotice = "Simulation-only domain loaded with fresh in-memory entropy. Validate before contacting actors.";
  } catch {
    interactiveNotice = "Connect a Coston2 wallet and wait for the interactive configuration first.";
  }
  render();
}

function resetInteractivePolicySession(notice: string): void {
  interactiveSession = null;
  interactivePolicyRegistration = null;
  interactiveRequest = null;
  interactiveThreshold = null;
  interactiveThresholdTransactions = [];
  interactiveExecution = null;
  interactiveNotice = notice;
}

async function submitInteractiveCustody(): Promise<void> {
  if (!studioCompilation) return;
  interactiveBusy = "CUSTODY";
  interactiveNotice = "Confirm three owner signatures. Each binds one ciphertext to one simulated actor.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    interactiveSession = await collectDemoCustody(studioCompilation.policy, account, provider, config);
    interactivePolicyRegistration = null;
    interactiveRequest = null;
    interactiveThreshold = null;
    interactiveThresholdTransactions = [];
    interactiveExecution = null;
    interactiveNotice = "Three distinct simulation receipts matched the same policy binding. No production custody is claimed.";
  } catch {
    interactiveSession = null;
    interactiveNotice = "Receipt collection failed closed. No policy was registered and no actor result is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractivePolicyRegistration(): Promise<void> {
  if (!interactiveSession) return;
  interactiveBusy = "REGISTER";
  interactiveNotice = "Confirm the exact simulation-only registry transaction, then wait for finalized readback.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    interactivePolicyRegistration = await registerDemoPolicy(interactiveSession, account, provider, config);
    addInteractiveTransaction("Register demo policy", interactivePolicyRegistration);
    interactiveNotice = "Demo policy binding and all three signed receipts are active in the separate Coston2 registry.";
    await refreshInteractiveAccount(false);
  } catch {
    interactivePolicyRegistration = null;
    interactiveNotice = "Policy registration was rejected or could not be verified at finality. No activation is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function refreshInteractiveAccount(showBusy = true): Promise<void> {
  if (showBusy) { interactiveBusy = "READ"; interactiveNotice = "Verifying the separate contract domain and finalized vault conservation…"; render(); }
  try {
    const { account, config } = interactiveContext();
    interactiveAccountSnapshot = await loadDemoAccount(account, config, interactiveSession?.binding.policyCommitment);
    interactiveNotice = `Simulation-only account state verified at finalized block ${interactiveAccountSnapshot.finalizedBlock}.`;
  } catch {
    interactiveAccountSnapshot = null;
    interactiveNotice = "Interactive Coston2 state failed verification. No balance or policy status is asserted.";
  } finally {
    if (showBusy) { interactiveBusy = ""; render(); }
  }
}

async function submitInteractiveVault(kind: "APPROVE" | "DEPOSIT"): Promise<void> {
  interactiveBusy = kind;
  interactiveNotice = `Confirm the exact ${kind.toLowerCase()} transaction for the simulation-only vault.`;
  render();
  try {
    const { account, config, provider } = interactiveContext();
    const amount = parseFTestXrpAmount(interactiveFundInput);
    const result = await executeDemoVaultAction(kind, amount, account, provider, config);
    addInteractiveTransaction(kind === "APPROVE" ? "Approve demo vault" : "Deposit demo vault", result);
    interactiveAccountSnapshot = await loadDemoAccount(account, config, interactiveSession?.binding.policyCommitment);
    interactiveNotice = `${kind} receipt, event, finalized balances, and conservation matched.`;
  } catch {
    interactiveNotice = `${kind} failed closed or was cancelled. No test-token movement is asserted.`;
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractiveRequest(): Promise<void> {
  if (!interactiveSession || !interactivePolicyRegistration) return;
  interactiveBusy = "REQUEST";
  interactiveNotice = "Confirm the public amount/target request. No decision field is part of this transaction.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    const amount = parseFTestXrpAmount(interactiveRequestAmountInput);
    interactiveRequest = await createDemoRequest(interactiveSession, amount, account, provider, config);
    addInteractiveTransaction(`Create request ${short(interactiveRequest.request.requestId)}`, interactiveRequest);
    interactiveThreshold = null;
    interactiveThresholdTransactions = [];
    interactiveExecution = null;
    interactiveNotice = "Public request is Pending at finality. It has not reserved funds and has no decision yet.";
  } catch {
    interactiveRequest = null;
    interactiveNotice = "Request creation failed closed. No pending request or authorization is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractiveEvaluation(): Promise<void> {
  if (!interactiveSession || !interactiveRequest || interactiveConfigState.status !== "READY") return;
  interactiveBusy = "EVALUATE";
  interactiveNotice = "Each simulated actor is independently reloading finalized Coston2 state and evaluating its ciphertext.";
  render();
  try {
    if (!interactivePolicyRegistration) throw new Error("DEMO_POLICY_REGISTRATION_UNAVAILABLE");
    interactiveThreshold = await collectDemoEvaluations(
      interactiveSession,
      interactiveRequest.request,
      interactiveConfigState.config,
      interactivePolicyRegistration.blockNumber,
    );
    interactiveNotice = interactiveThreshold.status === "THRESHOLD_READY"
      ? `Threshold ready: ${interactiveThreshold.matching[0]?.result.decision} · ${interactiveThreshold.matching[0]?.result.publicReasonClass}. The browser verified signatures but did not choose the result.`
      : `Actor result status: ${interactiveThreshold.status}. No chain authorization is available.`;
  } catch {
    interactiveThreshold = null;
    interactiveNotice = "Evaluation failed closed. No actor decision or threshold is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractiveThreshold(): Promise<void> {
  if (!interactiveThreshold) return;
  interactiveBusy = "THRESHOLD";
  interactiveNotice = "Confirm two result submissions. Each carries an actor-computed signed digest; no ALLOW input is exposed.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    interactiveThresholdTransactions = await submitDemoThreshold(interactiveThreshold, account, provider, config);
    interactiveThresholdTransactions.forEach((result, index) => addInteractiveTransaction(`Submit actor result ${index + 1}`, result));
    const decision = interactiveThreshold.matching[0]!.result;
    interactiveNotice = decision.decision === "ALLOW"
      ? "Two matching actor signatures moved the request to Allowed and reserved the exact amount. Execution remains separate."
      : `Two matching actor signatures finalized Denied · ${decision.publicReasonClass}; vault accounting did not move.`;
    await refreshInteractiveAccount(false);
  } catch {
    interactiveThresholdTransactions = [];
    interactiveNotice = "Threshold submission failed or final state did not match. No Allowed/Denied state is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractiveExecution(): Promise<void> {
  if (!interactiveRequest) return;
  interactiveBusy = "EXECUTE";
  interactiveNotice = "Confirm execution of the already threshold-authorized public transfer.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    interactiveExecution = await executeDemoRequest(interactiveRequest.request.requestId, account, provider, config);
    addInteractiveTransaction("Execute public transfer", interactiveExecution);
    interactiveNotice = "Execution receipt, router event, finalized terminal state, and vault accounting matched.";
    await refreshInteractiveAccount(false);
  } catch {
    interactiveExecution = null;
    interactiveNotice = "Execution failed closed or was cancelled. No public transfer is asserted.";
  } finally {
    interactiveBusy = "";
    render();
  }
}

async function submitInteractiveGovernance(value: string): Promise<void> {
  if (value !== "STOP" && value !== "RESUME" && value !== "REVOKE" || !interactiveSession) return;
  interactiveBusy = value;
  interactiveNotice = `Confirm owner ${value.toLowerCase()} for the simulation-only policy. This action cannot supply ALLOW.`;
  render();
  try {
    const { account, config, provider } = interactiveContext();
    const result = await governDemoPolicy(value as DemoPolicyAction, interactiveSession.binding.policyCommitment, account, provider, config);
    addInteractiveTransaction(`${value} demo policy`, result);
    await refreshInteractiveAccount(false);
    interactiveNotice = `${value} matched finalized registry state. Authorization integrity remains actor-threshold-only.`;
  } catch {
    interactiveNotice = `${value} was rejected, cancelled, or failed finalized verification. No governance change is asserted.`;
  } finally {
    interactiveBusy = "";
    render();
  }
}

function resetInteractiveRequest(): void {
  interactiveRequest = null;
  interactiveThreshold = null;
  interactiveThresholdTransactions = [];
  interactiveExecution = null;
  interactiveNotice = "Ready to create the next request from the current canonical spend checkpoint.";
  void refreshInteractiveAccount(false);
  render();
}

function addInteractiveTransaction(label: string, result: DemoTransactionResult): void {
  if (!interactiveTransactions.some((item) => item.hash.toLowerCase() === result.hash.toLowerCase())) {
    interactiveTransactions.push({ label, hash: result.hash, blockNumber: result.blockNumber });
  }
}

function computeStudio(form: HTMLFormElement): void {
  studioDraft = readStudioDraft(form);
  try {
    studioCompilation = compileStudioDraft(studioDraft, studioEntropy);
    studioIssues = [];
    studioNotice = "Local validation passed. No ciphertext, receipt, or activation was submitted.";
    render();
  } catch (error) {
    studioCompilation = null;
    studioIssues = error instanceof StudioValidationError ? error.issues : [{ field: "policy", message: "The policy could not be compiled safely." }];
    studioNotice = "Validation failed locally. Nothing was sent.";
    render();
  }
}

function selectTemplate(value: string): void {
  if (!STUDIO_TEMPLATES.some((template) => template.id === value)) return;
  studioDraft = studioTemplateDraft(value as StudioTemplateId);
  studioEntropy = createStudioEntropy();
  studioCompilation = null;
  studioIssues = [];
  studioNotice = "Template loaded with fresh in-memory salt and submission nonce.";
  resetInteractivePolicySession("Template changed. Compute a fresh policy before collecting simulated receipts.");
  resetLiveFccPolicySession("Template changed. Compute a fresh policy before collecting live FCC receipts.");
  render();
}

function readStudioDraft(form: HTMLFormElement): StudioDraft {
  const data = new FormData(form);
  const value = (field: Exclude<keyof StudioDraft, "templateId">): string => String(data.get(field) ?? "").trim();
  return {
    templateId: studioDraft.templateId,
    policyName: value("policyName"),
    owner: value("owner"),
    registry: value("registry"),
    vault: value("vault"),
    router: value("router"),
    asset: value("asset"),
    target: value("target"),
    maxPerAction: value("maxPerAction"),
    dailyCap: value("dailyCap"),
    startAt: value("startAt"),
    endAt: value("endAt"),
    scheduleIntervalSeconds: value("scheduleIntervalSeconds"),
    scheduleGraceSeconds: value("scheduleGraceSeconds"),
    maxOccurrences: value("maxOccurrences"),
  };
}

render();
if (initialRoute.surface === "landing" && initialRoute.anchor !== "landing") restoreLandingAnchor(initialRoute.anchor);
walletProvider?.on?.("accountsChanged", walletChanged);
walletProvider?.on?.("chainChanged", walletChanged);
void refreshPublicRequest(false).finally(() => restoreWalletSession());
void fetchPublicWebEvidenceIndex()
  .then((index) => { publicEvidenceMirrorState = { status: "READY", index }; if (!landingOpen) render(); })
  .catch(() => { publicEvidenceMirrorState = { status: "UNAVAILABLE", reason: "NOT_PUBLISHED" }; if (!landingOpen) render(); });
void fetchSimulatedLifecycleEvidence()
  .then((evidence) => { demoState = { status: "READY", evidence }; if (!landingOpen) render(); })
  .catch(() => { demoState = { status: "UNAVAILABLE" }; if (!landingOpen) render(); });
void fetchInteractiveDemoConfig()
  .then(async (config) => {
    interactiveConfigState = { status: "READY", config };
    if (walletState.status === "CONNECTED") await refreshInteractiveAccount(false);
    if (!landingOpen) render();
  })
  .catch(() => {
    interactiveConfigState = { status: "UNAVAILABLE" };
    interactiveAccountSnapshot = null;
    if (!landingOpen) render();
  });
void fetchLiveFccConfig()
  .then(async (config) => {
    liveFccConfigState = { status: "READY", config };
    liveFccNotice = "Relay, V1 contracts and registered FCC machines A/B/D passed live preflight.";
    if (liveFccSession) liveFccPolicyStatus = await loadLivePolicyStatus(liveFccSession.binding.policyCommitment, config);
    if (!landingOpen) render();
  })
  .catch(() => {
    liveFccConfigState = { status: "UNAVAILABLE" };
    liveFccNotice = "Hosted FCC relay unavailable. No live readiness or decision is asserted.";
    if (!landingOpen) render();
  });
window.addEventListener("hashchange", syncRouteFromLocation);
window.addEventListener("popstate", syncRouteFromLocation);
