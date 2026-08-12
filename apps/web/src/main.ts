import "./styles.css";
import "./studio.css";
import {
  unavailableAuditState,
  unavailablePolicyCustodyState,
  unavailableNotificationState,
  unavailablePayeeState,
  unavailableRequestState,
  buildPublicNotificationExport,
  buildUnavailableNotificationExport,
  encodePublicNotificationExport,
  type PublicAuditReadState,
  type PublicPolicyCustodyReadState,
  type PublicNotificationReadState,
  type PublicPayeeReadState,
  type PublicRequestReadState,
  type PublicRequestSnapshotV1,
} from "@xrp-payguard/integrations";
import { formatEther, formatUnits, getAddress, type Address, type Hex } from "viem";
import {
  STUDIO_TEMPLATES,
  StudioValidationError,
  compileStudioDraft,
  createStudioEntropy,
  studioTemplateDraft,
  validateStudioDraft,
  type PreviewItem,
  type StudioCompilation,
  type StudioDraft,
  type StudioIssue,
  type StudioTemplateId,
} from "./model.js";
import { fetchPublicWebEvidenceIndex, type PublicWebEvidenceIndex } from "./web-evidence.js";
import { fetchSimulatedLifecycleEvidence, type SimulatedLifecycleEvidence } from "./demo-evidence.js";
import { fetchLiveV2LifecycleEvidence, type LiveV2LifecycleEvidence } from "./live-lifecycle-evidence.js";
import { landingView } from "./landing.js";
import { appViewHash, durationHint, parseAppRoute, requestStateLabels, unixTimeHint, type View } from "./ui-state.js";
import {
  collectDemoCustody,
  collectDemoEvaluations,
  createDemoRequest,
  executeDemoRequest,
  executeDemoVaultAction,
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
  createDelegatedLiveRequest,
  evaluateLiveRequest,
  executeLiveRequest,
  fetchLiveFccConfig,
  governLivePolicy,
  loadLivePolicy,
  loadLivePolicyStatus,
  registerLivePolicy,
  type LiveEvaluationResult,
  type LiveFccConfig,
  type LivePolicyAction,
  type LivePolicyRead,
  type LivePolicySession,
  type LiveRequestResult,
  type LiveTransactionResult,
} from "./live-fcc.js";
import {
  COSTON2_CHAIN,
  PAYGUARD_COSTON2,
  REVIEWED_REQUEST_EXAMPLES,
  REVIEWED_V2_REQUEST_ID,
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
  planVaultUserAction,
  readWalletSession,
  requestTransactionFailureMessage,
  validateRequestTransaction,
  vaultTransactionFailureMessage,
  walletFailureMessage,
  type Coston2AccountSnapshot,
  type RequestTransactionKind,
  type VaultTransactionKind,
  type VaultUserAction,
} from "./coston2.js";

const COSTON2_FAUCET = "https://faucet.flare.network";
type PublicEvidenceMirrorState =
  | { status: "LOADING" }
  | { status: "READY"; index: PublicWebEvidenceIndex }
  | { status: "UNAVAILABLE"; reason: "NOT_PUBLISHED" | "INVALID" };
type DemoUiState = { status: "LOADING" } | { status: "READY"; evidence: SimulatedLifecycleEvidence } | { status: "UNAVAILABLE" };
type LiveV2EvidenceUiState = { status: "LOADING" } | { status: "READY"; evidence: LiveV2LifecycleEvidence } | { status: "UNAVAILABLE" };
type InteractiveConfigUiState = { status: "LOADING" } | { status: "READY"; config: DemoDomainConfig } | { status: "UNAVAILABLE" };
type LiveFccConfigUiState = { status: "LOADING" } | { status: "READY"; config: LiveFccConfig } | { status: "UNAVAILABLE" };
type StudioStep = 1 | 2 | 3 | 4;
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
  | { status: "SUBMITTING"; action: VaultUserAction; phase: VaultTransactionKind; amount: bigint }
  | { status: "SUCCESS"; action: VaultUserAction; amount: bigint; transactions: readonly VaultTransactionSummary[] }
  | { status: "ERROR"; message: string; transactions?: readonly VaultTransactionSummary[] };
type VaultTransactionSummary = { kind: VaultTransactionKind; hash: `0x${string}`; blockNumber: bigint };
type RequestsMode = "CREATE" | "INSPECT";
type RequestTransactionUiState =
  | { status: "IDLE" }
  | { status: "SUBMITTING"; kind: RequestTransactionKind }
  | { status: "SUCCESS"; kind: RequestTransactionKind; hash: `0x${string}`; blockNumber: bigint }
  | { status: "ERROR"; message: string };

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("PayGuard root missing");
const app = appElement;
const initialRoute = parseAppRoute(window.location.hash);

let activeView: View = initialRoute.surface === "app" ? initialRoute.view : "demo";
let studioNotice = "No policy data has left this browser tab.";
let studioDraft = studioTemplateDraft("personal-recurring");
let studioStep: StudioStep = 1;
let studioTemplateChosen = false;
let studioRulesReviewed = false;
let studioScrollHandler: (() => void) | null = null;
let studioScrollFrame: number | null = null;
let studioEntropy = createStudioEntropy();
let studioCompilation: StudioCompilation | null = null;
let studioIssues: readonly StudioIssue[] = [];
let appNotice = "";
let appNoticeTimer: number | undefined;
let requestState: PublicRequestReadState = unavailableRequestState();
let auditState: PublicAuditReadState = unavailableAuditState();
let custodyState: PublicPolicyCustodyReadState = unavailablePolicyCustodyState();
let payeeState: PublicPayeeReadState = unavailablePayeeState();
let notificationState: PublicNotificationReadState = unavailableNotificationState();
let notificationOpen = false;
let mobileMenuOpen = false;
let landingOpen = initialRoute.surface === "landing";
let publicEvidenceMirrorState: PublicEvidenceMirrorState = { status: "LOADING" };
let demoState: DemoUiState = { status: "LOADING" };
let liveV2EvidenceState: LiveV2EvidenceUiState = { status: "LOADING" };
let interactiveConfigState: InteractiveConfigUiState = { status: "UNAVAILABLE" };
let interactiveStudioCompilation: StudioCompilation | null = null;
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
let delegatedPolicyInput = "";
let delegatedTargetInput = "";
let delegatedPolicyRead: LivePolicyRead | null = null;
let delegatedPolicyNotice = "Paste an active policy commitment shared by its owner.";
let liveFccTransactions: { label: string; hash: `0x${string}`; blockNumber?: bigint }[] = [];
const walletProvider = injectedProvider();
let walletState: WalletUiState = { status: "DISCONNECTED" };
let coston2State: Coston2UiState = { status: "IDLE" };
let liveReadSequence = 0;
let vaultAmountInput = "1";
let vaultIntent: { action: VaultUserAction; amount: bigint; steps: readonly VaultTransactionKind[] } | null = null;
let vaultTransactionState: VaultTransactionUiState = { status: "IDLE" };
let requestsMode: RequestsMode = "CREATE";
let requestInput: string = REVIEWED_V2_REQUEST_ID;
let requestLoading = false;
let requestNotice = "Loading the reviewed Coston2 request from the finalized router…";
let requestFinalizedBlock: bigint | null = null;
let requestFinalizedAt: bigint | null = null;
let requestPolicyOwner: Address | null = null;
let requestReadSequence = 0;
let requestIntent: RequestTransactionKind | null = null;
let requestTransactionState: RequestTransactionUiState = { status: "IDLE" };
let requestExampleSelection: string = REVIEWED_V2_REQUEST_ID;

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
        <nav class="primary-nav" aria-label="Primary navigation">
          <div class="nav-group nav-group-main"><span class="nav-group-label">MAIN FLOW</span>${navItem("studio", "Policy Studio", "◈")}${navItem("vaults", "Vaults", "▣")}${navItem("requests", "Requests", "↗")}</div>
          <div class="nav-group nav-group-proof"><span class="nav-group-label">VERIFY</span>${navItem("demo", "Demo lifecycle", "⌁")}${navItem("payee", "Payee", "◍")}${navItem("auditor", "Auditor", "◌")}</div>
          <button class="nav-item mobile-more" type="button" data-action="mobile-menu" aria-expanded="${mobileMenuOpen}" aria-controls="mobile-secondary-nav"><span class="nav-icon">＋</span>More</button>
        </nav>
        ${mobileMenuOpen ? `<div class="mobile-secondary-nav" id="mobile-secondary-nav" aria-label="Secondary navigation">${navItem("demo", "Demo", "⌁")}${navItem("payee", "Payee", "◍")}${navItem("auditor", "Auditor", "◌")}</div>` : ""}
        <div class="sidebar-bottom">
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

function label(view: View): string { return ({ studio: "Policy Studio", vaults: "Vaults", requests: "Requests", demo: "Demo lifecycle", payee: "Payee", auditor: "Auditor" })[view]; }

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
  if (!live) return `<a class="header-faucet" href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer" aria-label="Get Coston2 test tokens">FAUCET ↗</a>`;
  return `<div class="header-balances" aria-label="Coston2 wallet balances"><span class="header-balance" title="FTestXRP wallet balance"><small>FTESTXRP</small><strong>${token(live.tokenBalance)}</strong></span><span class="header-balance" title="C2FLR gas balance"><small>C2FLR</small><strong>${nativeToken(live.nativeBalance)}</strong></span><a class="header-faucet" href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer" aria-label="Get Coston2 test tokens">FAUCET ↗</a></div>`;
}

function sidebarUserRow(): string {
  const account = connectedAccount();
  const label = walletState.status === "WRONG_CHAIN" ? "Switch to Coston2" : account ? short(account) : "Wallet not connected";
  return `<div class="user-row"><div class="avatar">${account ? account.slice(2, 4).toUpperCase() : "—"}</div><div><strong>${account ? "Connected wallet" : "No active wallet"}</strong><small>${esc(label)}</small></div></div>`;
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
  return demoView();
}

function pageIntro(eyebrow: string, title: string, copy: string): string {
  return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div></div>`;
}

function paymentFlowGuide(current: "POLICY" | "VAULT" | "REQUEST"): string {
  const items: readonly [string, string, string, View][] = [
    ["01", "Owner creates policy", "Wallet A", "studio"],
    ["02", "Owner funds vault", "Wallet A", "vaults"],
    ["03", "Share commitment", "A → requester", "studio"],
    ["04", "Request payment", "Wallet B or owner", "requests"],
    ["05", "Payee receives", "After FCC allows", "requests"],
  ];
  const activeIndexes = current === "POLICY" ? new Set([0, 2]) : current === "VAULT" ? new Set([1]) : new Set([3, 4]);
  return `<nav class="payment-flow-guide" aria-label="PayGuard payment flow">${items.map(([number, label, role, view], index) => `<button class="payment-flow-step ${activeIndexes.has(index) ? "active" : ""}" type="button" data-view="${view}" ${activeIndexes.has(index) ? 'aria-current="step"' : ""}><span>${number}</span><strong>${label}</strong><small>${role}</small></button>`).join("")}</nav>`;
}

function studioView(): string {
  return `${pageIntro("PRIVATE POLICY STUDIO", "Create a payment policy", "Build one private rule through four visible sections. The sticky step bar jumps between them while actions remain gated in order.")}
    ${paymentFlowGuide("POLICY")}
    ${studioStepper()}
    <div class="studio-all-steps">
      <div class="studio-section" id="studio-section-1" data-studio-section="1">${studioTemplateStep()}</div>
      <div class="studio-section ${studioTemplateChosen ? "" : "locked"}" id="studio-section-2" data-studio-section="2">${studioRulesStep()}</div>
      <div class="studio-section ${studioRulesReviewed ? "" : "locked"}" id="studio-section-3" data-studio-section="3">${studioReviewStep()}</div>
      <div class="studio-section ${studioCompilation ? "" : "locked"}" id="studio-section-4" data-studio-section="4">${studioActivateStep()}</div>
    </div>
    <section class="privacy-note studio-privacy-note"><span>✦</span><div><strong>Refresh discards this workflow</strong><p>Draft values, entropy, ciphertexts, and receipts are never placed in browser persistence.</p></div></section>`;
}

function studioStepper(): string {
  const steps: readonly [StudioStep, string][] = [[1, "Template"], [2, "Rules"], [3, "Review"], [4, "Activate"]];
  const unlocked = (step: StudioStep): boolean => step === 1 || (step === 2 && studioTemplateChosen) || (step === 3 && studioRulesReviewed) || (step === 4 && Boolean(studioCompilation));
  const complete = (step: StudioStep): boolean => step === 1 ? studioTemplateChosen : step === 2 ? studioRulesReviewed : step === 3 ? Boolean(studioCompilation) : Boolean(liveFccPolicyRegistration && liveFccPolicyStatus === 1);
  return `<div class="studio-progress"><div class="studio-progress-meta"><span>Step ${studioStep} of 4</span><strong>${steps[studioStep - 1]?.[1]}</strong></div><div class="studio-stepper" aria-label="Policy creation sections">${steps.map(([step, labelText]) => `<button class="studio-step ${studioStep === step ? "active" : ""} ${complete(step) ? "complete" : ""} ${unlocked(step) ? "" : "locked"}" type="button" data-studio-step="${step}" ${studioStep === step ? 'aria-current="step"' : ""}><span>${complete(step) ? "✓" : String(step).padStart(2, "0")}</span>${labelText}${!unlocked(step) ? " · LOCKED" : ""}</button>`).join("")}</div></div>`;
}

function studioTemplateStep(): string {
  return `<section class="panel studio-step-panel"><div class="form-header"><div><div class="eyebrow">STEP 01</div><h2>Choose a starting policy</h2><p>Select one template explicitly. This creates fresh in-memory entropy.</p></div><span class="version-chip">POLICY_SCHEMA_V1</span></div><div class="template-grid" aria-label="Policy templates">${STUDIO_TEMPLATES.map((template) => { const selected = studioTemplateChosen && studioDraft.templateId === template.id; return `<button class="template-card ${selected ? "selected" : ""}" type="button" data-template="${template.id}" aria-pressed="${selected}"><strong>${esc(template.name)}</strong><span>${esc(template.summary)}</span><span class="template-choice-state" aria-hidden="true">${selected ? "✓ SELECTED" : "SELECT TEMPLATE →"}</span></button>`; }).join("")}</div><div class="studio-action-bar"><span>${esc(studioNotice)}</span><button class="primary-button" type="button" data-studio-step="2" ${studioTemplateChosen ? "" : "disabled"}>Continue to rules</button></div></section>`;
}

function studioRulesStep(): string {
  const account = connectedAccount();
  const draftOwner = studioDraft.owner;
  const ownerMatches = Boolean(account && draftOwner && account.toLowerCase() === draftOwner.toLowerCase());
  const recurring = studioDraft.scheduleIntervalSeconds !== "0";
  const locked = !studioTemplateChosen;
  const domainLabel = liveFccConfigState.status === "READY" ? "Configured Coston2 V2 domain" : "Configured public Coston2 domain";
  return `<form class="panel studio-form studio-step-panel" id="studio-form" novalidate><div class="form-header"><div><div class="eyebrow">STEP 02</div><h2>Define the private rule</h2><p>Focus on payment intent; owner and contract domain are resolved for you.</p></div><span class="state-tag ${locked ? "gray-tag" : "green-tag"}">${locked ? "LOCKED · CHOOSE TEMPLATE" : "IN MEMORY"}</span></div><fieldset class="studio-step-fields" ${locked ? "disabled" : ""}>${studioIssues.length > 0 ? `<div class="validation-summary" role="alert"><strong>Fix ${studioIssues.length} field${studioIssues.length === 1 ? "" : "s"}</strong><span>${esc(studioIssues[0]?.message ?? "Policy draft is invalid.")}</span></div>` : ""}<div class="policy-role-map"><div><span>A</span><strong>Policy owner</strong><small>Creates, funds and controls the policy</small></div><div><span>B</span><strong>Authorized requester</strong><small>May request without a new owner signature</small></div><div><span>→</span><strong>Payee</strong><small>Receives only after FCC allows</small></div></div><input type="hidden" name="owner" value="${esc(draftOwner)}" /><input type="hidden" name="registry" value="${esc(studioDraft.registry)}" /><input type="hidden" name="vault" value="${esc(studioDraft.vault)}" /><input type="hidden" name="router" value="${esc(studioDraft.router)}" /><input type="hidden" name="asset" value="${esc(studioDraft.asset)}" />${studioField("policyName", "Policy name", "A local label used to derive the canonical policy ID.", "text")}<div class="two-col">${studioField("target", "Payee address (receives funds)", "The only public transfer target this policy may authorize.", "text")}${studioField("requester", "Requester wallet (can ask for payment)", "The owner may also request; this adds another authorized requester wallet.", "text")}</div><div class="derived-field"><span>Policy owner (creates and funds)</span><strong>${draftOwner ? esc(short(draftOwner)) : "Not bound yet"}</strong><small>${ownerMatches ? "Matches the connected Coston2 wallet. This owner may also create requests." : account ? "This draft must be rebound before review." : "Connect a wallet before this rule can be reviewed."}</small>${account && !ownerMatches ? '<button class="text-button" type="button" data-action="rebind-studio-owner">Use connected wallet ↗</button>' : account ? "" : '<button class="text-button" type="button" data-action="connect">Connect wallet ↗</button>'}</div><div class="two-col">${studioField("maxPerAction", "Maximum per payment", "Enter the amount in FTestXRP, for example 0.1. Internal base units are converted automatically.", "decimal")}${studioField("dailyCap", "Maximum per day", "Enter the total daily amount in FTestXRP with up to 6 decimals.", "decimal")}</div><div class="schedule-choice"><span>Schedule</span><div><label><input type="radio" name="scheduleMode" value="adhoc" ${recurring ? "" : "checked"} />Ad-hoc</label><label><input type="radio" name="scheduleMode" value="recurring" ${recurring ? "checked" : ""} />Recurring</label></div></div><div class="two-col">${studioDateField("startAt", "Starts at (UTC)")}${studioDateField("endAt", "Ends at (UTC)")}</div>${recurring ? `<div class="two-col">${studioField("scheduleIntervalSeconds", "Interval in seconds", "How often a scheduled occurrence may happen.", "numeric")}${studioField("scheduleGraceSeconds", "Grace in seconds", "Must be shorter than the interval.", "numeric")}</div>` : '<input type="hidden" name="scheduleIntervalSeconds" value="0" /><input type="hidden" name="scheduleGraceSeconds" value="0" />'}<details class="domain-details more-options"><summary>More options <span>occurrence limit</span></summary><div>${studioField("maxOccurrences", "Occurrence limit", "0 means no policy-specific limit.", "numeric")}</div></details><div class="derived-domain"><div><span>Resolved domain</span><strong>${domainLabel}</strong></div><small>Registry ${esc(short(studioDraft.registry))} · Vault ${esc(short(studioDraft.vault))} · Router ${esc(short(studioDraft.router))} · FTestXRP ${esc(short(studioDraft.asset))}</small></div><div class="private-row"><span class="lock-icon">▣</span><div><strong>Confidential draft only</strong><small>Payee, requester, caps, schedule, salt, and nonce stay in this tab until encrypted submission to registered FCC ingress.</small></div><span class="state-tag gray-tag">IN MEMORY</span></div><div class="studio-action-bar"><button class="outline-button" type="button" data-studio-step="1">Back to template</button><span id="studio-notice">${esc(studioNotice)}</span><button class="primary-button" type="submit" ${ownerMatches && !locked ? "" : "disabled"}>Continue to review</button></div></fieldset></form>`;
}

function studioDateField(field: "startAt" | "endAt", labelText: string): string {
  const issue = studioIssues.find((candidate) => candidate.field === field);
  return `<label class="studio-field ${issue ? "field-error" : ""}">${labelText}<input type="datetime-local" name="${field}" value="${esc(unixToDateTimeInput(studioDraft[field]))}" step="60" aria-invalid="${Boolean(issue)}" />${issue ? `<span class="field-message">${esc(issue.message)}</span>` : "<small>Displayed as a human-readable UTC date and time.</small>"}</label>`;
}

function studioReviewStep(): string {
  const recurring = studioDraft.scheduleIntervalSeconds !== "0";
  const schedule = recurring ? `every ${durationHint(studioDraft.scheduleIntervalSeconds) ?? `${studioDraft.scheduleIntervalSeconds} seconds`}` : "on an ad-hoc basis";
  return `<section class="studio-review-layout"><div class="panel studio-step-panel"><div class="form-header"><div><div class="eyebrow">STEP 03</div><h2>Review before computing</h2><p>No receipt or activation is created by this local computation.</p></div><span class="state-tag ${studioRulesReviewed ? "green-tag" : "gray-tag"}">${studioRulesReviewed ? "RULES READY" : "LOCKED · VALIDATE RULES"}</span></div><p class="policy-sentence">Allow requester <strong>${esc(short(studioDraft.requester))}</strong> to request up to <strong>${esc(studioDraft.maxPerAction)} FTestXRP</strong> from owner <strong>${esc(short(studioDraft.owner))}</strong> to payee <strong>${esc(short(studioDraft.target))}</strong>, ${esc(schedule)}, within a daily cap of <strong>${esc(studioDraft.dailyCap)} FTestXRP</strong>.</p><div class="disclosure-grid"><article><span class="visibility-dot public"></span><h3>Public</h3><p>Commitment, owner, contract domain, and every actual request's requester, amount, recipient, timing, nonce, and transaction graph.</p></article><article><span class="visibility-dot private"></span><h3>Private in FCC</h3><p>Requester/payee allowlists, caps, schedule logic, occurrence bound, salt, nonce, and intermediate evaluation details.</p></article></div><div class="public-warning"><strong>PayGuard is not private money.</strong><span>Ordinary amount, recipient, timing, and transaction graph remain public.</span></div><details class="domain-details technical-details"><summary>Technical details <span>exact domain and hashes</span></summary>${studioPreview()}</details><div class="studio-action-bar"><button class="outline-button" type="button" data-studio-step="2">Back to rules</button><span>${esc(studioNotice)}</span><button class="primary-button" type="button" data-action="studio-compute" ${studioRulesReviewed ? "" : "disabled"}>Compute policy commitment</button></div></div></section>`;
}

function studioActivateStep(): string {
  const ready = Boolean(studioCompilation);
  const active = Boolean(liveFccPolicyRegistration && liveFccPolicyStatus === 1);
  const state = !liveFccPolicyRegistration ? ready ? "ACTION REQUIRED" : "LOCKED · COMPUTE FIRST"
    : liveFccPolicyStatus === 1 ? "POLICY ACTIVE"
      : liveFccPolicyStatus === 2 ? "POLICY STOPPED" : "POLICY REVOKED";
  return `<div class="studio-activate-layout"><section class="panel studio-step-panel activation-summary"><div class="form-header"><div><div class="eyebrow">STEP 04</div><h2>Activate your policy</h2><p>${ready ? "Complete the three actions below. A local commitment alone is not an active policy." : "Review the policy and compute its commitment before custody or registration becomes available."}</p></div><span class="state-tag ${active ? "green-tag" : ready ? "amber-tag" : "gray-tag"}">${state}</span></div>${ready ? studioCustodyPanel() : ""}<details class="domain-details activation-technical-details"><summary>Commitment & data map <span>technical details</span></summary>${studioPreview()}</details><div class="studio-action-bar"><button class="outline-button" type="button" data-studio-step="3">Back to review</button><button class="text-button" type="button" data-view="demo">Open lifecycle evidence ↗</button></div></section></div>`;
}

function unixToDateTimeInput(value: string): string {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1_000).toISOString().slice(0, 16);
}

function dateTimeInputToUnix(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const milliseconds = Date.parse(`${value}:00Z`);
  return Number.isNaN(milliseconds) ? "" : String(Math.floor(milliseconds / 1_000));
}

function interactiveStudioPanel(): string {
  const account = connectedAccount();
  if (interactiveConfigState.status === "LOADING") return `<details class="legacy-sandbox-panel"><summary>Legacy V1 sandbox <span>loading isolated actors</span></summary><section class="panel receipt-card interactive-studio-card"><div class="eyebrow">LEGACY V1 SANDBOX</div><h3>Loading isolated demo domain…</h3><p class="panel-copy">This is not the active V2 candidate.</p></section></details>`;
  if (interactiveConfigState.status === "UNAVAILABLE") return `<details class="legacy-sandbox-panel"><summary>Legacy V1 sandbox <span>recorded evidence only</span></summary><section class="panel receipt-card interactive-studio-card"><div class="eyebrow">LEGACY V1 SANDBOX</div><h3>Historical actor APIs are intentionally not deployed</h3><div class="activation-block"><span class="status-dot amber"></span><div><strong>No fallback approval</strong><small>The active V2 FCC panel remains independent; review the historical evidence in Demo lifecycle.</small></div></div></section></details>`;
  const config = interactiveConfigState.config;
  const exactDomain = interactiveStudioCompilation
    && interactiveStudioCompilation.policy.registry.toLowerCase() === config.registry.toLowerCase()
    && interactiveStudioCompilation.policy.vault.toLowerCase() === config.vault.toLowerCase()
    && interactiveStudioCompilation.policy.router.toLowerCase() === config.router.toLowerCase()
    && interactiveStudioCompilation.policy.asset.toLowerCase() === config.asset.toLowerCase()
    && account && interactiveStudioCompilation.policy.owner.toLowerCase() === account.toLowerCase();
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
  return `<details class="legacy-sandbox-panel"><summary>Legacy V1 sandbox <span>optional · separate contracts</span></summary><section class="panel receipt-card interactive-studio-card"><div class="eyebrow">LEGACY V1 SANDBOX</div><h3>Separate simulation namespace</h3><span class="state-tag gray-tag">V1 ACTORS · NOT REGISTERED FCC</span><p class="panel-copy">Three serverless actor signatures exercise the older V1 contract path. They share one Vercel operator and never count as V2 custody.</p>${rows}<div class="activation-block"><span class="status-dot ${interactivePolicyRegistration ? "green" : "amber"}"></span><div><strong>${interactivePolicyRegistration ? "Legacy sandbox policy registered" : interactiveSession ? "3 / 3 simulated receipts checked" : "V2 activation remains separate"}</strong><small>${interactivePolicyRegistration ? `Coston2 block ${interactivePolicyRegistration.blockNumber}` : "Policy ciphertext and owner signatures stay memory-only; refresh discards them."}</small></div></div>${action}</section></details>`;
}

function studioCustodyPanel(): string {
  const account = connectedAccount();
  if (liveFccConfigState.status === "LOADING") return `<section class="panel receipt-card"><div class="eyebrow">V2 LIVE CANDIDATE · COSTON2</div><h3>Verifying relay and three machines…</h3><p class="panel-copy">No readiness is asserted until the relay checks V2 contracts, manager status, stable HTTPS origins, keys and code hash.</p></section>`;
  if (liveFccConfigState.status === "UNAVAILABLE") return `<section class="panel receipt-card"><div class="eyebrow">V2 LIVE CANDIDATE · COSTON2</div><h3>Live path unavailable</h3><div class="activation-block"><span class="status-dot amber"></span><div><strong>Failed closed</strong><small>No local receipt or legacy simulation replaces the hosted V2 path.</small></div></div></section>`;
  const config = liveFccConfigState.config;
  if (!studioCompilation) return `<section class="panel receipt-card"><div class="eyebrow">LIVE FCC · COSTON2 V2</div><h3>Custody waits for a commitment</h3><div class="activation-block"><span class="status-dot amber"></span><div><strong>0 / 3 receipts</strong><small>Complete Rules and Review first. No machine request is sent from this locked section.</small></div></div></section>`;
  const exactDomain = studioCompilation
    && studioCompilation.policy.registry.toLowerCase() === config.contracts.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === config.contracts.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === config.contracts.router.toLowerCase()
    && studioCompilation.policy.asset.toLowerCase() === config.contracts.asset.toLowerCase();
  const ownerMatches = Boolean(account && studioCompilation.policy.owner.toLowerCase() === account.toLowerCase());
  const rows = liveFccSession
    ? liveFccSession.custody.map((receipt, index) => `<div class="receipt-row"><span class="machine-index">0${index + 1}</span><div><strong>${esc(short(receipt.receipt.machineId))}</strong><small>Registered machine receipt · ${esc(short(receipt.digest))}</small></div><span class="state-tag green-tag">SIGNED</span></div>`).join("")
    : config.machines.map((machine) => `<div class="receipt-row"><span class="machine-index">0${machine.index}</span><div><strong>${esc(short(machine.teeId))}</strong><small>Status 2 · ${esc(short(machine.codeHash))}</small></div><span class="state-tag green-tag">MANAGER STATUS 2</span></div>`).join("");
  const action = !account
    ? `<button class="primary-button" type="button" data-action="connect">Connect your Coston2 wallet</button>`
    : !ownerMatches
      ? `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Connected wallet is not this draft's owner</strong><small>Rebind the draft to ${esc(short(account))}, then review and compute a fresh commitment.</small></div></div><button class="primary-button" type="button" data-action="rebind-studio-owner">Use connected wallet as owner</button>`
      : !exactDomain
        ? `<button class="outline-button" type="button" data-action="prepare-live-draft">Use live V2 domain</button>`
        : !liveFccSession
          ? `<button class="primary-button" type="button" data-action="collect-live-custody" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "CUSTODY" ? "Signing & contacting A/B/D…" : "Collect 3 live FCC receipts"}</button>`
          : !liveFccPolicyRegistration
            ? `<button class="primary-button" type="button" data-action="register-live-policy" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "REGISTER" ? "Waiting for finality…" : "Register your policy on Coston2"}</button>`
            : liveFccPolicyStatus === 1
              ? `<div class="activation-owner-actions"><button class="primary-button" type="button" data-view="vaults">Fund your vault →</button><button class="outline-button" type="button" data-live-policy-action="STOP" ${liveFccBusy ? "disabled" : ""}>Stop policy</button><button class="outline-button" type="button" data-live-policy-action="REVOKE" ${liveFccBusy ? "disabled" : ""}>Revoke permanently</button></div>`
              : liveFccPolicyStatus === 2
                ? `<div class="activation-owner-actions"><button class="primary-button" type="button" data-live-policy-action="RESUME" ${liveFccBusy ? "disabled" : ""}>Resume policy</button><button class="outline-button" type="button" data-live-policy-action="REVOKE" ${liveFccBusy ? "disabled" : ""}>Revoke permanently</button></div>`
                : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Policy revoked</strong><small>Revocation is terminal. Create a new version for future requests.</small></div></div>`;
  const ownerLabel = account && ownerMatches ? `OWNER · ${short(account)}` : account ? "OWNER MISMATCH" : "WALLET REQUIRED";
  const registeredState = liveFccPolicyStatus === 1 ? "ACTIVE" : liveFccPolicyStatus === 2 ? "STOPPED" : liveFccPolicyStatus === 3 ? "REVOKED" : "REGISTERED";
  const policyActive = Boolean(liveFccPolicyRegistration && liveFccPolicyStatus === 1);
  const invite = liveFccPolicyRegistration && liveFccSession ? `<div class="request-created-summary policy-invite"><span>Share with the authorized requester</span><input class="policy-share-value" value="${esc(liveFccSession.binding.policyCommitment)}" readonly aria-label="Public policy commitment" /><small>This commitment is public. The requester pastes it in Requests; no private rule is shared.</small><div class="vault-actions"><button class="outline-button" type="button" data-action="copy-policy-commitment">Copy commitment</button><button class="primary-button" type="button" data-action="open-delegated-policy">Open delegated request →</button></div></div>` : "";
  return `<section class="panel receipt-card activation-action-card"><div class="eyebrow">COMPLETE ACTIVATION</div><h3>Your policy on Coston2</h3><span class="state-tag ${ownerMatches ? "green-tag" : "gray-tag"}">${esc(ownerLabel)}</span><span class="state-tag gray-tag">SIMULATED TEE · TESTNET</span><p class="panel-copy">Your wallet authorizes three independent encrypted copies. After all receipts verify, the same wallet registers the policy and becomes its on-chain owner.</p><div class="activation-steps"><div class="${ownerMatches ? "complete" : "current"}"><span>${ownerMatches ? "✓" : "1"}</span><strong>Owner wallet</strong><small>${ownerMatches ? "Connected wallet matches the policy owner" : "Connect or bind your wallet"}</small></div><div class="${liveFccSession ? "complete" : ownerMatches ? "current" : ""}"><span>${liveFccSession ? "✓" : "2"}</span><strong>Three custody receipts</strong><small>${liveFccSession ? "A/B/D receipts verified in memory" : "Sign one exact authorization per machine"}</small></div><div class="${liveFccPolicyRegistration ? "complete" : liveFccSession ? "current" : ""}"><span>${liveFccPolicyRegistration ? "✓" : "3"}</span><strong>On-chain registration</strong><small>${liveFccPolicyRegistration ? `${registeredState} · finalized block ${liveFccPolicyRegistration.blockNumber}` : "Confirm the registry transaction in your wallet"}</small></div></div>${liveFccSession ? rows : ""}<div class="activation-block"><span class="status-dot ${policyActive ? "green" : "amber"}"></span><div><strong>${liveFccPolicyRegistration ? `Policy ${registeredState} on Coston2` : liveFccSession ? "3 / 3 receipts ready · registration required" : "Policy not active yet"}</strong><small>${liveFccPolicyRegistration ? "Only this policy owner can stop, resume, or revoke it." : "Private policy, ciphertexts, authorizations, and receipts are discarded on refresh."}</small></div></div>${invite}${action}<small class="panel-copy">${esc(liveFccNotice)}</small></section>`;
}

function custodyUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    CUSTODY_UNFINALIZED: "Custody receipts are not finalized",
    CUSTODY_INVALID: "Custody receipt bundle failed validation",
  } as Record<string, string>)[reason] ?? "Custody receipts unavailable";
}

function studioField(field: Exclude<keyof StudioDraft, "templateId">, labelText: string, hint: string, inputMode: "text" | "numeric" | "decimal"): string {
  const issue = studioIssues.find((candidate) => candidate.field === field);
  const hintId = `studio-hint-${field}`;
  return `<label class="studio-field ${issue ? "field-error" : ""}">${esc(labelText)}${inputMode === "decimal" ? '<span class="field-unit">FTestXRP</span>' : ""}<input name="${field}" value="${esc(studioDraft[field])}" ${inputMode === "numeric" ? 'inputmode="numeric"' : inputMode === "decimal" ? 'inputmode="decimal"' : 'spellcheck="false"'} autocomplete="off" aria-invalid="${Boolean(issue)}" aria-describedby="${hintId}" />${issue ? `<span class="field-message" id="${hintId}">${esc(issue.message)}</span>` : `<small id="${hintId}" data-studio-hint="${field}" data-base-hint="${esc(hint)}">${esc(studioHumanHint(field, studioDraft[field], hint))}</small>`}</label>`;
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
  const liveV2Domain = studioCompilation && liveFccConfigState.status === "READY"
    && studioCompilation.policy.registry.toLowerCase() === liveFccConfigState.config.contracts.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === liveFccConfigState.config.contracts.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === liveFccConfigState.config.contracts.router.toLowerCase();
  const demoDomain = studioCompilation && interactiveConfigState.status === "READY"
    && studioCompilation.policy.registry.toLowerCase() === interactiveConfigState.config.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === interactiveConfigState.config.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === interactiveConfigState.config.router.toLowerCase();
  const publicCoston2Domain = studioCompilation
    && studioCompilation.policy.registry.toLowerCase() === PAYGUARD_COSTON2.registry.toLowerCase()
    && studioCompilation.policy.vault.toLowerCase() === PAYGUARD_COSTON2.vault.toLowerCase()
    && studioCompilation.policy.router.toLowerCase() === PAYGUARD_COSTON2.router.toLowerCase();
  const domainStatus = liveV2Domain
    ? "V2 live-candidate domain loaded · hardware release not verified"
    : demoDomain
      ? "Legacy V1 sandbox domain loaded · not active V2"
      : publicCoston2Domain
        ? "Reviewed public Coston2 domain · ready for owner-authorized activation"
        : "Local example domain · not verified";
  return `<section class="panel commitment-card"><div class="eyebrow">DOMAIN-BOUND COMMITMENT</div><div class="commitment-value" id="commitment-value">${esc(commitment)}</div><small>${studioCompilation ? "Validated locally · not registered" : "Validate the in-memory draft to compute"}</small><div class="commitment-state"><span class="status-dot ${liveV2Domain ? "green" : "amber"}"></span> ${domainStatus}</div></section>
    <section class="panel boundary-card"><div class="eyebrow">EXACT DATA MAP</div><h3>Public versus private</h3>${studioCompilation ? `${previewGroup("Public at activation", studioCompilation.publicAtActivation, "public")} ${previewGroup("Public at request", studioCompilation.publicAtRequest, "request")} ${previewGroup("Private in FCC", studioCompilation.privateInFcc, "private")}` : `<p class="boundary-empty">Compute the draft to inspect every policy field by when and where it becomes visible.</p>`}</section>`;
}

function previewGroup(title: string, items: readonly PreviewItem[], kind: "public" | "request" | "private"): string {
  return `<details class="preview-group" ${kind === "public" ? "open" : ""}><summary><span class="visibility-dot ${kind}"></span>${esc(title)} <b>${items.length}</b></summary><dl>${items.map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join("")}</dl></details>`;
}

function vaultsView(): string {
  const live = liveSnapshot();
  const account = connectedAccount();
  return `${pageIntro("PUBLIC ASSET VAULTS", "Fund your payment policy", "Enter a normal FTestXRP amount. PayGuard handles any required token approval as part of the deposit flow.")}
    ${paymentFlowGuide("VAULT")}
    ${vaultTransactionPanel(live, account)}
    <section class="vault-card vault-overview panel"><div class="vault-card-top"><div class="token-symbol" aria-hidden="true">X</div><div><div class="eyebrow">VAULT OVERVIEW</div><h2>FTestXRP</h2><span class="muted">${account ? esc(short(account)) : "Public asset · Coston2"}</span></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "LIVE" : account ? "READ BLOCKED" : "CONNECT"}</span><button class="icon-button vault-refresh" type="button" data-action="${account ? "refresh" : "connect"}" aria-label="${account ? "Refresh finalized vault state" : "Connect Coston2 wallet"}">↻</button></div><div class="vault-summary-grid"><div><span>Available</span><strong>${live ? token(live.accounting.available) : "—"}</strong><small>FTestXRP</small></div><div><span>Wallet balance</span><strong>${live ? token(live.tokenBalance) : "—"}</strong><small>FTestXRP</small></div><div><span>Vault allowance</span><strong>${live ? token(live.vaultAllowance) : "—"}</strong><small>FTestXRP</small></div></div><div class="vault-account-details"><div class="vault-details-grid"><div><span>Finalized block</span><strong>${live?.finalizedBlock ?? "—"}</strong></div><div><span>Deposited</span><strong>${live ? `${token(live.accounting.deposited)} FTestXRP` : "—"}</strong></div><div><span>Reserved</span><strong>${live ? `${token(live.accounting.reserved)} FTestXRP` : "—"}</strong></div><div><span>Spent</span><strong>${live ? `${token(live.accounting.spent)} FTestXRP` : "—"}</strong></div><div><span>Withdrawn</span><strong>${live ? `${token(live.accounting.withdrawn)} FTestXRP` : "—"}</strong></div><div><span>Conservation</span><strong>${live ? "Verified" : "Unavailable"}</strong></div><div><span>Contract runtime</span><strong>${live ? "Verified" : "Unavailable"}</strong></div><div><span>Prepared operation</span><strong>${vaultIntent?.action ?? "None"}</strong></div></div><div class="vault-detail-actions">${live ? `<a class="text-button inline-link" href="${explorerAddress(PAYGUARD_COSTON2.vault)}" target="_blank" rel="noreferrer">Open vault explorer ↗</a>` : `<a class="text-button inline-link" href="${COSTON2_FAUCET}" target="_blank" rel="noreferrer">Get test tokens ↗</a>`}</div></div></section>`;
}

function vaultTransactionPanel(live: Coston2AccountSnapshot | null, account: Address | null): string {
  const busy = vaultTransactionState.status === "SUBMITTING";
  const intentCopy = vaultIntent?.action === "DEPOSIT"
    ? vaultIntent.steps.length === 2
      ? `Deposit ${token(vaultIntent.amount)} FTestXRP. Your wallet will first set the exact vault allowance, then deposit the same amount.`
      : `Deposit exactly ${token(vaultIntent.amount)} FTestXRP using the allowance already available.`
    : vaultIntent ? `Withdraw exactly ${token(vaultIntent.amount)} FTestXRP from the vault back to the connected wallet.` : "";
  const transactionLinks = (transactions: readonly VaultTransactionSummary[]): string => `<div class="transaction-links">${transactions.map((item) => `<a href="${explorerTransaction(item.hash)}" target="_blank" rel="noreferrer">${item.kind === "APPROVE" ? "Approval" : item.kind === "DEPOSIT" ? "Deposit" : "Withdrawal"} · block ${item.blockNumber} ↗</a>`).join("")}</div>`;
  const result = vaultTransactionState.status === "SUCCESS"
    ? `<div class="transaction-result success-result"><span class="status-dot green"></span><div><strong>${vaultTransactionState.action === "DEPOSIT" ? "Deposit complete" : "Withdrawal complete"}</strong><small>${token(vaultTransactionState.amount)} FTestXRP · every required transaction finalized</small>${transactionLinks(vaultTransactionState.transactions)}</div></div>`
    : vaultTransactionState.status === "ERROR"
      ? `<div class="transaction-result error-result"><span class="status-dot amber"></span><div><strong>Operation not completed</strong><small>${esc(vaultTransactionState.message)}</small>${vaultTransactionState.transactions?.length ? transactionLinks(vaultTransactionState.transactions) : ""}</div></div>`
      : "";
  const review = vaultIntent
    ? `<div class="transaction-review"><div class="eyebrow">REVIEW OPERATION</div><h3>${vaultIntent.action === "DEPOSIT" ? "Deposit" : "Withdraw"} · ${token(vaultIntent.amount)} FTestXRP</h3><p>${intentCopy}</p><dl><div><dt>Wallet prompts</dt><dd>${vaultIntent.steps.length} · ${vaultIntent.steps.map((step) => step === "APPROVE" ? "exact approval" : step.toLowerCase()).join(" → ")}</dd></div><div><dt>Network</dt><dd>Coston2 · chain 114</dd></div><div><dt>Account</dt><dd>${account ? esc(account) : "—"}</dd></div><div><dt>Success gate</dt><dd>Receipt + exact event + finalized postcondition for every step</dd></div></dl><div class="transaction-warning">Testnet only. No funds move until you confirm the wallet prompt${vaultIntent.steps.length > 1 ? "s" : ""}.</div><div class="vault-actions"><button class="outline-button" type="button" data-action="cancel-vault-intent" ${busy ? "disabled" : ""}>Cancel</button><button class="primary-button" type="button" data-action="submit-vault-intent" ${busy ? "disabled" : ""}>${busy ? `Finalizing ${vaultTransactionState.status === "SUBMITTING" ? vaultTransactionState.phase.toLowerCase() : "operation"}…` : `Continue · ${vaultIntent.steps.length} wallet confirmation${vaultIntent.steps.length === 1 ? "" : "s"}`}</button></div></div>`
    : "";
  return `<section class="panel vault-transaction-panel"><div class="panel-heading"><div><div class="eyebrow">VAULT ACTION</div><h2>Deposit or withdraw FTestXRP</h2></div><span class="state-tag ${live ? "green-tag" : "amber-tag"}">${live ? "COSTON2 LIVE" : "READ REQUIRED"}</span></div><p class="panel-copy">Enter the amount you see in your wallet, for example <strong>0.1</strong>. PayGuard performs base-unit conversion internally.</p><label class="transaction-amount">Amount<input id="vault-amount" value="${esc(vaultAmountInput)}" inputmode="decimal" autocomplete="off" placeholder="0.1" ${!live || busy ? "disabled" : ""} /><span class="input-unit">FTestXRP</span><small>${live ? `Wallet ${token(live.tokenBalance)} · vault available ${token(live.accounting.available)}` : "Connect and pass finalized checks first."}</small></label><div class="transaction-actions"><button class="primary-button" type="button" data-vault-action="DEPOSIT" ${!live || busy ? "disabled" : ""}>Deposit FTestXRP</button><button class="outline-button" type="button" data-vault-action="WITHDRAW" ${!live || busy ? "disabled" : ""}>Withdraw FTestXRP</button></div>${review}${result}</section>`;
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
  const modes = `<div class="request-mode-tabs" role="tablist" aria-label="Request tasks"><button type="button" role="tab" data-request-mode="CREATE" aria-selected="${requestsMode === "CREATE"}" class="${requestsMode === "CREATE" ? "active" : ""}"><span>01</span><strong>Request payment</strong><small>Create, evaluate and receive</small></button><button type="button" role="tab" data-request-mode="INSPECT" aria-selected="${requestsMode === "INSPECT"}" class="${requestsMode === "INSPECT" ? "active" : ""}"><span>02</span><strong>Inspect request</strong><small>Read an existing public ID</small></button></div>`;
  const inspector = `${requestLookup()}<section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACTION REQUEST</div><h2>${snapshot ? "Public request state" : requestLoading ? "Reading finalized state…" : "No verified request loaded"}</h2></div><div class="table-tools"><button class="icon-button" type="button" data-action="load-request" aria-label="Refresh request">↻</button></div></div><div class="request-table"><div class="table-head"><span>REQUEST</span><span>PUBLIC ACTION</span><span>CHECKPOINT</span><span>ON-CHAIN STATE</span><span></span></div><div class="table-row"><span>${requestCell}</span><span>${actionCell}</span><span>${checkpointCell}</span><span><span class="state-tag ${snapshot?.status === "ALLOWED" || snapshot?.status === "EXECUTED" ? "green-tag" : snapshot ? "gray-tag" : "amber-tag"}">${esc(snapshot?.status ?? "UNAVAILABLE")}</span><small>${snapshot ? `Timing: ${esc(readiness)}` : "No timing fact"}</small></span><span></span></div></div>${publicState}<div class="table-footer"><span>Showing public finalized state only</span><span class="muted">${requestFinalizedBlock ? `Coston2 block ${requestFinalizedBlock}` : esc(unavailableReason)} · no browser cache</span></div></section>${requestTransactionPanel(snapshot)}`;
  return `${pageIntro("POLICY PAYMENTS", "Request or inspect a payment", "Use Request payment for the live wallet flow. Use Inspect request only when you already have a public request ID.")}
    ${paymentFlowGuide("REQUEST")}
    ${modes}
    <div role="tabpanel">${requestsMode === "CREATE" ? livePolicyRequestPanel() : inspector}</div>`;
}

function livePolicyRequestPanel(): string {
  const account = connectedAccount();
  const request = liveFccRequest?.request;
  const requesterConnected = Boolean(account && request && account.toLowerCase() === request.requester.toLowerCase());
  const loaded = delegatedPolicyRead;
  const policyStatus = loaded?.status === 1 ? "ACTIVE" : loaded?.status === 2 ? "STOPPED" : loaded?.status === 3 ? "REVOKED" : "NOT LOADED";
  const requestStatus = liveFccExecution ? "EXECUTED" : liveFccEvaluation?.routerStatus === 3 ? "DENIED" : liveFccEvaluation?.routerStatus === 2 ? "ALLOWED" : request ? "PENDING" : loaded?.status === 1 ? "READY" : policyStatus;
  const policyValue = delegatedPolicyInput || liveFccSession?.binding.policyCommitment || "";
  const targetValue = delegatedTargetInput || (account ?? "");
  const builder = !request ? `<div class="request-example-picker delegated-request-fields"><label>Policy commitment<input id="delegated-policy-commitment" value="${esc(policyValue)}" autocomplete="off" spellcheck="false" placeholder="0x…" /></label><label>Payee address<input id="delegated-target" value="${esc(targetValue)}" autocomplete="off" spellcheck="false" placeholder="0x…" /></label><label>Amount in FTestXRP<input id="live-fcc-request-amount" value="${esc(liveFccRequestAmountInput)}" inputmode="decimal" autocomplete="off" /></label></div><div class="vault-actions"><button class="outline-button" type="button" data-action="load-delegated-policy" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "LOAD_POLICY" ? "Reading finalized registry…" : "Load active policy"}</button>${loaded?.status === 1 && account ? `<button class="primary-button" type="button" data-action="create-live-request" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "REQUEST" ? "Waiting for finality…" : "Request payment"}</button>` : !account ? '<button class="primary-button" type="button" data-action="connect">Connect requester wallet</button>' : ""}</div><small>${esc(delegatedPolicyNotice)}</small>` : "";
  const action = !request ? builder
    : !requesterConnected
      ? `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Exact requester wallet required</strong><small>Connect ${esc(short(request.requester))}. The policy owner does not sign this request.</small></div></div>`
      : !liveFccEvaluation
        ? `<div class="request-created-summary"><span>Request ID</span><strong class="mono-value">${esc(request.requestId)}</strong></div><button class="primary-button" type="button" data-action="evaluate-live-request" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "EVALUATE" ? "A/B/D evaluating…" : "Authorize FCC evaluation"}</button>`
        : liveFccEvaluation.decision === "ALLOW" && liveFccEvaluation.routerStatus === 2 && !liveFccExecution
          ? `<div class="request-created-summary"><span>Threshold result</span><strong>ALLOW · ${token(request.amount)} FTestXRP</strong></div><button class="primary-button" type="button" data-action="execute-live-request" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "EXECUTE" ? "Waiting for finality…" : "Receive authorized payment"}</button>`
          : `<div class="request-created-summary"><span>Final result</span><strong>${esc(requestStatus)}${liveFccEvaluation ? ` · ${esc(liveFccEvaluation.publicReasonClass)}` : ""}</strong></div><button class="outline-button" type="button" data-action="reset-live-request">Prepare another request</button>`;
  const facts = request ? `<div class="live-policy-request-meta"><span>Policy <strong>${esc(short(request.policyCommitment))}</strong></span><span>Owner <strong>${esc(short(loaded?.binding.owner ?? liveFccSession?.binding.owner ?? "—"))}</strong></span><span>Requester <strong>${esc(short(request.requester))}</strong></span><span>Payee <strong>${esc(short(request.target))}</strong></span></div>` : loaded ? `<div class="live-policy-request-meta"><span>Policy <strong>${esc(short(loaded.binding.policyCommitment))}</strong></span><span>Owner <strong>${esc(short(loaded.binding.owner))}</strong></span><span>Status <strong>${policyStatus}</strong></span></div>` : "";
  return `<section class="panel live-policy-request-panel"><div class="panel-heading"><div><div class="eyebrow">DELEGATED PAYMENT</div><h2>Request payment from a policy</h2></div><span class="state-tag ${requestStatus === "READY" || requestStatus === "ALLOWED" || requestStatus === "EXECUTED" ? "green-tag" : requestStatus === "STOPPED" || requestStatus === "REVOKED" ? "amber-tag" : "gray-tag"}">${esc(requestStatus)}</span></div><p class="panel-copy">The authorized requester creates and signs this request. The policy owner does not approve each payment; private FCC rules decide it.</p>${facts}<div class="live-policy-request-action">${action}</div><small class="panel-copy">${esc(liveFccNotice)}</small></section>`;
}

function requestLookup(): string {
  const options = REVIEWED_REQUEST_EXAMPLES.map((item) => `<option value="${item.id}" ${requestExampleSelection === item.id ? "selected" : ""}>${item.id}</option>`).join("");
  const custom = requestExampleSelection === "custom";
  return `<section class="panel request-lookup"><div class="request-lookup-heading"><div class="eyebrow">FINALIZED ROUTER LOOKUP</div><h2>Inspect a request ID</h2><span class="state-tag sample-context-tag">${isReviewedRequestInput() ? "PREVIOUSLY CREATED TEST ID" : "USER-SUPPLIED PUBLIC ID"}</span></div><div class="request-example-picker"><label>Choose a test ID<select id="request-example">${options}<option value="custom" ${custom ? "selected" : ""}>Enter request ID</option></select></label><label>Request ID<input id="request-id" value="${esc(requestInput)}" autocomplete="off" spellcheck="false" placeholder="0x…" /></label><small>These four public test IDs were created before this browser session. Edit the field freely; Load always rechecks finalized V2 state.</small></div><button class="primary-button" type="button" data-action="load-request" ${requestLoading ? "disabled" : ""}>${requestLoading ? "Reading finalized block…" : "Load public state"}</button><small>${esc(requestNotice)}</small></section>`;
}

function isReviewedRequestInput(): boolean {
  return REVIEWED_REQUEST_EXAMPLES.some((example) => example.id.toLowerCase() === requestInput.trim().toLowerCase());
}

function demoView(): string {
  return `${pageIntro("V2 LIVE CANDIDATE", "Verify PayGuard on Coston2", "Inspect the wallet-free hosted V2 proof. Policy creation belongs in Policy Studio, funding in Vaults, and payment requests in Requests.")}${liveV2EvidenceView()}${legacyDemoArchiveView()}`;
}

function liveV2EvidenceView(): string {
  if (liveV2EvidenceState.status === "LOADING") {
    return `${demoSectionIntro("WALLET-FREE V2 PROOF", "Validating the hosted lifecycle evidence", "No wallet or private material is required.")}<section class="panel demo-loading"><div class="empty-orbit">◌</div><h2>Checking V2 evidence…</h2></section>`;
  }
  if (liveV2EvidenceState.status === "UNAVAILABLE") {
    return `${demoSectionIntro("WALLET-FREE V2 PROOF", "Hosted evidence unavailable", "The UI fails closed instead of replacing missing V2 evidence with the legacy sandbox.")}<section class="panel"><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No V2 lifecycle proof asserted</strong><small>Use the public evidence index or retry after the hosted body is available.</small></div></div></section>`;
  }
  const evidence = liveV2EvidenceState.evidence;
  const executed = evidence.afterAllow.spent - evidence.before.spent;
  const machines = evidence.machines.map((machine, index) => `<article class="demo-machine machine-${index + 1}"><div class="machine-glyph">${index === 0 ? "◇" : index === 1 ? "⌁" : "▣"}</div><div><span>REGISTERED MACHINE ${index + 1}</span><strong>${esc(short(machine.teeId))}</strong><small>Status ${machine.status} · ${esc(new URL(machine.url).hostname)}</small></div></article>`).join("");
  const steps = evidence.steps.map((step, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(step.label)}</strong><small>${esc(short(step.transactionHash))}</small></div><a href="${explorerTransaction(step.transactionHash)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(step.label)} transaction">↗</a></li>`).join("");
  return `${demoSectionIntro("WALLET-FREE V2 PROOF", "One complete hosted lifecycle", "Strictly decoded from the published V2 evidence body; every transaction opens in the Coston2 explorer.")}
    <div class="demo-boundary v2-proof-boundary"><span class="state-tag green-tag">V2 LIVE CANDIDATE VERIFIED</span><strong>3 registered status-2 machines · 3 custody receipts · 2 matching results</strong><span>SIMULATED_TEE=true · hardware attestation and verified release remain open</span></div>
    <section class="demo-machine-grid">${machines}</section>
    <div class="demo-summary-grid"><section class="panel demo-result allow-result"><div class="eyebrow">ALLOW · 2 MATCHING RESULTS</div><h2>Transfer executed</h2><strong>${token(executed)} FTestXRP</strong><p>The relay reconstructed canonical Coston2 state and submitted two registered machine results. The client supplied no decision.</p><a class="text-button inline-link" href="${explorerTransaction(evidence.steps[5]!.transactionHash)}" target="_blank" rel="noreferrer">Open execution ↗</a></section><section class="panel demo-result deny-result"><div class="eyebrow">DENY · 2 MATCHING RESULTS</div><h2>${evidence.denyReason}</h2><strong>No funds moved</strong><p>The second request was denied and the exact post-ALLOW accounting remained unchanged.</p><span class="mono-value">${esc(short(evidence.denyRequestId))}</span></section><section class="panel demo-result"><div class="eyebrow">V2 CONSERVATION</div><h2>Vault still balances</h2><strong>${token(evidence.afterDeny.deposited)} deposited</strong><p>${token(evidence.afterDeny.available)} available + ${token(evidence.afterDeny.spent)} spent. Stop, resume, and revoke are also evidenced.</p></section></div>
    <div class="demo-detail-grid"><section class="panel demo-timeline"><div class="panel-heading"><div><div class="eyebrow">HOSTED V2 TRANSACTION TIMELINE</div><h2>${evidence.steps.length} public checkpoints</h2></div><span class="state-tag green-tag">COSTON2 VERIFIED RUN</span></div><ol>${steps}</ol></section><aside class="panel demo-limitations"><div class="eyebrow">EXACT TRUST BOUNDARY</div><h2>Live candidate, not hardware release</h2><ul>${evidence.blockers.map((blocker) => `<li>${esc(blocker.replaceAll("_", " "))}</li>`).join("")}</ul><p>The evidence proves the deployed V2 simulated profile. It does not claim hardware attestation, mainnet readiness, or independent operators.</p><a class="outline-button inline-link" href="/evidence/coston2/fcc-hosted-relay-lifecycle.json" target="_blank" rel="noreferrer">Open reviewed V2 JSON ↗</a></aside></div>`;
}

function legacyDemoArchiveView(): string {
  return `<details class="legacy-demo-archive"><summary><span><strong>Historical V1 simulation tools</strong><small>Optional isolated sandbox and the earlier 14-transaction record · not the active V2 path</small></span><em>Expand legacy evidence</em></summary><div class="legacy-demo-content">${recordedDemoView()}${interactiveStudioPanel()}${interactiveDemoView()}</div></details>`;
}

function liveFccDemoView(): string {
  if (liveFccConfigState.status === "LOADING") return `${demoSectionIntro("V2 LIVE CANDIDATE · COSTON2", "Checking the hosted lifecycle", "The relay is validating the V2 contracts, official manager binding, and all three registered machine identities.")}<section class="panel demo-loading"><div class="empty-orbit">◌</div><h2>V2 preflight in progress…</h2></section>`;
  if (liveFccConfigState.status === "UNAVAILABLE") return `${demoSectionIntro("V2 LIVE CANDIDATE · COSTON2", "Hosted lifecycle unavailable", "The V2 path fails closed; reviewed public evidence remains independently available below.")}<section class="panel"><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No live success asserted</strong><small>The browser cannot substitute a decision, receipt, machine identity, or release claim.</small></div></div></section>`;
  const config = liveFccConfigState.config;
  const account = connectedAccount();
  const ownerConnected = Boolean(account && (!liveFccSession || account.toLowerCase() === liveFccSession.binding.owner.toLowerCase()));
  const snapshot = liveSnapshot();
  const policyActive = Boolean(liveFccPolicyRegistration && liveFccPolicyStatus === 1);
  const request = liveFccRequest?.request;
  const requestStatus = liveFccExecution ? "EXECUTED" : liveFccEvaluation?.routerStatus === 3 ? "DENIED" : liveFccEvaluation?.routerStatus === 2 ? "ALLOWED" : request ? "PENDING" : "NOT CREATED";
  const transactionRows = liveFccTransactions.length === 0
    ? `<div class="boundary-empty">No live wallet or relay transaction has been submitted from this tab.</div>`
    : `<ol class="interactive-transaction-list">${liveFccTransactions.map((item, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.label)}</strong><small>${item.blockNumber ? `Block ${item.blockNumber} · ` : "Relay broadcast · "}${esc(short(item.hash))}</small></div><a href="${explorerTransaction(item.hash)}" target="_blank" rel="noreferrer">↗</a></li>`).join("")}</ol>`;
  return `${demoSectionIntro("V2 LIVE CANDIDATE · COSTON2", "Run or verify the registered three-machine lifecycle", "Every connected wallet may own a policy. A/B/D custody the encrypted rules; the relay only dispatches public state and submits matching machine results.")}
    <div class="demo-boundary interactive-boundary"><span class="state-tag green-tag">V2 · 3 REGISTERED MACHINES · STATUS 2</span><strong>Live Coston2 · ciphertext-only relay</strong><span>SIMULATED_TEE=true · not hardware attestation · live candidate, not verified release</span></div>
    <div class="demo-actor-mini">${config.machines.map((machine) => `<span>MACHINE ${machine.index} · ${esc(short(machine.teeId))} · PRODUCTION SET</span>`).join("")}</div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">01 · YOUR V2 VAULT</div><h2>${account ? "Wallet connected" : "Connect your wallet"}</h2></div><span class="state-tag ${account ? "green-tag" : "amber-tag"}">${account ? "SELF-CUSTODIED" : "READ ONLY"}</span></div><p class="panel-copy">Your wallet owns its policy and vault balance. The relay executor pays only for bounded FCC dispatch and cannot stop, revoke, or rewrite your policy.</p>${account ? `<div class="demo-account-grid"><div><span>C2FLR gas</span><strong>${snapshot ? nativeToken(snapshot.nativeBalance) : "—"}</strong></div><div><span>Your vault available</span><strong>${snapshot ? token(snapshot.accounting.available) : "—"} FTestXRP</strong></div><div><span>Finalized block</span><strong>${snapshot?.finalizedBlock ?? "—"}</strong></div></div><div class="vault-actions"><button class="outline-button" type="button" data-action="refresh">Refresh</button><button class="primary-button" type="button" data-view="vaults">Fund your vault</button></div>` : `<div class="vault-actions"><button class="primary-button" type="button" data-action="connect">Connect wallet</button><button class="outline-button" type="button" data-view="auditor">Wallet-free audit</button></div>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">02 · PRIVATE CUSTODY</div><h2>${liveFccPolicyRegistration ? "Your policy is registered" : liveFccSession ? "Three receipts ready" : "Prepare in Policy Studio"}</h2></div><span class="state-tag ${liveFccPolicyRegistration ? "green-tag" : "gray-tag"}">${liveFccPolicyStatus === 1 ? "ACTIVE" : liveFccPolicyStatus === 2 ? "STOPPED" : liveFccPolicyStatus === 3 ? "REVOKED" : "NOT REGISTERED"}</span></div>${liveFccSession ? `<div class="commitment-value">${esc(liveFccSession.binding.policyCommitment)}</div><div class="demo-actor-mini">${liveFccSession.custody.map((item, index) => `<span>MACHINE ${index + 1} · ${esc(short(item.digest))}</span>`).join("")}</div>` : `<p class="panel-copy">Policy Studio encrypts the same private policy independently for all three registered public keys and verifies all three receipts before registration.</p>`}<div class="vault-actions"><button class="outline-button" type="button" data-view="studio">Open Policy Studio</button>${liveFccSession && !liveFccPolicyRegistration && ownerConnected ? `<button class="primary-button" type="button" data-action="register-live-policy" ${liveFccBusy ? "disabled" : ""}>Register your policy</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">03 · PUBLIC V2 REQUEST</div><h2>${request ? `Occurrence ${request.occurrence}` : "Create exact action"}</h2></div><span class="state-tag ${request ? "green-tag" : "gray-tag"}">${esc(requestStatus)}</span></div><p class="panel-copy">Amount, target and timing are public. Caps, schedule relationships, salt and policy plaintext remain private.</p>${policyActive && ownerConnected ? `<label class="demo-amount-label">Request amount<input id="live-fcc-request-amount" value="${esc(liveFccRequestAmountInput)}" inputmode="decimal" autocomplete="off" /></label>${request ? `<dl class="demo-request-facts"><div><dt>Request</dt><dd>${esc(short(request.requestId))}</dd></div><div><dt>Amount</dt><dd>${token(request.amount)} FTestXRP</dd></div><div><dt>Checkpoint</dt><dd>${esc(short(request.spendCheckpoint))}</dd></div><div><dt>Expiry</dt><dd>${utc(request.expiry)}</dd></div></dl><button class="outline-button" type="button" data-action="reset-live-request" ${liveFccBusy ? "disabled" : ""}>Prepare next request</button>` : `<button class="primary-button" type="button" data-action="create-live-request" ${liveFccBusy || !snapshot || snapshot.accounting.available <= 0n ? "disabled" : ""}>${liveFccBusy === "REQUEST" ? "Waiting for finality…" : "Create V2 request"}</button>`}` : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Prerequisite missing</strong><small>Connect the policy owner wallet, fund its vault, and register an active V2 policy.</small></div></div>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">04 · FCC QUORUM</div><h2>${liveFccEvaluation ? `${liveFccEvaluation.decision} · ${esc(liveFccEvaluation.publicReasonClass)}` : "Dispatch and verify"}</h2></div><span class="state-tag ${liveFccEvaluation ? "green-tag" : "gray-tag"}">${liveFccEvaluation ? `ROUTER ${liveFccEvaluation.routerStatus}` : "WAITING"}</span></div><p class="panel-copy">The policy owner signs a request-specific relay authorization. The relay reads public state, pays bounded dispatcher gas, and cannot supply ALLOW or alter the policy.</p><div class="vault-actions">${request && !liveFccEvaluation && ownerConnected ? `<button class="primary-button" type="button" data-action="evaluate-live-request" ${liveFccBusy ? "disabled" : ""}>${liveFccBusy === "EVALUATE" ? "A/B/D evaluating…" : "Evaluate with live A/B/D"}</button>` : ""}${liveFccEvaluation?.decision === "ALLOW" && liveFccEvaluation.routerStatus === 2 && !liveFccExecution ? `<button class="primary-button" type="button" data-action="execute-live-request" ${liveFccBusy ? "disabled" : ""}>Execute authorized transfer</button>` : ""}</div></section></div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">05 · GOVERNANCE</div><h2>Canonical owner controls</h2></div><span class="state-tag gray-tag">NO DECISION OVERRIDE</span></div><p class="panel-copy">Only the connected policy owner may stop, resume, or permanently revoke this policy. These actions cannot manufacture an FCC result.</p><div class="vault-actions"><button class="outline-button" type="button" data-live-policy-action="STOP" ${!ownerConnected || liveFccPolicyStatus !== 1 || liveFccBusy ? "disabled" : ""}>Stop</button><button class="outline-button" type="button" data-live-policy-action="RESUME" ${!ownerConnected || liveFccPolicyStatus !== 2 || liveFccBusy ? "disabled" : ""}>Resume</button><button class="outline-button" type="button" data-live-policy-action="REVOKE" ${!ownerConnected || !liveFccPolicyRegistration || liveFccPolicyStatus === 3 || liveFccBusy ? "disabled" : ""}>Revoke</button></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC TRANSACTION LOG</div><h2>${liveFccTransactions.length} writes</h2></div><span class="state-tag gray-tag">THIS TAB ONLY</span></div>${transactionRows}</section></div>
    <div class="interactive-notice" role="status"><span class="status-dot ${liveFccBusy ? "amber" : "green"}"></span><strong>${esc(liveFccBusy ? `Working: ${liveFccBusy}` : liveFccNotice)}</strong></div>`;
}

function interactiveDemoView(): string {
  const account = connectedAccount();
  if (interactiveConfigState.status === "LOADING") return `${demoSectionIntro("LEGACY V1 SANDBOX", "Preparing the optional isolated lifecycle", "Loading the simulation-only V1 contract and actor domain. This is not the active V2 candidate.")}<section class="panel demo-loading"><div class="empty-orbit">◌</div><h2>Checking legacy sandbox configuration…</h2></section>`;
  if (interactiveConfigState.status === "UNAVAILABLE") return `${demoSectionIntro("LEGACY V1 SANDBOX", "Optional actors unavailable", "The wallet-free V2 proof above remains independent. No unavailable legacy actor is replaced with a browser decision.")}<section class="panel"><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No sandbox success asserted</strong><small>The active V2 candidate remains a separate hosted path.</small></div></div></section>`;
  const config = interactiveConfigState.config;
  const snapshot = interactiveAccountSnapshot;
  const policyRegistered = Boolean(interactiveSession && interactivePolicyRegistration);
  const policyReady = policyRegistered && snapshot?.policyStatus === 1;
  const policyLabel = snapshot?.policyStatus === 3 ? "Demo policy revoked"
    : snapshot?.policyStatus === 2 ? "Demo policy stopped"
      : policyReady ? "Demo policy active" : interactiveSession ? "Receipts ready" : "Prepare in the sandbox setup above";
  const request = interactiveRequest?.request;
  const decision = interactiveThreshold?.status === "THRESHOLD_READY" ? interactiveThreshold.matching[0]?.result : undefined;
  const requestStatus = interactiveExecution ? "EXECUTED" : decision?.decision === "DENY" && interactiveThresholdTransactions.length >= 2 ? "DENIED" : interactiveThresholdTransactions.length >= 2 ? "ALLOWED" : request ? "PENDING" : "NOT CREATED";
  const transactionRows = interactiveTransactions.length === 0
    ? `<div class="boundary-empty">No wallet transaction has been submitted from this interactive session.</div>`
    : `<ol class="interactive-transaction-list">${interactiveTransactions.map((item, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.label)}</strong><small>Block ${item.blockNumber} · ${esc(short(item.hash))}</small></div><a href="${explorerTransaction(item.hash)}" target="_blank" rel="noreferrer">↗</a></li>`).join("")}</ol>`;
  return `${demoSectionIntro("LEGACY V1 SANDBOX · OPTIONAL", "Run the isolated simulation", "Use faucet FTestXRP and an injected wallet. Three serverless actors compute signed V1 results; this sandbox never becomes V2 evidence.")}
    <div class="demo-boundary interactive-boundary"><span class="state-tag gray-tag">V1 SIMULATION · SEPARATE CONTRACTS</span><strong>Real testnet transactions · shared serverless trust domain</strong><span>Not registered FCC · not active V2 · not Gate A/B/C</span></div>
    <div class="interactive-stepper" aria-label="Interactive demo progress">${["FUND", "RECEIPTS", "REGISTER", "REQUEST", "QUORUM", "EXECUTE / DENY", "GOVERNANCE"].map((step, index) => `<span class="${interactiveStepReached(index) ? "reached" : ""}">${String(index + 1).padStart(2, "0")} ${step}</span>`).join("")}</div>
    <div class="section-grid interactive-demo-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">01 · TEST TOKEN FUNDING</div><h2>Simulation-only vault</h2></div><span class="state-tag ${snapshot ? "green-tag" : "gray-tag"}">${snapshot ? "FINALIZED READ" : "NOT LOADED"}</span></div><p class="panel-copy">Enter a normal FTestXRP amount. The demo handles an exact approval automatically when the allowance is too low.</p>${account ? `<div class="demo-account-grid"><div><span>Wallet</span><strong>${snapshot ? token(snapshot.tokenBalance) : "—"} FTestXRP</strong></div><div><span>Allowance</span><strong>${snapshot ? token(snapshot.allowance) : "—"} FTestXRP</strong></div><div><span>Demo available</span><strong>${snapshot ? token(snapshot.accounting.available) : "—"} FTestXRP</strong></div></div><label class="demo-amount-label">Funding amount (FTestXRP)<input id="interactive-fund-amount" value="${esc(interactiveFundInput)}" inputmode="decimal" autocomplete="off" /></label><div class="vault-actions"><button class="outline-button" type="button" data-action="refresh-interactive-account" ${interactiveBusy ? "disabled" : ""}>Refresh finalized state</button><button class="primary-button" type="button" data-action="demo-fund" ${interactiveBusy || !snapshot ? "disabled" : ""}>${interactiveBusy === "FUND" ? "Funding…" : "Deposit FTestXRP"}</button></div>` : `<button class="primary-button" type="button" data-action="connect">Connect Coston2 wallet</button>`}</section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">02 · POLICY & CUSTODY</div><h2>${policyLabel}</h2></div><span class="state-tag gray-tag">SIMULATION ONLY</span></div>${interactiveSession ? `<div class="commitment-value">${esc(interactiveSession.binding.policyCommitment)}</div><div class="demo-actor-mini">${interactiveSession.custody.map((item) => `<span>ACTOR ${item.actor} · ${esc(short(item.digest))}</span>`).join("")}</div>` : `<p class="panel-copy">Use the sandbox setup above to bind the wallet, compute the isolated V1 draft, and collect three owner-authorized simulation receipts.</p>`}<div class="vault-actions">${interactiveSession && !interactivePolicyRegistration ? `<button class="primary-button" type="button" data-action="register-demo-policy" ${interactiveBusy ? "disabled" : ""}>Register policy</button>` : ""}</div></section></div>
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
  return `<div class="demo-section-intro"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${copy}</p></div>`;
}

function recordedDemoView(): string {
  if (demoState.status === "LOADING") {
    return `<section class="panel demo-loading recorded-demo-section" id="recorded-lifecycle"><div class="eyebrow">HISTORICAL V1 SIMULATION EVIDENCE</div><div class="empty-orbit">◌</div><h2>Validating legacy evidence schema…</h2></section>`;
  }
  if (demoState.status === "UNAVAILABLE") {
    return `<section class="panel recorded-demo-section" id="recorded-lifecycle"><div class="eyebrow">HISTORICAL V1 SIMULATION EVIDENCE</div><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No legacy success asserted</strong><small>Evidence validation failed closed. The active V2 path remains independent.</small></div></div></section>`;
  }
  const evidence = demoState.evidence;
  const machines = evidence.machines.map((machine, index) => `<article class="demo-machine machine-${index + 1}"><div class="machine-glyph">${index === 0 ? "◇" : index === 1 ? "⌁" : "▣"}</div><div><span>SIMULATED MACHINE ${index + 1}</span><strong>${esc(short(machine.machineId))}</strong><small>Key ${esc(short(machine.keyFingerprint))}<br>Signer ${esc(short(machine.signer))}</small></div></article>`).join("");
  const steps = evidence.steps.map((step, index) => `<li><span class="demo-step-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(step.label)}</strong><small>Block ${step.blockNumber} · ${esc(short(step.transactionHash))}</small></div><a href="${explorerTransaction(step.transactionHash)}" target="_blank" rel="noreferrer" aria-label="Open ${esc(step.label)} transaction">↗</a></li>`).join("");
  return `<div id="recorded-lifecycle"><div class="recorded-demo-lede"><span class="state-tag sample-context-tag">HISTORICAL V1 · REVIEWED PUBLIC EVIDENCE</span><p>A prior Coston2 V1 contract run driven by three ephemeral simulated signers. It proves the older isolated contract path and is not the active V2 candidate.</p></div>
    <div class="demo-boundary"><span class="state-tag amber-tag">SIMULATION ONLY</span><strong>On-chain transactions verified · hardware TEE not present</strong><span>Observed through Coston2 block ${evidence.observedBlock}</span></div>
    <section class="demo-machine-grid">${machines}</section>
    <div class="demo-summary-grid"><section class="panel demo-result allow-result"><div class="eyebrow">2 MATCHING RESULTS</div><h2>Recurring payment allowed</h2><strong>${token(evidence.amount)} FTestXRP</strong><p>Two simulated machines produced one matching ALLOW digest, the vault reserved value, and the router executed the exact transfer.</p><span class="mono-value">${esc(short(evidence.allowRequestId))}</span></section><section class="panel demo-result deny-result"><div class="eyebrow">DETERMINISTIC POLICY RESULT</div><h2>Next request denied</h2><strong>CAP_EXCEEDED</strong><p>Two matching DENY results kept the vault unchanged. The private cap itself is not present in this public evidence.</p><span class="mono-value">${esc(short(evidence.denyRequestId))}</span></section><section class="panel demo-result"><div class="eyebrow">VAULT CONSERVATION</div><h2>Accounting still balances</h2><strong>${token(evidence.deposited)} deposited</strong><p>${token(evidence.availableAfter)} available + ${token(evidence.spentAfter)} spent. Stop, resume, and revoke were also verified.</p></section></div>
    <div class="demo-detail-grid"><section class="panel demo-timeline"><div class="panel-heading"><div><div class="eyebrow">COSTON2 TRANSACTION TIMELINE</div><h2>${evidence.steps.length} verified checkpoints</h2></div><span class="state-tag green-tag">PUBLIC EVIDENCE</span></div><ol>${steps}</ol></section><aside class="panel demo-limitations"><div class="eyebrow">NOT PROVEN BY THIS V1 RECORD</div><h2>Historical boundaries stay explicit</h2><ul>${evidence.blockers.map((blocker) => `<li>${esc(blocker.replaceAll("_", " "))}</li>`).join("")}</ul><p>This older simulation cannot activate or authorize within the active V2 domain. Use the wallet-free V2 proof above for current deployment facts.</p><a class="outline-button inline-link" href="/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json" target="_blank" rel="noreferrer">Open reviewed V1 JSON ↗</a></aside></div></div>`;
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
  return `<section class="panel request-transaction-panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC ROUTER CONTROLS</div><h2>Advance only the canonical state</h2></div><span class="state-tag ${account ? "green-tag" : "amber-tag"}">${account ? "WALLET CONNECTED" : "CONNECT WALLET"}</span></div><div class="transaction-actions"><button class="primary-button" type="button" data-request-kind="EXECUTE" ${!can("EXECUTE") || busy ? "disabled" : ""}>Prepare execution</button><button class="outline-button" type="button" data-request-kind="EXPIRE" ${!can("EXPIRE") || busy ? "disabled" : ""}>Prepare expiry</button><button class="outline-button" type="button" data-request-kind="CANCEL" ${!can("CANCEL") || busy ? "disabled" : ""}>Prepare cancellation</button></div>${!account ? `<button class="text-button request-connect" type="button" data-action="connect">Connect Coston2 wallet ↗</button>` : ""}${review}${result}</section>`;
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
  const paymentHeading = receipt?.status === "SETTLED" ? "Payment settled"
    : receipt?.status === "DENIED" ? "Payment denied"
      : receipt?.status === "EXPIRED" ? "Payment expired"
        : receipt?.status === "CANCELLED" ? "Payment cancelled"
          : expiredPending ? "Payment window expired" : "Expected payment";
  const expectedPanel = receipt
    ? `<h2>${paymentHeading}</h2><p class="panel-copy">The payee sees only the public amount, destination, timing window, and settlement checkpoint. Private policy rules remain outside this receipt.</p><div class="request-public-state payee-public-state"><div><span>Amount</span><strong>${token(receipt.expectedAmount)} FTestXRP</strong></div><div><span>Target</span><strong class="mono-value">${esc(short(receipt.payee))}</strong></div><div><span>Expected at</span><strong>${utc(receipt.expectedAt)}</strong></div><div><span>Expiry</span><strong>${utc(receipt.expiry)}</strong></div></div><div class="unavailable-box ${expiredPending ? "expired-window-box" : ""}"><span class="status-dot ${receipt.status === "SETTLED" ? "green" : "amber"}"></span><div><strong>On-chain: ${receipt.status}${labels ? ` · Timing: ${labels.timing}` : ""}</strong><small>${receipt.status === "SETTLED" ? `Transaction ${esc(short(receipt.settlementTransactionHash))} · checkpoint ${esc(short(receipt.settlementCheckpoint))}` : expiredPending ? "The public window has passed, but the canonical request remains PENDING until someone finalizes expiry on-chain. No settlement is asserted." : `Finalized request ${esc(short(receipt.requestId))} · policy details remain private.`}</small></div></div>`
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
    ? `<li><span class="evidence-icon">#</span><div><strong>Policy commitment</strong><small>${esc(short(evidence.policy.policyCommitment))} · schema ${esc(short(evidence.policy.schema))}</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">♧</span><div><strong>Machine/key binding</strong><small>3 frozen identities · ${evidence.policy.resultThreshold}-of-${evidence.policy.machineIds.length} result threshold</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">↗</span><div><strong>Decision digest</strong><small>${evidence.decision} · ${esc(short(evidence.resultDigest))} · ${evidence.executionStatus}</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">∑</span><div><strong>Conservation</strong><small>${token(evidence.conservation.deposited)} = ${token(evidence.conservation.available)} + ${token(evidence.conservation.reserved)} + ${token(evidence.conservation.spent)} + ${token(evidence.conservation.withdrawn)} + ${token(evidence.conservation.refunded)} FTestXRP</small></div><span class="state-tag green-tag">VERIFIED</span></li><li><span class="evidence-icon">◇</span><div><strong>External input</strong><small>${evidence.inputKind} · ${evidence.inputFinalized ? "finalized" : "not required"}</small></div><span class="state-tag green-tag">VERIFIED</span></li>`
    : `<li><span class="evidence-icon">#</span><div><strong>Policy commitment</strong><small>Hash only · no rules or ciphertext</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">♧</span><div><strong>Machine/key binding</strong><small>Three frozen identities · 2-of-3 result threshold</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">↗</span><div><strong>Decision digest</strong><small>Exact request, checkpoint, expiry, and signers</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">∑</span><div><strong>Conservation</strong><small>Deposited = available + reserved + spent + withdrawn + refunded</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">◇</span><div><strong>External input</strong><small>FTSO/FDC commitment and finalization status</small></div><span class="state-tag gray-tag">WAITING</span></li>`;
  const request = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const chainCheckpoint = request
    ? `<div class="unavailable-box live-request-box"><span class="status-dot green"></span><div><strong>Canonical request verified</strong><small>Finalized block ${requestFinalizedBlock ?? "—"} · ${request.status} · hash ${esc(short(request.requestHash))}. This is request-state verification, not FCC evidence.</small></div></div>`
    : `<div class="unavailable-box"><span class="status-dot amber"></span><div><strong>No canonical request verified</strong><small>${esc(requestNotice)} No transaction, proof, signer, or authorization result is asserted.</small></div></div>`;
  return `${pageIntro("WALLET-FREE VERIFIER", "Auditor view", "Inspect public commitments and conservation without connecting a wallet or revealing the policy.")}
    ${requestLookup()}
    <div class="auditor-grid"><section class="panel verify-card"><div class="eyebrow">PUBLIC REQUEST CHECKPOINT</div><h2>Finalized verification result</h2><p>The selected bytes32 ID is read directly from the deployed Coston2 V2 router. Private policy material is never requested.</p>${chainCheckpoint}<div class="audit-boundary"><strong>Full FCC evidence</strong><small>${evidence ? `Verified at block ${evidence.evidenceBlock}` : `${esc(unavailableReason)}. Request reads do not invent machine signatures or threshold results.`}</small></div></section><section class="panel evidence-card"><div class="eyebrow">ASSERTION CHECKLIST</div><h2>What an auditor will see</h2><ul class="evidence-list">${checklist}</ul></section></div>
    ${observedRequestActorsView()}
    ${publicEvidenceMirrorView()}`;
}

function observedRequestActorsView(): string {
  const request = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const rows = request && requestPolicyOwner
    ? `<div class="role-row"><div class="avatar purple">O</div><div class="role-person"><strong>Policy owner</strong><small>${esc(short(requestPolicyOwner))} · registry-bound public account</small></div><span class="role-permission">May cancel or recover</span></div><div class="role-row"><div class="avatar dashed">R</div><div class="role-person"><strong>Requester</strong><small>${esc(short(request.requester))} · exact request creator</small></div><span class="role-permission">May cancel</span></div><div class="role-row"><div class="avatar dashed">P</div><div class="role-person"><strong>Payee</strong><small>${esc(short(request.target))} · public transfer target</small></div><span class="role-permission">Receives after execution</span></div>`
    : `<div class="role-row"><div class="avatar dashed">—</div><div class="role-person"><strong>No actors loaded</strong><small>Load a finalized request above to inspect its public accounts.</small></div><span class="role-permission">Unavailable</span></div>`;
  return `<section class="panel roles-panel auditor-actors"><div class="panel-heading"><div><div class="eyebrow">ACTORS & PERMISSIONS</div><h2>Observed request actors</h2></div><span class="state-tag ${request ? "green-tag" : "gray-tag"}">${request ? "OBSERVED" : "WAITING"}</span></div><p class="panel-copy">These registry-bound accounts belong to the loaded public request. They are not team members or editable role grants.</p>${rows}</section>`;
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

function wireEvents(): void {
  if (studioScrollHandler) window.removeEventListener("scroll", studioScrollHandler);
  if (studioScrollFrame !== null) cancelAnimationFrame(studioScrollFrame);
  studioScrollHandler = null;
  studioScrollFrame = null;
  installCardHelp();
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
  app.querySelectorAll<HTMLButtonElement>("[data-studio-step]").forEach((button) => button.addEventListener("click", () => goToStudioStep(Number(button.dataset.studioStep))));
  app.querySelectorAll<HTMLButtonElement>("[data-policy-action]").forEach((button) => button.addEventListener("click", () => void submitInteractiveGovernance(button.dataset.policyAction ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-live-policy-action]").forEach((button) => button.addEventListener("click", () => void submitLiveFccGovernance(button.dataset.livePolicyAction ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-request-kind]").forEach((button) => button.addEventListener("click", () => prepareRequestTransaction(button.dataset.requestKind ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-request-mode]").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.requestMode;
    if (mode !== "CREATE" && mode !== "INSPECT") return;
    requestsMode = mode;
    render();
  }));
  app.querySelector<HTMLSelectElement>("#request-example")?.addEventListener("change", (event) => {
    requestExampleSelection = (event.currentTarget as HTMLSelectElement).value;
    const example = REVIEWED_REQUEST_EXAMPLES.find((item) => item.id === requestExampleSelection);
    requestInput = example?.id ?? "";
    resetRequestLookup(`Ready to verify ${example ? example.label.toLowerCase() : "a custom V2 request ID"} from finalized Coston2 state.`);
    render();
    if (!example) requestAnimationFrame(() => app.querySelector<HTMLInputElement>("#request-id")?.focus());
  });
  app.querySelector<HTMLInputElement>("#request-id")?.addEventListener("input", (event) => {
    requestInput = (event.currentTarget as HTMLInputElement).value;
    requestExampleSelection = "custom";
    const select = app.querySelector<HTMLSelectElement>("#request-example");
    if (select) select.value = "custom";
    requestIntent = null;
    requestTransactionState = { status: "IDLE" };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-vault-action]").forEach((button) => button.addEventListener("click", () => prepareVaultTransaction(button.dataset.vaultAction ?? "")));
  app.querySelector<HTMLInputElement>("#vault-amount")?.addEventListener("input", (event) => {
    vaultAmountInput = (event.currentTarget as HTMLInputElement).value;
    vaultIntent = null;
    if (vaultTransactionState.status === "ERROR") vaultTransactionState = { status: "IDLE" };
  });
  app.querySelector<HTMLInputElement>("#interactive-fund-amount")?.addEventListener("input", (event) => { interactiveFundInput = (event.currentTarget as HTMLInputElement).value; });
  app.querySelector<HTMLInputElement>("#interactive-request-amount")?.addEventListener("input", (event) => { interactiveRequestAmountInput = (event.currentTarget as HTMLInputElement).value; });
  app.querySelector<HTMLInputElement>("#live-fcc-request-amount")?.addEventListener("input", (event) => { liveFccRequestAmountInput = (event.currentTarget as HTMLInputElement).value; });
  app.querySelector<HTMLInputElement>("#delegated-policy-commitment")?.addEventListener("input", (event) => {
    delegatedPolicyInput = (event.currentTarget as HTMLInputElement).value.trim();
    delegatedPolicyRead = null;
    delegatedPolicyNotice = "Load the edited commitment from the finalized V2 registry.";
  });
  app.querySelector<HTMLInputElement>("#delegated-target")?.addEventListener("input", (event) => { delegatedTargetInput = (event.currentTarget as HTMLInputElement).value.trim(); });
  const form = app.querySelector<HTMLFormElement>("#studio-form");
  form?.addEventListener("submit", (event) => { event.preventDefault(); advanceStudioRules(form); });
  form?.addEventListener("input", () => {
    studioDraft = readStudioDraft(form);
    studioRulesReviewed = false;
    updateStudioHumanHints(form);
    if (studioCompilation) {
      studioCompilation = null;
      const value = app.querySelector<HTMLElement>("#commitment-value");
      if (value) value.textContent = "Draft changed — recompute";
      const notice = app.querySelector<HTMLElement>("#studio-notice");
      if (notice) notice.textContent = "Draft changed. The previous commitment is no longer current.";
      resetLiveFccPolicySession("Draft changed. Recompute before collecting new live machine receipts.");
    }
  });
  form?.querySelectorAll<HTMLInputElement>('input[name="scheduleMode"]').forEach((input) => input.addEventListener("change", () => {
    if (input.value === "recurring" && studioDraft.scheduleIntervalSeconds === "0") {
      studioDraft = { ...studioDraft, scheduleIntervalSeconds: "604800", scheduleGraceSeconds: "86400" };
    }
    if (input.value === "adhoc") studioDraft = { ...studioDraft, scheduleIntervalSeconds: "0", scheduleGraceSeconds: "0" };
    render();
  }));
  if (activeView === "studio" && !landingOpen) wireStudioSectionTracking();
  wireLandingMotion();
}

function installCardHelp(): void {
  const cards = app.querySelectorAll<HTMLElement>(".content .panel, .landing-shell article");
  cards.forEach((card, index) => {
    if (card.querySelector(":scope > .card-help")) return;
    const title = card.querySelector<HTMLElement>("h2, h3, strong")?.textContent?.trim() || "this section";
    const tooltip = document.createElement("span");
    const tooltipId = `card-help-${index}`;
    tooltip.className = "card-help-tooltip";
    tooltip.id = tooltipId;
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = card.dataset.help || cardHelpText(card, title);
    const button = document.createElement("button");
    button.className = "card-help";
    button.type = "button";
    button.setAttribute("aria-label", `How to use ${title}`);
    button.setAttribute("aria-describedby", tooltipId);
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<span aria-hidden="true">?</span>';
    button.append(tooltip);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const pinned = button.classList.toggle("pinned");
      button.setAttribute("aria-expanded", String(pinned));
    });
    button.addEventListener("blur", () => {
      button.classList.remove("pinned");
      button.setAttribute("aria-expanded", "false");
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      button.classList.remove("pinned");
      button.setAttribute("aria-expanded", "false");
      button.blur();
    });
    card.classList.add("has-card-help");
    card.append(button);
  });
}

function cardHelpText(card: HTMLElement, title: string): string {
  if (card.classList.contains("guardian-card")) return `Use ${title} to understand one trust responsibility. The badge reports delivery evidence; it is not a button or an authorization result.`;
  if (card.classList.contains("use-case-card")) return `This is an example policy pattern, not a live customer deployment. Open Policy Studio to adapt the pattern and review its public/private boundary.`;
  if (card.classList.contains("boundary-column")) return `Compare this list with the opposite column. PayGuard protects policy rules, while ordinary amount, recipient, timing, and transaction graph remain public.`;
  if (card.classList.contains("vault-transaction-panel")) return "Enter one exact FTestXRP amount, prepare an operation, review the exact account and contract, then confirm in the wallet. Controls remain disabled until finalized Coston2 checks pass.";
  if (card.classList.contains("vault-overview")) return "Use the three headline values for the current funding decision. The finalized block, accounting totals, conservation, runtime, prepared operation, and explorer link remain visible below for direct verification.";
  if (card.classList.contains("request-lookup")) return isReviewedRequestInput()
    ? "Choose a V2 request ID created before this browser session, then re-read its current finalized state. The offered IDs are not activity from the connected wallet or a substitute for the live lookup."
    : "Paste a bytes32 request ID and load one finalized public Coston2 router checkpoint. A user-supplied ID is not inferred to belong to the connected wallet.";
  if (card.classList.contains("request-transaction-panel")) return "These controls only advance an existing canonical request. Execute, expire, or cancel is enabled from verified chain state; the browser never supplies ALLOW or a policy decision.";
  if (card.classList.contains("studio-step-panel")) return `Use the sticky step bar to jump to ${title} or reach it by scrolling. Locked sections remain readable, but their state-changing controls stay disabled until prior gates pass; draft values never enter browser storage.`;
  if (card.classList.contains("receipt-card")) return "Inspect the frozen machine identities and custody progress here. Registration remains blocked unless the exact domain and all three signed receipts verify; unavailable dependencies fail closed.";
  if (card.classList.contains("verify-card") || card.classList.contains("evidence-card") || card.classList.contains("evidence-mirror")) return "This is a wallet-free verification surface. Enter or inspect public identifiers only; missing finalized evidence stays unavailable and never becomes an inferred success.";
  if (activeView === "demo") return `Inspect ${title} as public testnet evidence. Status labels come from decoded artifacts or finalized state; explorer links are the source of truth, and simulated TEE claims never imply hardware verification.`;
  if (activeView === "payee") return `Use ${title} to inspect only the expected public settlement facts. Private caps, target relationships, delegates, and denial details are intentionally absent.`;
  if (activeView === "auditor") return `Use ${title} to verify public commitments, checkpoints, and conservation without connecting a wallet. No private policy or raw signature is requested.`;
  if (activeView === "requests") return `Use ${title} to inspect finalized public request state. Canonical status and time-derived readiness are separate; do not treat a pending but expired window as an expected payment.`;
  return `Use ${title} to inspect the current public-safe state. Hover or focus controls for actions; status labels and values are informational.`;
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
  if (action === "landing") { navigateToLanding(); return; }
  if (action === "open-app") { navigateToView("studio"); return; }
  if (action === "landing-studio") { navigateToView("studio"); return; }
  if (action === "landing-demo") { navigateToView("demo"); return; }
  if (action === "landing-auditor") { navigateToView("auditor"); return; }
  if (action === "studio-compute") { computeStudioAndActivate(); return; }
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
  if (action === "rebind-studio-owner") { rebindStudioOwner(); return; }
  if (action === "collect-live-custody") { void submitLiveFccCustody(); return; }
  if (action === "register-live-policy") { void submitLiveFccPolicyRegistration(); return; }
  if (action === "open-delegated-policy") { openDelegatedPolicy(); return; }
  if (action === "copy-policy-commitment") { void copyPolicyCommitment(); return; }
  if (action === "load-delegated-policy") { void loadDelegatedPolicyForRequest(); return; }
  if (action === "create-live-request") { void submitLiveFccRequest(); return; }
  if (action === "evaluate-live-request") { void submitLiveFccEvaluation(); return; }
  if (action === "execute-live-request") { void submitLiveFccExecution(); return; }
  if (action === "reset-live-request") { resetLiveFccRequest(); return; }
  if (action === "collect-demo-custody") { void submitInteractiveCustody(); return; }
  if (action === "register-demo-policy") { void submitInteractivePolicyRegistration(); return; }
  if (action === "refresh-interactive-account") { void refreshInteractiveAccount(); return; }
  if (action === "demo-fund") { void submitInteractiveFunding(); return; }
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

function goToStudioStep(value: number): void {
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) return;
  studioStep = value;
  render();
  scrollToStudioStep(value);
}

function scrollToStudioStep(value: number): void {
  requestAnimationFrame(() => {
    const section = app.querySelector<HTMLElement>(`#studio-section-${value}`);
    section?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
}

function wireStudioSectionTracking(): void {
  const sections = Array.from(app.querySelectorAll<HTMLElement>("[data-studio-section]"));
  if (sections.length !== 4) return;
  const update = (): void => {
    studioScrollFrame = null;
    let current: StudioStep = 1;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 176) current = Number(section.dataset.studioSection) as StudioStep;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) current = 4;
    if (current === studioStep) return;
    studioStep = current;
    const labels: Record<StudioStep, string> = { 1: "Template", 2: "Rules", 3: "Review", 4: "Activate" };
    const progress = app.querySelector<HTMLElement>(".studio-progress");
    const meta = progress?.querySelector<HTMLElement>(".studio-progress-meta");
    const metaStep = meta?.querySelector<HTMLElement>("span");
    const metaLabel = meta?.querySelector<HTMLElement>("strong");
    if (metaStep) metaStep.textContent = `Step ${current} of 4`;
    if (metaLabel) metaLabel.textContent = labels[current];
    progress?.querySelectorAll<HTMLButtonElement>(".studio-step").forEach((button) => {
      const active = Number(button.dataset.studioStep) === current;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  };
  studioScrollHandler = () => {
    if (studioScrollFrame !== null) return;
    studioScrollFrame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", studioScrollHandler, { passive: true });
  update();
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

function resetRequestLookup(notice: string): void {
  requestReadSequence += 1;
  requestLoading = false;
  requestFinalizedBlock = null;
  requestFinalizedAt = null;
  requestPolicyOwner = null;
  requestIntent = null;
  requestTransactionState = { status: "IDLE" };
  requestState = unavailableRequestState();
  payeeState = unavailablePayeeState();
  notificationState = unavailableNotificationState();
  requestNotice = notice;
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
  if (value !== "DEPOSIT" && value !== "WITHDRAW") return;
  try {
    const amount = parseFTestXrpAmount(vaultAmountInput);
    const steps = planVaultUserAction(value, amount, live);
    vaultIntent = { action: value, amount, steps };
    vaultTransactionState = { status: "IDLE" };
    showAppNotice(`Review the ${value.toLowerCase()} operation below. It requires ${steps.length} wallet confirmation${steps.length === 1 ? "" : "s"}.`);
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
  const completed: VaultTransactionSummary[] = [];
  try {
    let latest = coston2State.snapshot;
    for (const phase of intent.steps) {
      vaultTransactionState = { status: "SUBMITTING", action: intent.action, phase, amount: intent.amount };
      showAppNotice(phase === "APPROVE"
        ? "Step 1 of 2: confirm the exact FTestXRP allowance in your wallet."
        : `Confirm the ${phase.toLowerCase()} transaction, then wait for finalized verification.`, 12_000);
      render();
      const result = await executeVaultTransaction(phase, intent.amount, account, walletProvider);
      if (connectedAccount()?.toLowerCase() !== account.toLowerCase()) throw new VaultTransactionError("POSTCONDITION_FAILED");
      completed.push({ kind: result.kind, hash: result.hash, blockNumber: result.blockNumber });
      latest = result.after;
      coston2State = { status: "READY", snapshot: latest };
    }
    vaultIntent = null;
    vaultTransactionState = { status: "SUCCESS", action: intent.action, amount: intent.amount, transactions: completed };
    showAppNotice(`${intent.action === "DEPOSIT" ? "Deposit" : "Withdrawal"} complete; every receipt, event and finalized balance matched.`);
  } catch (error) {
    const message = error instanceof VaultTransactionError
      ? vaultTransactionFailureMessage(error.reason)
      : "The transaction could not be verified safely.";
    vaultIntent = null;
    const partial = completed.length > 0
      ? `${message} ${completed.length === 1 && completed[0]?.kind === "APPROVE" ? "The approval finalized, but no deposit is being asserted." : "Completed transaction links are shown below."}`
      : message;
    vaultTransactionState = { status: "ERROR", message: partial, ...(completed.length ? { transactions: completed } : {}) };
    showAppNotice(partial, 10_000);
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
  studioDraft = studioTemplateDraft("delegated-allowance");
  studioEntropy = createStudioEntropy();
  studioCompilation = null;
  studioTemplateChosen = false;
  studioRulesReviewed = false;
  studioIssues = [];
  studioNotice = "Wallet changed. The previous wallet's private policy draft was discarded from this tab.";
  resetInteractivePolicySession("Wallet changed. Prepare a fresh owner-bound simulation policy.");
  liveFccTransactions = [];
  resetLiveFccPolicySession("Wallet changed. Prepare a fresh policy bound to the newly connected owner.");
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
  return { account: walletState.account, config: liveFccConfigState.config, provider: walletProvider };
}

function rebindStudioOwner(): void {
  const account = connectedAccount();
  if (!account) { void connectWallet(); return; }
  const requesterFollowedOwner = studioDraft.requester.toLowerCase() === studioDraft.owner.toLowerCase();
  studioDraft = { ...studioDraft, owner: account, ...(requesterFollowedOwner ? { requester: account } : {}) };
  studioEntropy = createStudioEntropy();
  studioCompilation = null;
  studioRulesReviewed = false;
  studioIssues = [];
  studioStep = 2;
  resetLiveFccPolicySession("Draft owner changed. Review and compute a fresh owner-bound commitment.");
  studioNotice = `Connected wallet ${short(account)} is now the draft owner. Nothing has been submitted.`;
  render();
  scrollToStudioStep(2);
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
      requester: account,
      registry: config.contracts.registry,
      vault: config.contracts.vault,
      router: config.contracts.router,
      asset: config.contracts.asset,
      maxPerAction: "0.1",
      dailyCap: "0.15",
      startAt: (now - 60n).toString(),
      endAt: (now + 86_400n).toString(),
      scheduleIntervalSeconds: "0",
      scheduleGraceSeconds: "0",
      maxOccurrences: "10",
    };
    studioCompilation = null;
    studioTemplateChosen = true;
    studioRulesReviewed = false;
    studioStep = 2;
    studioIssues = [];
    resetLiveFccPolicySession("Live V2 domain loaded. Review private rules, then validate and compute.");
    studioNotice = "Live A/B/D domain loaded with fresh in-memory entropy. Nothing has been sent yet.";
  } catch {
    liveFccNotice = "Connect your Coston2 wallet before preparing the live V2 domain.";
  }
  render();
  if (studioStep === 2) scrollToStudioStep(2);
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
  liveFccNotice = "Confirm the exact V2 policy binding and three machine receipts, then wait for finalized readback.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    liveFccPolicyRegistration = await registerLivePolicy(liveFccSession, account, provider, config);
    liveFccPolicyStatus = 1;
    delegatedPolicyInput = liveFccSession.binding.policyCommitment;
    delegatedTargetInput = liveFccSession.policy.allowTargets[0] ?? "";
    delegatedPolicyRead = await loadLivePolicy(liveFccSession.binding.policyCommitment, config);
    delegatedPolicyNotice = "Active policy loaded. Share the public commitment with its authorized requester.";
    addLiveFccTransaction("Register live FCC policy", liveFccPolicyRegistration);
    liveFccNotice = "Live V2 policy is active on Coston2 with all three registered custody receipts.";
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
  if (!delegatedPolicyRead || delegatedPolicyRead.status !== 1) return;
  liveFccBusy = "REQUEST";
  liveFccNotice = "Confirm the requester, public amount and payee. The policy owner does not sign this transaction.";
  render();
  try {
    const { account, config, provider } = liveFccContext();
    const amount = parseFTestXrpAmount(liveFccRequestAmountInput);
    const target = getAddress(delegatedTargetInput || account);
    liveFccRequest = await createDelegatedLiveRequest(delegatedPolicyRead.binding, target, amount, account, provider, config);
    addLiveFccTransaction(`Requester creates ${short(liveFccRequest.request.requestId)}`, liveFccRequest);
    requestInput = liveFccRequest.request.requestId;
    requestExampleSelection = "custom";
    liveFccEvaluation = null;
    liveFccExecution = null;
    liveFccNotice = "The delegated request is Pending at finality. The owner did not sign; no funds reserve until two machine results match.";
    await refreshPublicRequest(false);
  } catch {
    liveFccRequest = null;
    liveFccNotice = "Live request creation failed closed. No pending action or authorization is asserted.";
  } finally {
    liveFccBusy = "";
    render();
  }
}

function openDelegatedPolicy(): void {
  if (!liveFccSession) return;
  delegatedPolicyInput = liveFccSession.binding.policyCommitment;
  delegatedTargetInput = liveFccSession.policy.allowTargets[0] ?? "";
  delegatedPolicyNotice = "Owner-prepared policy loaded. Switch to the authorized requester wallet before creating the request.";
  navigateToView("requests");
}

async function copyPolicyCommitment(): Promise<void> {
  if (!liveFccSession || !navigator.clipboard) {
    showAppNotice("Clipboard is unavailable. Select the public commitment field and copy it manually.");
    render();
    return;
  }
  try {
    await navigator.clipboard.writeText(liveFccSession.binding.policyCommitment);
    showAppNotice("Public policy commitment copied. Share only this value—not the private policy.");
  } catch {
    showAppNotice("Copy was blocked. Select the public commitment field and copy it manually.");
  }
  render();
}

async function loadDelegatedPolicyForRequest(): Promise<void> {
  if (liveFccConfigState.status !== "READY" || !/^0x[0-9a-fA-F]{64}$/.test(delegatedPolicyInput)) {
    delegatedPolicyRead = null;
    delegatedPolicyNotice = "Enter one exact 32-byte policy commitment.";
    render();
    return;
  }
  liveFccBusy = "LOAD_POLICY";
  delegatedPolicyNotice = "Reading the finalized V2 registry and exact machine domain.";
  render();
  try {
    delegatedPolicyRead = await loadLivePolicy(delegatedPolicyInput as Hex, liveFccConfigState.config);
    delegatedPolicyNotice = delegatedPolicyRead.status === 1
      ? `Active policy owned by ${short(delegatedPolicyRead.binding.owner)}. The requester may now create a public request.`
      : `Policy is ${delegatedPolicyRead.status === 2 ? "stopped" : delegatedPolicyRead.status === 3 ? "revoked" : "unavailable"}; no request may be created.`;
  } catch {
    delegatedPolicyRead = null;
    delegatedPolicyNotice = "Policy lookup failed closed or the commitment is outside the hosted V2 domain.";
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
    if (account.toLowerCase() !== liveFccRequest.request.requester.toLowerCase()) throw new Error("REQUESTER_REQUIRED");
    liveFccEvaluation = await evaluateLiveRequest(liveFccRequest.request.requestId, account, provider, config);
    if (liveFccEvaluation.transactions.dispatch) addLiveFccTransaction("Dispatch public state to A/B/D", { hash: liveFccEvaluation.transactions.dispatch });
    liveFccEvaluation.transactions.submit.forEach((hash, index) => addLiveFccTransaction(`Submit matching FCC result ${index + 1}`, { hash }));
    liveFccNotice = liveFccEvaluation.decision === "ALLOW"
      ? "Two matching machine signatures moved the router to Allowed. The exact amount is reserved; execution remains separate."
      : `Two matching machine signatures finalized Denied · ${liveFccEvaluation.publicReasonClass}. Vault accounting did not move.`;
    await refreshCoston2State();
    await refreshPublicRequest(false);
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
    await refreshPublicRequest(false);
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
  liveFccNotice = "Ready to create the next request from the canonical V2 deployment checkpoint.";
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
    const interactiveEntropy = createStudioEntropy();
    const interactiveDraft: StudioDraft = {
      ...studioTemplateDraft("delegated-allowance"),
      templateId: "delegated-allowance",
      policyName: `interactive-demo-${now}`,
      owner: account,
      target: account,
      requester: account,
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
    };
    resetInteractivePolicySession("Isolated Coston2 demo domain loaded. Review private rules, then validate and compute.");
    interactiveStudioCompilation = compileStudioDraft(interactiveDraft, interactiveEntropy);
    interactiveNotice = "Isolated V1 policy computed in memory. Collect three simulation receipts when ready.";
  } catch {
    interactiveNotice = "Connect a Coston2 wallet and wait for the interactive configuration first.";
  }
  render();
}

function resetInteractivePolicySession(notice: string): void {
  interactiveStudioCompilation = null;
  interactiveSession = null;
  interactivePolicyRegistration = null;
  interactiveRequest = null;
  interactiveThreshold = null;
  interactiveThresholdTransactions = [];
  interactiveExecution = null;
  interactiveNotice = notice;
}

async function submitInteractiveCustody(): Promise<void> {
  if (!interactiveStudioCompilation) return;
  interactiveBusy = "CUSTODY";
  interactiveNotice = "Confirm three owner signatures. Each binds one ciphertext to one simulated actor.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    interactiveSession = await collectDemoCustody(interactiveStudioCompilation.policy, account, provider, config);
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

async function submitInteractiveFunding(): Promise<void> {
  interactiveBusy = "FUND";
  interactiveNotice = "Preparing the simulation-only deposit and checking whether an exact approval is required.";
  render();
  try {
    const { account, config, provider } = interactiveContext();
    const amount = parseFTestXrpAmount(interactiveFundInput);
    if (!interactiveAccountSnapshot) throw new Error("DEMO_ACCOUNT_REQUIRED");
    const steps: readonly ("APPROVE" | "DEPOSIT")[] = interactiveAccountSnapshot.allowance < amount
      ? ["APPROVE", "DEPOSIT"] : ["DEPOSIT"];
    for (const kind of steps) {
      interactiveNotice = kind === "APPROVE"
        ? "Confirm the exact demo-vault allowance, then PayGuard will continue to the deposit."
        : "Confirm the demo-vault deposit and wait for finalized verification.";
      render();
      const result = await executeDemoVaultAction(kind, amount, account, provider, config);
      addInteractiveTransaction(kind === "APPROVE" ? "Approve demo vault" : "Deposit demo vault", result);
    }
    interactiveAccountSnapshot = await loadDemoAccount(account, config, interactiveSession?.binding.policyCommitment);
    interactiveNotice = "Deposit complete. Every required receipt, event, finalized balance, and conservation check matched.";
  } catch {
    interactiveNotice = "Funding stopped safely or was cancelled. Check the transaction list for any approval that finalized; no unverified deposit is asserted.";
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

function advanceStudioRules(form: HTMLFormElement): void {
  studioDraft = readStudioDraft(form);
  studioIssues = validateStudioDraft(studioDraft);
  if (studioIssues.length > 0) {
    studioRulesReviewed = false;
    studioCompilation = null;
    studioNotice = "Fix the highlighted rule fields. Nothing was sent.";
    render();
    scrollToStudioStep(2);
    return;
  }
  studioRulesReviewed = true;
  studioCompilation = null;
  studioNotice = "Rules validated locally. Review what becomes public before computing.";
  studioStep = 3;
  render();
  scrollToStudioStep(3);
}

function computeStudioAndActivate(): void {
  if (!studioRulesReviewed) return;
  try {
    studioCompilation = compileStudioDraft(studioDraft, studioEntropy);
    studioIssues = [];
    studioNotice = "Commitment computed locally. No ciphertext, receipt, or activation was submitted.";
    studioStep = 4;
  } catch (error) {
    studioCompilation = null;
    studioIssues = error instanceof StudioValidationError ? error.issues : [{ field: "policy", message: "The policy could not be compiled safely." }];
    studioRulesReviewed = false;
    studioStep = 2;
    studioNotice = "Validation failed locally. Nothing was sent.";
  }
  render();
  scrollToStudioStep(studioStep);
}

function selectTemplate(value: string): void {
  if (!STUDIO_TEMPLATES.some((template) => template.id === value)) return;
  const account = connectedAccount();
  const domain = liveFccConfigState.status === "READY" ? liveFccConfigState.config.contracts : PAYGUARD_COSTON2;
  studioDraft = { ...studioTemplateDraft(value as StudioTemplateId), owner: account ?? "", requester: account ?? "", registry: domain.registry, vault: domain.vault, router: domain.router, asset: domain.asset };
  studioEntropy = createStudioEntropy();
  studioCompilation = null;
  studioTemplateChosen = true;
  studioRulesReviewed = false;
  studioIssues = [];
  studioNotice = "Template loaded with fresh in-memory salt and submission nonce.";
  resetLiveFccPolicySession("Template changed. Compute a fresh policy before collecting live FCC receipts.");
  render();
}

function readStudioDraft(form: HTMLFormElement): StudioDraft {
  const data = new FormData(form);
  const value = (field: Exclude<keyof StudioDraft, "templateId">): string => String(data.get(field) ?? "").trim();
  const scheduleMode = String(data.get("scheduleMode") ?? (studioDraft.scheduleIntervalSeconds === "0" ? "adhoc" : "recurring"));
  return {
    templateId: studioDraft.templateId,
    policyName: value("policyName"),
    owner: value("owner"),
    registry: value("registry"),
    vault: value("vault"),
    router: value("router"),
    asset: value("asset"),
    target: value("target"),
    requester: value("requester"),
    maxPerAction: value("maxPerAction"),
    dailyCap: value("dailyCap"),
    startAt: dateTimeInputToUnix(value("startAt")),
    endAt: dateTimeInputToUnix(value("endAt")),
    scheduleIntervalSeconds: scheduleMode === "adhoc" ? "0" : value("scheduleIntervalSeconds"),
    scheduleGraceSeconds: scheduleMode === "adhoc" ? "0" : value("scheduleGraceSeconds"),
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
void fetchLiveV2LifecycleEvidence()
  .then((evidence) => { liveV2EvidenceState = { status: "READY", evidence }; if (!landingOpen) render(); })
  .catch(() => { liveV2EvidenceState = { status: "UNAVAILABLE" }; if (!landingOpen) render(); });
void fetchLiveFccConfig()
  .then(async (config) => {
    liveFccConfigState = { status: "READY", config };
    liveFccNotice = "Relay, V2 contracts and registered FCC machines A/B/D passed live preflight.";
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
