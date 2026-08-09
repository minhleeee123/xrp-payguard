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
import { landingView } from "./landing.js";
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

type View = "overview" | "studio" | "vaults" | "requests" | "payee" | "auditor" | "team";
type PublicEvidenceMirrorState =
  | { status: "LOADING" }
  | { status: "READY"; index: PublicWebEvidenceIndex }
  | { status: "UNAVAILABLE"; reason: "NOT_PUBLISHED" | "INVALID" };
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

let activeView: View = "overview";
let studioNotice = "No policy data has left this browser tab.";
let studioDraft = studioTemplateDraft("personal-recurring");
let studioEntropy = createStudioEntropy();
let studioCompilation: StudioCompilation | null = null;
let studioIssues: readonly StudioIssue[] = [];
let appNotice = "";
let requestState: PublicRequestReadState = unavailableRequestState();
let auditState: PublicAuditReadState = unavailableAuditState();
let custodyState: PublicPolicyCustodyReadState = unavailablePolicyCustodyState();
let payeeState: PublicPayeeReadState = unavailablePayeeState();
let workspaceState: PublicWorkspaceReadState = unavailableWorkspaceState();
let notificationState: PublicNotificationReadState = unavailableNotificationState();
let notificationOpen = false;
let mobileMenuOpen = false;
let landingOpen = window.location.hash === "#landing";
let publicEvidenceMirrorState: PublicEvidenceMirrorState = { status: "LOADING" };
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
      <aside class="sidebar">
        <button class="brand brand-link" type="button" data-action="landing" aria-label="Open PayGuard landing page"><span class="brand-mark">P</span><span>PayGuard</span><span class="brand-beta">TESTNET</span></button>
        <div class="workspace-label">PERSONAL WORKSPACE</div>
        <nav class="primary-nav" aria-label="Primary navigation">
          ${navItem("overview", "Overview", "⌂")}
          ${navItem("studio", "Policy Studio", "◈")}
          ${navItem("vaults", "Vaults", "▣")}
          ${navItem("requests", "Requests", "↗")}
          ${navItem("payee", "Payee", "◍")}
          ${navItem("auditor", "Auditor", "◌")}
          ${navItem("team", "Team & roles", "♧")}
          <button class="nav-item mobile-more" type="button" data-action="mobile-menu" aria-expanded="${mobileMenuOpen}" aria-controls="mobile-secondary-nav"><span class="nav-icon">＋</span>More</button>
        </nav>
        ${mobileMenuOpen ? `<div class="mobile-secondary-nav" id="mobile-secondary-nav" aria-label="Secondary navigation">${navItem("payee", "Payee", "◍")}${navItem("auditor", "Auditor", "◌")}${navItem("team", "Team & roles", "♧")}</div>` : ""}
        <div class="sidebar-bottom">
          ${sidebarNetworkCard()}
          <button class="help-link" type="button" data-action="landing">? <span>How PayGuard works</span></button>
          ${sidebarUserRow()}
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${label(activeView)}</strong></div><div class="top-actions">${networkChip()}<button class="icon-button" type="button" data-action="notifications" aria-label="Notifications" aria-expanded="${notificationOpen}">♢${notificationState.status === "READY" && notificationState.feed.notifications.length > 0 ? '<span class="notification-dot"></span>' : ""}</button><button class="outline-button wallet-button" type="button" data-action="connect">${walletButtonLabel()}</button></div></header>
        ${notificationOpen ? notificationTray() : ""}
        <section class="content">${viewContent()}</section>
        ${appNotice ? `<div class="toast" role="status">${esc(appNotice)}</div>` : ""}
      </main>
    </div>`;
  wireEvents();
}

function navItem(view: View, text: string, icon: string): string {
  return `<button class="nav-item nav-item-${view} ${activeView === view ? "active" : ""}" type="button" data-view="${view}"><span class="nav-icon">${icon}</span>${text}${view === "requests" ? '<span class="nav-count">2</span>' : ""}</button>`;
}

function label(view: View): string { return ({ overview: "Overview", studio: "Policy Studio", vaults: "Vaults", requests: "Requests", payee: "Payee", auditor: "Auditor", team: "Team & roles" })[view]; }

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
  return `<span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>connect</em></span>`;
}

function sidebarNetworkCard(): string {
  if (coston2State.status === "READY") return `<div class="security-card live-card"><span class="status-dot green"></span><div><strong>Verified Coston2 reads</strong><small>Runtime, wiring & asset checked</small></div></div>`;
  if (coston2State.status === "LOADING") return `<div class="security-card"><span class="status-dot amber"></span><div><strong>Checking Coston2</strong><small>Reading one finalized block</small></div></div>`;
  return `<div class="security-card"><span class="status-dot amber"></span><div><strong>Testnet dApp</strong><small>FCC authorization remains simulated</small></div></div>`;
}

function sidebarUserRow(): string {
  const account = connectedAccount();
  const label = walletState.status === "WRONG_CHAIN" ? "Switch to Coston2" : account ? short(account) : "Wallet not connected";
  return `<div class="user-row"><div class="avatar">${account ? account.slice(2, 4).toUpperCase() : "—"}</div><div><strong>Owner</strong><small>${esc(label)}</small></div><span class="more">···</span></div>`;
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
  if (activeView === "payee") return payeeView();
  if (activeView === "auditor") return auditorView();
  if (activeView === "team") return teamView();
  return overviewView();
}

function pageIntro(eyebrow: string, title: string, copy: string, action = ""): string {
  const actionLabels: Record<string, string> = { "new-policy": "Open Policy Studio", deposit: "Connect wallet", "new-request": "New request", invite: "Invite teammate" };
  return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${action ? `<button class="primary-button" type="button" data-action="${action}">${actionLabels[action] ?? action}</button>` : ""}</div>`;
}

function overviewView(): string {
  const live = liveSnapshot();
  const account = connectedAccount();
  const notice = live
    ? `<div class="notice-banner live-notice"><span class="notice-icon">✓</span><div><strong>Finalized Coston2 account state verified</strong><span>Runtime bytecode, router/vault wiring, supported FTestXRP and conservation were checked together at block ${live.finalizedBlock}.</span></div><button type="button" data-action="refresh">Refresh</button></div>`
    : account
      ? `<div class="notice-banner"><span class="notice-icon">◉</span><div><strong>${coston2State.status === "LOADING" ? "Reading finalized Coston2 state" : "Finalized Coston2 state unavailable"}</strong><span>${coston2State.status === "UNAVAILABLE" ? esc(coston2State.message) : "The public account is connected; no balance is asserted until every live check passes."}</span></div><button type="button" data-action="refresh">Retry</button></div>`
      : `<div class="notice-banner"><span class="notice-icon">◉</span><div><strong>Connect a Coston2 wallet</strong><span>Wallet access enables public balance and vault reads. FCC policy authorization remains explicitly simulated.</span></div><button type="button" data-action="connect">Connect</button></div>`;
  return `${pageIntro("PERSONAL PAYGUARD", "Your testnet control center.", "Use real Coston2 account and vault state while private authorization remains separated from the browser.", "new-policy")}
    ${notice}
    <div class="metric-grid"><div class="metric-card"><div class="metric-label">VAULT AVAILABLE <span class="public-pill">PUBLIC</span></div><div class="metric-value">${live ? token(live.accounting.available) : "—"} <small>FTestXRP</small></div><div class="metric-foot muted">${live ? `${token(live.tokenBalance)} in connected wallet` : account ? "Live verification unavailable" : "Connect wallet for finalized read"}</div></div><div class="metric-card"><div class="metric-label">RESERVED <span class="public-pill">PUBLIC</span></div><div class="metric-value">${live ? token(live.accounting.reserved) : "—"}</div><div class="metric-foot muted">${live ? "Verified vault accounting" : "Pending state unavailable"}</div></div><div class="metric-card"><div class="metric-label">C2FLR GAS</div><div class="metric-value">${live ? nativeToken(live.nativeBalance) : "—"}</div><div class="metric-foot"><span class="status-dot ${live ? "green" : "amber"}"></span> ${account ? "Wallet connected" : "Wallet not connected"}</div></div><div class="metric-card accent-card"><div class="metric-label">FINALIZED BLOCK</div><div class="metric-value">${live ? live.finalizedBlock : "—"}</div><div class="metric-foot muted">${live ? "All reads pinned to this block" : "No public checkpoint loaded"}</div></div></div>
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
      <div class="two-col">${studioField("startAt", "Starts at (UTC epoch)", "Private policy window.", "numeric")}${studioField("endAt", "Ends at (UTC epoch)", "Private policy window.", "numeric")}</div>
      <div class="three-col">${studioField("scheduleIntervalSeconds", "Interval seconds", "0 selects ad-hoc mode.", "numeric")}${studioField("scheduleGraceSeconds", "Grace seconds", "0 only in ad-hoc mode.", "numeric")}${studioField("maxOccurrences", "Occurrence limit", "0 means no policy-specific limit.", "numeric")}</div>
      <details class="domain-details"><summary>Exact public contract domain <span>local example · not verified</span></summary><p>These values bind the commitment. Replace them only with addresses resolved from a future verified PayGuard release.</p><div class="two-col">${studioField("registry", "Policy registry", "Public domain field.", "text")}${studioField("vault", "Vault", "Public domain field.", "text")}${studioField("router", "Action router", "Public domain field.", "text")}${studioField("asset", "Supported asset", "Public token address.", "text")}</div></details>
      <div class="form-divider"></div><div class="private-row"><span class="lock-icon">▣</span><div><strong>Confidential draft only</strong><small>The target rule, caps, schedule and fresh cryptographic salt/nonce remain in memory. No browser storage, logs, analytics, public calldata or evidence receives them.</small></div><span class="state-tag gray-tag">IN MEMORY</span></div><div class="form-actions"><span class="form-note" id="studio-notice">${esc(studioNotice)}</span><button class="primary-button" type="submit">Validate & compute ↗</button></div></form>
      <aside class="studio-side">${studioPreview()}${studioCustodyPanel()}<section class="privacy-note"><span>✦</span><div><strong>Refresh discards the draft</strong><p>Policy plaintext and ciphertext are never placed in browser persistence. A refresh intentionally cannot recover this draft.</p></div></section></aside></div>`;
}

function studioCustodyPanel(): string {
  const available = custodyState.status === "READY";
  const count = available ? custodyState.bundle.receipts.length : 0;
  const rows = available
    ? custodyState.bundle.receipts.map((receipt, index) => `<div class="receipt-row"><span class="machine-index">0${index + 1}</span><div><strong>${esc(short(receipt.machineId))}</strong><small>Signed receipt · ${esc(short(receipt.digest))}</small></div><span class="state-tag green-tag">VERIFIED</span></div>`).join("")
    : [1, 2, 3].map((number) => `<div class="receipt-row"><span class="machine-index">0${number}</span><div><strong>FCC machine ${number}</strong><small>${esc(custodyUnavailableReason(custodyState.reason))}</small></div><span class="state-tag gray-tag">UNAVAILABLE</span></div>`).join("");
  return `<section class="panel receipt-card"><div class="eyebrow">CUSTODY RECEIPTS</div><h3>Activation progress</h3><div class="receipt-count">${count} <span>/ 3 verified</span></div>${rows}<div class="activation-block"><span class="status-dot ${available ? "green" : "amber"}"></span><div><strong>${available ? "Ready for public activation" : "Activation blocked"}</strong><small>${available ? "All three machine signatures match the frozen binding. The browser still cannot supply an authorization result." : "All three exact machine receipts are required. This UI never substitutes a local receipt."}</small></div></div></section>`;
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
  return `<label class="studio-field ${issue ? "field-error" : ""}">${esc(labelText)}<input name="${field}" value="${esc(studioDraft[field])}" ${inputMode === "numeric" ? 'inputmode="numeric"' : 'spellcheck="false"'} autocomplete="off" aria-invalid="${Boolean(issue)}" />${issue ? `<span class="field-message">${esc(issue.message)}</span>` : `<small>${esc(hint)}</small>`}</label>`;
}

function studioPreview(): string {
  const commitment = studioCompilation?.publicEvidence.policyCommitment ?? "Not computed";
  return `<section class="panel commitment-card"><div class="eyebrow">DOMAIN-BOUND COMMITMENT</div><div class="commitment-value" id="commitment-value">${esc(commitment)}</div><small>${studioCompilation ? "Validated locally · not registered" : "Validate the in-memory draft to compute"}</small><div class="commitment-state"><span class="status-dot amber"></span> Coston2 deployment remains unverified</div></section>
    <section class="panel boundary-card"><div class="eyebrow">EXACT DATA MAP</div><h3>Public versus private</h3>${studioCompilation ? `${previewGroup("Public at activation", studioCompilation.publicAtActivation, "public")} ${previewGroup("Public at request", studioCompilation.publicAtRequest, "request")} ${previewGroup("Private in FCC", studioCompilation.privateInFcc, "private")}` : `<p class="boundary-empty">Compute the draft to inspect every policy field by when and where it becomes visible.</p>`}</section>`;
}

function previewGroup(title: string, items: readonly PreviewItem[], kind: "public" | "request" | "private"): string {
  return `<details class="preview-group" ${kind === "public" ? "open" : ""}><summary><span class="visibility-dot ${kind}"></span>${esc(title)} <b>${items.length}</b></summary><dl>${items.map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join("")}</dl></details>`;
}

function vaultsView(): string {
  const live = liveSnapshot();
  const account = connectedAccount();
  return `${pageIntro("PUBLIC ASSET VAULTS", "Your Coston2 vault", "Read one finalized public checkpoint before approving, depositing, or withdrawing test tokens.")}
    <div class="vault-card panel"><div class="vault-card-top"><div class="token-symbol">X</div><div><h2>FTestXRP vault</h2><span class="muted">${account ? esc(short(account)) : "Public asset · Coston2"}</span></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "LIVE READ" : account ? "READ BLOCKED" : "CONNECT"}</span></div><div class="vault-balance"><span>Available in vault</span><strong>${live ? token(live.accounting.available) : "—"} <small>FTestXRP</small></strong><span class="muted">${live ? `Finalized block ${live.finalizedBlock}` : account ? "Live verification must pass before balances appear" : "Connect an injected wallet to read account state"}</span></div><div class="vault-stats"><div><span>Deposited</span><strong>${live ? token(live.accounting.deposited) : "—"}</strong></div><div><span>Reserved</span><strong>${live ? token(live.accounting.reserved) : "—"}</strong></div><div><span>Spent</span><strong>${live ? token(live.accounting.spent) : "—"}</strong></div><div><span>Withdrawn</span><strong>${live ? token(live.accounting.withdrawn) : "—"}</strong></div></div><div class="vault-public-state"><div><span>Conservation</span><strong>${live ? "Verified at finalized block" : "Waiting for Coston2"}</strong></div><div><span>Wallet balance</span><strong>${live ? `${token(live.tokenBalance)} FTestXRP` : "—"}</strong></div><div><span>Vault allowance</span><strong>${live ? `${token(live.vaultAllowance)} FTestXRP` : "—"}</strong></div><div><span>Contract runtime</span><strong>${live ? "Verified against deployment evidence" : "—"}</strong></div></div><div class="vault-actions"><button class="primary-button" type="button" data-action="${account ? "refresh" : "connect"}">${live ? "Refresh finalized state" : account ? "Retry finalized reads" : "Connect Coston2 wallet"}</button>${live ? `<a class="outline-button inline-link" href="${explorerAddress(PAYGUARD_COSTON2.vault)}" target="_blank" rel="noreferrer">Vault explorer ↗</a>` : `<button class="outline-button" type="button" data-action="details">How funding works</button>`}</div></div>${vaultTransactionPanel(live, account)}<div class="section-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">EVM TESTNET PATH</div><h2>Wallet → PayGuardVault</h2></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "TRANSACTIONS READY" : account ? "READ BLOCKED" : "CONNECT"}</span></div><div class="step-list"><div class="step-row"><span class="step-number">01</span><div><strong>Verify Coston2 and deployment</strong><small>Chain 114, finalized block, runtime hashes and wiring</small></div></div><div class="step-row"><span class="step-number">02</span><div><strong>Approve exact FTestXRP amount</strong><small>Wallet confirmation required; no private key enters PayGuard</small></div></div><div class="step-row"><span class="step-number">03</span><div><strong>Deposit or withdraw</strong><small>Receipt event and finalized postcondition must match exactly</small></div></div></div><p class="panel-copy phase-note">Only testnet FTestXRP is supported. FCC authorization and recurring execution remain separate from these public vault controls.</p></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">XRPL-NATIVE PATH</div><h2>XRPL → FDC → Flare</h2></div><span class="state-tag gray-tag">EVIDENCE</span></div><p class="panel-copy">The flagship Smart Account funding path has a reviewed public observation. Interactive XRPL signing remains separate from this EVM recovery/developer path.</p><a class="text-button inline-link" href="/evidence/coston2/xrp-fdc-smart-account-funding-2026-08-09.json" target="_blank" rel="noreferrer">Open funding evidence ↗</a></section></div>`;
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
  const requestCell = snapshot ? `<strong>${esc(short(snapshot.requestId))}</strong><small>Occurrence ${snapshot.occurrence} · nonce ${snapshot.requestNonce}</small>` : `<strong>—</strong><small>No verified request ID</small>`;
  const actionCell = snapshot ? `<strong>${esc(short(snapshot.target))}</strong><small>${token(snapshot.amount)} FTestXRP · public transfer</small>` : `<strong>—</strong><small>Target and amount unavailable</small>`;
  const checkpointCell = snapshot ? `<strong>${esc(short(snapshot.spendCheckpoint))}</strong><small>${snapshot.scheduleSlot > 0n ? `Slot ${snapshot.scheduleSlot}` : "Ad-hoc"} · expires ${utc(snapshot.expiry)}</small>` : `<strong>—</strong><small>Waiting for RPC</small>`;
  const publicState = snapshot
    ? `<div class="request-public-state"><div><span>Readiness</span><strong>${readiness}</strong></div><div><span>Decision evidence</span><strong>${snapshot.decision === "PENDING" ? "Waiting for threshold" : snapshot.decision === "ALLOW" ? "Threshold ALLOW · public" : `DENY · ${snapshot.publicReasonClass ?? "UNKNOWN"}`}</strong></div><div><span>Attempt</span><strong>${snapshot.attempt}</strong></div><div><span>Checkpoint</span><strong class="mono-value">${esc(short(snapshot.requestHash))}</strong></div></div>`
    : `<div class="request-public-state"><div><span>Readiness</span><strong>Unavailable</strong></div><div><span>Decision evidence</span><strong>No chain result</strong></div><div><span>Attempt</span><strong>—</strong></div><div><span>Checkpoint</span><strong>—</strong></div></div>`;
  return `${pageIntro("PUBLIC REQUEST QUEUE", "Requests & schedules", "Load any canonical request directly from the finalized Coston2 router. No wallet is required to inspect public state.")}
    ${requestLookup()}
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACTION REQUEST</div><h2>${snapshot ? "Public request state" : requestLoading ? "Reading finalized state…" : "No verified request loaded"}</h2></div><div class="table-tools"><button class="icon-button" type="button" data-action="load-request" aria-label="Refresh request">↻</button></div></div><div class="request-table"><div class="table-head"><span>REQUEST</span><span>PUBLIC ACTION</span><span>CHECKPOINT</span><span>STATUS</span><span></span></div><div class="table-row"><span>${requestCell}</span><span>${actionCell}</span><span>${checkpointCell}</span><span><span class="state-tag ${snapshot ? (liveReadiness === "READY_TO_EXECUTE" ? "green-tag" : "gray-tag") : "amber-tag"}">${esc(readiness)}</span></span><span>···</span></div></div>${publicState}<div class="table-footer"><span>Showing public finalized state only</span><span class="muted">${requestFinalizedBlock ? `Coston2 block ${requestFinalizedBlock}` : esc(unavailableReason)} · no browser cache</span></div></section>${requestTransactionPanel(snapshot)}<div class="recovery-strip"><div class="recovery-icon">↻</div><div><strong>Fresh-process recovery is built in</strong><p>A relay restart reconstructs work from chain checkpoints, not a private policy database.</p></div><button class="text-button" type="button" data-action="details">See checkpoint model ↗</button></div>`;
}

function requestLookup(): string {
  return `<section class="panel request-lookup"><div><div class="eyebrow">FINALIZED ROUTER LOOKUP</div><h2>Inspect a request ID</h2><p class="panel-copy">The prefilled ID is the reviewed XRPL/FDC-triggered Coston2 request. Paste another bytes32 request ID to inspect it without a wallet.</p></div><label>Request ID<input id="request-id" value="${esc(requestInput)}" autocomplete="off" spellcheck="false" placeholder="0x…" /></label><button class="primary-button" type="button" data-action="load-request" ${requestLoading ? "disabled" : ""}>${requestLoading ? "Reading finalized block…" : "Load public state"}</button><small>${esc(requestNotice)}</small></section>`;
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
  const expectedPanel = receipt
    ? `<h2>${receipt.status === "SETTLED" ? "Payment settled" : "Expected payment"}</h2><p class="panel-copy">The payee sees only the public amount, destination, timing window, and settlement checkpoint. Private policy rules remain outside this receipt.</p><div class="request-public-state payee-public-state"><div><span>Amount</span><strong>${token(receipt.expectedAmount)} FTestXRP</strong></div><div><span>Target</span><strong class="mono-value">${esc(short(receipt.payee))}</strong></div><div><span>Expected at</span><strong>${utc(receipt.expectedAt)}</strong></div><div><span>Expiry</span><strong>${utc(receipt.expiry)}</strong></div></div><div class="unavailable-box"><span class="status-dot ${receipt.status === "SETTLED" ? "green" : ""}"></span><div><strong>${receipt.status}</strong><small>${receipt.status === "SETTLED" ? `Transaction ${esc(short(receipt.settlementTransactionHash))} · checkpoint ${esc(short(receipt.settlementCheckpoint))}` : `Finalized request ${esc(short(receipt.requestId))} · policy details remain private.`}</small></div></div>`
    : `<h2>No verified request yet</h2><p class="panel-copy">A payee can inspect only a finalized public request, transfer receipt, and supported redemption status. Policy rules, caps, delegates, and private denial reasons stay in FCC custody.</p><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Public request endpoint unavailable</strong><small>${esc(unavailableReason)}. No amount, recipient, timing, or transaction is asserted in this local preview.</small></div></div>`;
  return `${pageIntro("PUBLIC SETTLEMENT VIEW", "Payee status", "See the expected public amount, timing, and settlement receipt without learning the private policy behind the request.")}
    ${requestLookup()}
    <div class="section-grid"><section class="panel"><div class="eyebrow">EXPECTED PAYMENT</div>${expectedPanel}</section><section class="panel"><div class="eyebrow">WHAT REMAINS PRIVATE</div><h2>Policy boundary</h2><ul class="evidence-list"><li><span class="evidence-icon">▣</span><div><strong>Target groups</strong><small>Not exposed to the payee</small></div><span class="state-tag gray-tag">PRIVATE</span></li><li><span class="evidence-icon">#</span><div><strong>Caps and schedules</strong><small>Only request timing is public</small></div><span class="state-tag gray-tag">PRIVATE</span></li><li><span class="evidence-icon">↗</span><div><strong>Settlement receipt</strong><small>Appears only after finalized public evidence</small></div><span class="state-tag gray-tag">WAITING</span></li></ul></section></div>`;
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
  const workspaceReason = workspaceState.status === "UNAVAILABLE" ? workspaceUnavailableReason(workspaceState.reason) : "Finalized public role registry";
  const roleRows = workspace
    ? workspace.roles.map((assignment) => `<div class="role-row"><div class="avatar dashed">◌</div><div class="role-person"><strong>${esc(assignment.role)}</strong><small>${esc(short(assignment.account))} · ${assignment.active ? "Active assignment" : "Inactive assignment"}</small></div><span class="role-permission">Public role only</span></div>`).join("")
    : `<div class="role-row"><div class="avatar purple">O</div><div class="role-person"><strong>Owner</strong><small>Local preview · policy author · funder · emergency recovery</small></div><span class="role-permission">Full public controls</span><button class="text-button" type="button">···</button></div><div class="role-row muted-row"><div class="avatar dashed">+</div><div class="role-person"><strong>Invite a teammate</strong><small>Auditor, payee, or delegated executor</small></div><button class="outline-button" type="button" data-action="invite">Invite</button></div>`;
  return `${pageIntro("ROLES & GOVERNANCE", "Team workspace", "Separate policy author, funder, executor, payee, and auditor responsibilities. No role can supply an authorization result.", "invite")}
    <section class="panel roles-panel"><div class="panel-heading"><div><div class="eyebrow">CURRENT WORKSPACE</div><h2>Personal workspace</h2></div><span class="state-tag ${workspace ? "green-tag" : "gray-tag"}">${workspace ? "VERIFIED" : "LOCAL ONLY"}</span></div>${roleRows}</section><div class="team-note"><span class="lock-icon">▣</span><div><strong>${workspace ? "Public role registry verified" : "Role registry unavailable"}</strong><p>${esc(workspaceReason)}. Role assignments can expose public controls only; no role supplies, overrides, or infers an authorization result.</p></div></div>`;
}

function notificationTray(): string {
  if (notificationState.status === "UNAVAILABLE") {
    return `<aside class="notification-tray panel" role="status"><div class="panel-heading"><div><div class="eyebrow">PUBLIC NOTIFICATIONS</div><h2>Feed unavailable</h2></div><button class="icon-button" type="button" data-action="notifications" aria-label="Close notifications">×</button></div><p class="panel-copy">${esc(notificationUnavailableReason(notificationState.reason))}. This preview never invents request, funding, or execution events.</p><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No public checkpoint feed</strong><small>Only finalized public facts may enter notifications. Policy plaintext, ciphertext, signatures, and private reasons are excluded.</small></div></div><button class="outline-button notification-export" type="button" data-action="export-notifications">Export unavailable report</button></aside>`;
  }
  const rows = notificationState.feed.notifications.length === 0
    ? `<div class="empty-state notification-empty"><strong>No verified events</strong><span>The feed is finalized but contains no public events.</span></div>`
    : `<ul class="notification-list">${notificationState.feed.notifications.map((item) => `<li><span class="evidence-icon">${item.severity === "WARNING" ? "!" : "·"}</span><div><strong>${esc(notificationLabel(item.kind))}</strong><small>Block ${item.blockNumber} · ${item.observedAt}</small></div><span class="state-tag ${item.severity === "WARNING" ? "amber-tag" : "green-tag"}">${item.severity}</span></li>`).join("")}</ul>`;
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
  app.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view as View; mobileMenuOpen = false; render(); }));
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
  const form = app.querySelector<HTMLFormElement>("#studio-form");
  form?.addEventListener("submit", (event) => { event.preventDefault(); computeStudio(form); });
  form?.addEventListener("input", () => {
    studioDraft = readStudioDraft(form);
    if (studioCompilation) {
      studioCompilation = null;
      const value = app.querySelector<HTMLElement>("#commitment-value");
      if (value) value.textContent = "Draft changed — recompute";
      const notice = app.querySelector<HTMLElement>("#studio-notice");
      if (notice) notice.textContent = "Draft changed. The previous commitment is no longer current.";
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
  if (action === "new-policy") { activeView = "studio"; render(); return; }
  if (action === "landing") { window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#landing`); landingOpen = true; mobileMenuOpen = false; render(); return; }
  if (action === "open-app") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); landingOpen = false; activeView = "overview"; render(); return; }
  if (action === "landing-studio") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); landingOpen = false; activeView = "studio"; render(); return; }
  if (action === "landing-auditor") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); landingOpen = false; activeView = "auditor"; render(); return; }
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
  if (action === "verify") appNotice = "Live evidence is unavailable; the static mirror cannot assert a transaction, proof, signer, or authorization result.";
  else if (action === "details") appNotice = "This preview reports only finalized public checkpoints; live dependencies are not configured.";
  else if (action === "help") appNotice = "PayGuard keeps policy rules in FCC custody while public requests and settlement remain visible.";
  else appNotice = "This action remains planned for a verified PayGuard release.";
  render();
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
    appNotice = "Review the exact public router transition below. The wallet has not opened yet.";
  } catch (error) {
    const message = error instanceof RequestTransactionError
      ? requestTransactionFailureMessage(error.reason) : "The router action could not be prepared safely.";
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message };
    appNotice = message;
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
  appNotice = "Confirm the exact Coston2 router call in your wallet, then wait for finalized state verification.";
  render();
  try {
    const result = await executeRequestTransaction(kind, requestInput, account, walletProvider);
    if (connectedAccount()?.toLowerCase() !== account.toLowerCase()) throw new RequestTransactionError("POSTCONDITION_FAILED");
    requestState = result.after.request;
    payeeState = result.after.payee;
    requestFinalizedBlock = result.after.finalizedBlock;
    requestFinalizedAt = result.after.finalizedAt;
    requestPolicyOwner = result.after.policyOwner;
    requestIntent = null;
    requestTransactionState = { status: "SUCCESS", kind, hash: result.hash, blockNumber: result.blockNumber };
    requestNotice = `${kind} verified in finalized Coston2 state at block ${result.after.finalizedBlock}.`;
    appNotice = `${kind} receipt, exact router event, and finalized request state matched.`;
  } catch (error) {
    const message = error instanceof RequestTransactionError
      ? requestTransactionFailureMessage(error.reason) : "The router transaction could not be verified safely.";
    requestIntent = null;
    requestTransactionState = { status: "ERROR", message };
    appNotice = message;
  }
  render();
}

async function refreshPublicRequest(): Promise<void> {
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
    requestNotice = `Canonical public state verified at Coston2 block ${result.finalizedBlock}.`;
    appNotice = "Request runtime, wiring, domain, request hash and finalized state matched the deployed Coston2 router.";
  } catch {
    if (sequence !== requestReadSequence) return;
    requestState = unavailableRequestState("SNAPSHOT_INVALID");
    payeeState = unavailablePayeeState("RECEIPT_INVALID");
    requestFinalizedAt = null;
    requestPolicyOwner = null;
    requestNotice = "The request was not found or failed finalized runtime/domain/schema validation.";
    appNotice = "No request fact is being asserted because the finalized lookup failed closed.";
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
    appNotice = "Review the exact testnet intent below. The wallet has not opened yet.";
  } catch (error) {
    const message = error instanceof VaultTransactionError
      ? vaultTransactionFailureMessage(error.reason)
      : "The vault intent could not be prepared safely.";
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message };
    appNotice = message;
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
  appNotice = "Confirm the exact Coston2 transaction in your wallet, then wait for finalized postcondition checks.";
  render();
  try {
    const result = await executeVaultTransaction(intent.kind, intent.amount, account, walletProvider);
    if (connectedAccount()?.toLowerCase() !== account.toLowerCase()) throw new VaultTransactionError("POSTCONDITION_FAILED");
    coston2State = { status: "READY", snapshot: result.after };
    vaultIntent = null;
    vaultTransactionState = { status: "SUCCESS", kind: result.kind, amount: result.amount, hash: result.hash, blockNumber: result.blockNumber };
    appNotice = `${result.kind} finalized at Coston2 block ${result.blockNumber}; receipt, event and account postconditions matched.`;
  } catch (error) {
    const message = error instanceof VaultTransactionError
      ? vaultTransactionFailureMessage(error.reason)
      : "The transaction could not be verified safely.";
    vaultIntent = null;
    vaultTransactionState = { status: "ERROR", message };
    appNotice = message;
    if (walletState.status === "CONNECTED") void refreshCoston2State();
  }
  render();
}

async function connectWallet(): Promise<void> {
  walletState = { status: "CONNECTING" };
  coston2State = { status: "IDLE" };
  appNotice = "Approve public account access and Flare Coston2 in your wallet. PayGuard never requests a private key.";
  render();
  try {
    const session = await connectCoston2Wallet(walletProvider);
    walletState = { status: "CONNECTED", account: session.account };
    appNotice = `Connected ${short(session.account)} on Coston2. Verifying finalized public state…`;
    render();
    await refreshCoston2State();
  } catch (error) {
    const message = error instanceof WalletConnectionError
      ? walletFailureMessage(error.reason)
      : "Wallet connection failed safely.";
    walletState = { status: "ERROR", message };
    coston2State = { status: "IDLE" };
    appNotice = message;
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
  appNotice = "Reading runtime, wiring, asset, balance and vault accounting at one finalized Coston2 block…";
  render();
  try {
    const snapshot = await loadCoston2AccountSnapshot(account);
    if (sequence !== liveReadSequence || connectedAccount()?.toLowerCase() !== account.toLowerCase()) return;
    coston2State = { status: "READY", snapshot };
    appNotice = `Verified finalized Coston2 block ${snapshot.finalizedBlock}. No transaction was signed.`;
  } catch (error) {
    if (sequence !== liveReadSequence) return;
    const message = coston2ReadFailureMessage(error);
    coston2State = { status: "UNAVAILABLE", message };
    appNotice = `${message} Reads failed closed; no balance or contract state is being asserted.`;
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
  appNotice = "Wallet account or network changed. Revalidating the public session…";
  vaultIntent = null;
  vaultTransactionState = { status: "IDLE" };
  requestIntent = null;
  requestTransactionState = { status: "IDLE" };
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
  appNotice = exported.status === "AVAILABLE" ? "Exported finalized public notifications; no private payload included." : "Exported an unavailable public-feed report; no event was asserted.";
  render();
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
walletProvider?.on?.("accountsChanged", walletChanged);
walletProvider?.on?.("chainChanged", walletChanged);
void refreshPublicRequest().finally(() => restoreWalletSession());
void fetchPublicWebEvidenceIndex()
  .then((index) => { publicEvidenceMirrorState = { status: "READY", index }; if (!landingOpen) render(); })
  .catch(() => { publicEvidenceMirrorState = { status: "UNAVAILABLE", reason: "NOT_PUBLISHED" }; if (!landingOpen) render(); });
window.addEventListener("hashchange", () => {
  landingOpen = window.location.hash === "#landing";
  render();
});
