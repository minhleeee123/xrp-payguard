import "./styles.css";
import "./studio.css";
import {
  unavailableAuditState,
  unavailablePolicyCustodyState,
  unavailableNotificationState,
  unavailablePayeeState,
  unavailableRequestState,
  unavailableVaultState,
  unavailableWorkspaceState,
  buildPublicNotificationExport,
  buildUnavailableNotificationExport,
  encodePublicNotificationExport,
  type PublicAuditReadState,
  type PublicPolicyCustodyReadState,
  type PublicNotificationReadState,
  type PublicPayeeReadState,
  type PublicRequestReadState,
  type PublicWorkspaceReadState,
  type VaultReadState,
} from "@xrp-payguard/integrations";
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

type View = "overview" | "studio" | "vaults" | "requests" | "payee" | "auditor" | "team";

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
let vaultState: VaultReadState = unavailableVaultState();
let requestState: PublicRequestReadState = unavailableRequestState();
let auditState: PublicAuditReadState = unavailableAuditState();
let custodyState: PublicPolicyCustodyReadState = unavailablePolicyCustodyState();
let payeeState: PublicPayeeReadState = unavailablePayeeState();
let workspaceState: PublicWorkspaceReadState = unavailableWorkspaceState();
let notificationState: PublicNotificationReadState = unavailableNotificationState();
let notificationOpen = false;
let mobileMenuOpen = false;
let landingOpen = window.location.hash === "#landing";

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
        <button class="brand brand-link" type="button" data-action="landing" aria-label="Open PayGuard landing page"><span class="brand-mark">P</span><span>PayGuard</span><span class="brand-beta">LOCAL</span></button>
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
          <div class="security-card"><span class="status-dot amber"></span><div><strong>Local preview</strong><small>Live providers are not connected</small></div></div>
          <button class="help-link" type="button" data-action="landing">? <span>How PayGuard works</span></button>
          <div class="user-row"><div class="avatar">ML</div><div><strong>Owner</strong><small>Wallet not connected</small></div><span class="more">···</span></div>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${label(activeView)}</strong></div><div class="top-actions"><span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>planned</em></span><button class="icon-button" type="button" data-action="notifications" aria-label="Notifications" aria-expanded="${notificationOpen}">♢${notificationState.status === "READY" && notificationState.feed.notifications.length > 0 ? '<span class="notification-dot"></span>' : ""}</button><button class="outline-button" type="button" data-action="connect">Connect wallet</button></div></header>
        ${notificationOpen ? notificationTray() : ""}
        <section class="content">${viewContent()}</section>
        ${appNotice ? `<div class="toast" role="status">${esc(appNotice)}</div>` : ""}
      </main>
    </div>`;
  wireEvents();
}

function landingView(): string {
  return `<div class="landing-shell">
    <header class="landing-topbar"><a class="landing-brand" href="#landing" aria-label="PayGuard home"><span class="brand-mark">P</span><span>PayGuard</span><span class="brand-beta">LOCAL</span></a><nav class="landing-nav" aria-label="Landing navigation"><a href="#landing">WHY PAYGUARD</a><a href="#trust">TRUST BOUNDARY</a><a href="#journey">JOURNEY</a><a href="#limits">LIMITATIONS</a></nav><button class="outline-button" type="button" data-action="open-app">Open app</button></header>
    <main>
      <section class="landing-hero" aria-labelledby="landing-title"><div class="landing-hero-art" aria-hidden="true"><svg viewBox="0 0 820 470" role="presentation"><g fill="#fff">${landingDots()}</g></svg></div><div class="landing-eyebrow">PRIVATE POLICY · PUBLIC ACTION</div><h1 id="landing-title">Authorize public value with <em>private</em> rules.</h1><p class="landing-lede">XRP PayGuard keeps authorization rules inside a registered FCC machine set while the requested action, amount, recipient, and settlement remain public and auditable.</p><div class="landing-actions"><button class="primary-button" type="button" data-action="landing-studio">Open Policy Studio</button><a class="landing-text-link" href="#trust">See the trust boundary ↘</a></div><div class="landing-status"><span class="status-dot amber"></span><span>Coston2 release <strong>planned</strong> · local product shell only</span></div></section>
      <div class="neon-divider" aria-hidden="true"></div>
      <section class="landing-section" id="trust" aria-labelledby="trust-title"><div class="landing-section-heading"><div><div class="eyebrow">BUILT FOR PUBLIC PROOF</div><h2 id="trust-title">Private rules.<br /><em>Public</em> checkpoints.</h2></div><p>Ordinary FTestXRP/FXRP transfers reveal amount, recipient, and timing. PayGuard hides only the policy logic that decides whether a public action is permitted.</p></div><div class="landing-card-grid"><article class="landing-card"><div class="landing-card-meta">01 · FCC CUSTODY</div><h3>Three receipts before activation.</h3><p>Each machine signs the same policy commitment, domain, code version, and nonce. A local preview never substitutes a receipt.</p><span class="landing-tag">PLANNED · 3 OF 3 REQUIRED</span></article><article class="landing-card"><div class="landing-card-meta">02 · PUBLIC EXECUTION</div><h3>Two matching results over one request.</h3><p>Threshold results bind the exact chain, vault, router, policy, request, checkpoint, nonce, attempt, and expiry before the router can act.</p><span class="landing-tag">LOCAL · 2 OF 3 TARGET</span></article><article class="landing-card"><div class="landing-card-meta">03 · RECOVERABLE STATE</div><h3>Chain checkpoints remain authoritative.</h3><p>Relays and browsers resume from finalized public state. Failure is denied or resumable; it is never presented as a mock approval.</p><span class="landing-tag">LOCAL · FAIL CLOSED</span></article></div></section>
      <section class="landing-section journey-section" id="journey" aria-labelledby="journey-title"><div class="eyebrow">FLAGSHIP JOURNEY</div><h2 id="journey-title">From XRPL intent to a public Flare action.</h2><div class="journey-track"><div class="journey-step"><span>01</span><strong>XRPL wallet</strong><small>Owner signs a public payment; PayGuard never receives the XRPL seed.</small></div><div class="journey-arrow" aria-hidden="true">→</div><div class="journey-step"><span>02</span><strong>FDC / Smart Account</strong><small>Payment proof and nonce checkpoints are verified asynchronously.</small></div><div class="journey-arrow" aria-hidden="true">→</div><div class="journey-step"><span>03</span><strong>Flare vault</strong><small>Public balance and conservation state advance atomically.</small></div><div class="journey-arrow" aria-hidden="true">→</div><div class="journey-step"><span>04</span><strong>Public action</strong><small>Only an exact threshold result can authorize execution.</small></div></div></section>
      <section class="landing-limitations" id="limits" aria-labelledby="limits-title"><div><div class="eyebrow">LIMITATIONS · READ FIRST</div><h2 id="limits-title">This is not private money.</h2></div><div><p>PayGuard does not hide transfers, mix funds, or make an allowlisted Web2 source truthful. It cannot report a proof, price, payment, or execution while an RPC, FDC, FTSO, FCC, relay, or wallet dependency is unavailable.</p><button class="outline-button" type="button" data-action="open-app">Inspect the local app</button></div></section>
    </main><footer class="landing-footer"><span>PAYGUARD · PUBLIC CONTROL / PRIVATE RULES</span><span>TESTNET-ONLY PRODUCT PREVIEW</span></footer>
  </div>`;
}

function landingDots(): string {
  const dots: string[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 18; column += 1) {
      const x = 35 + column * 45;
      const y = 45 + row * 46;
      const distance = Math.abs(column - 8.5) / 9 + Math.abs(row - 4) / 5;
      if (distance < 1.45 && ((row * 7 + column * 11) % 5 !== 0 || distance < 0.75)) {
        dots.push(`<circle cx="${x}" cy="${y}" r="1.5" opacity="${(0.35 + ((row + column) % 4) * 0.12).toFixed(2)}" />`);
      }
    }
  }
  return dots.join("");
}

function navItem(view: View, text: string, icon: string): string {
  return `<button class="nav-item nav-item-${view} ${activeView === view ? "active" : ""}" type="button" data-view="${view}"><span class="nav-icon">${icon}</span>${text}${view === "requests" ? '<span class="nav-count">2</span>' : ""}</button>`;
}

function label(view: View): string { return ({ overview: "Overview", studio: "Policy Studio", vaults: "Vaults", requests: "Requests", payee: "Payee", auditor: "Auditor", team: "Team & roles" })[view]; }

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
  return `${pageIntro("PERSONAL PAYGUARD", "Good morning, Minh.", "Public funds stay visible. Your payment rules stay inside the registered FCC machine set.", "new-policy")}
    <div class="notice-banner"><span class="notice-icon">◉</span><div><strong>Live connection is not configured</strong><span>This local preview never reports a mock approval, payment, price, or proof. Connect a verified Coston2 release to continue.</span></div><button type="button" data-action="details">View limits</button></div>
    <div class="metric-grid"><div class="metric-card"><div class="metric-label">AVAILABLE BALANCE <span class="public-pill">PUBLIC</span></div><div class="metric-value">— <small>FTestXRP</small></div><div class="metric-foot muted">No vault provider connected</div></div><div class="metric-card"><div class="metric-label">RESERVED <span class="public-pill">PUBLIC</span></div><div class="metric-value">—</div><div class="metric-foot muted">Pending state unavailable</div></div><div class="metric-card"><div class="metric-label">ACTIVE POLICIES</div><div class="metric-value">0</div><div class="metric-foot"><span class="status-dot amber"></span> No live policy registry</div></div><div class="metric-card accent-card"><div class="metric-label">NEXT RECURRING ACTION</div><div class="metric-value">—</div><div class="metric-foot muted">Create a policy to preview</div></div></div>
    <div class="section-grid"><section class="panel activity-panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC CHECKPOINTS</div><h2>Recent activity</h2></div><button class="text-button" type="button" data-view="requests">View all ↗</button></div><div class="empty-state"><div class="empty-orbit">◌</div><strong>No verified activity yet</strong><span>Requests, decisions, and transfers appear here only after a public chain checkpoint is finalized.</span><button class="outline-button" type="button" data-action="new-policy">Explore Policy Studio</button></div></section><section class="panel health-panel"><div class="panel-heading"><div><div class="eyebrow">DEPENDENCY HEALTH</div><h2>Trust surface</h2></div><span class="health-label"><span class="status-dot amber"></span>Limited</span></div><ul class="health-list"><li><span class="health-icon gray">◇</span><div><strong>FCC machine quorum</strong><small>Registration not verified</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">◈</span><div><strong>FDC attestation</strong><small>Proof verifier not configured</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">◫</span><div><strong>FTSO snapshot</strong><small>Feed resolution not verified</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">▣</span><div><strong>Router & vault</strong><small>Local contracts tested only</small></div><span class="state-tag gray-tag">LOCAL</span></li></ul></section></div>`;
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
  const snapshot = vaultState.status === "UNAVAILABLE" ? undefined : vaultState.snapshot;
  const unavailable = vaultState.status === "UNAVAILABLE";
  const reason = unavailable ? vaultUnavailableReason(vaultState.reason) : "Finalized public snapshot";
  const balance = snapshot ? `${snapshot.available} <small>FTestXRP</small>` : "— <small>FTestXRP</small>";
  const conservation = snapshot ? "Verified from public snapshot" : "Unavailable until finalized RPC state";
  const emergency = snapshot ? (snapshot.emergencyStopped ? "STOPPED" : "RUNNING") : "UNAVAILABLE";
  const checkpoint = snapshot ? short(snapshot.checkpoint) : "—";
  return `${pageIntro("PUBLIC ASSET VAULTS", "Your vaults", "Balances, reservations, and transfers are public chain facts. Funding and withdrawals need a verified wallet connection.", "deposit")}
    <div class="vault-card panel"><div class="vault-card-top"><div class="token-symbol">X</div><div><h2>FTestXRP vault</h2><span class="muted">Public asset · Coston2 target</span></div><span class="state-tag ${unavailable ? "amber-tag" : "green-tag"}">${unavailable ? "UNAVAILABLE" : vaultState.status}</span></div><div class="vault-balance"><span>Available balance</span><strong>${balance}</strong><span class="muted">${reason}</span></div><div class="vault-stats"><div><span>Deposited</span><strong>${snapshot?.deposited ?? "—"}</strong></div><div><span>Reserved</span><strong>${snapshot?.reserved ?? "—"}</strong></div><div><span>Spent</span><strong>${snapshot?.spent ?? "—"}</strong></div><div><span>Withdrawn</span><strong>${snapshot?.withdrawn ?? "—"}</strong></div></div><div class="vault-public-state"><div><span>Conservation</span><strong>${conservation}</strong></div><div><span>Policy caps</span><strong>Private in FCC</strong></div><div><span>Emergency state</span><strong>${emergency}</strong></div><div><span>Checkpoint</span><strong class="mono-value">${esc(checkpoint)}</strong></div></div><div class="vault-actions"><button class="primary-button" type="button" data-action="connect">Connect wallet to fund</button><button class="outline-button" type="button" data-action="details">How XRPL funding works</button></div></div><div class="section-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">FUNDING PATH</div><h2>XRPL → Flare</h2></div><span class="state-tag amber-tag">PLANNED</span></div><div class="step-list"><div class="step-row"><span class="step-number">01</span><div><strong>Build Smart Account operation</strong><small>Owner, PersonalAccount, nonce, asset, amount, fee</small></div></div><div class="step-row"><span class="step-number">02</span><div><strong>Sign an XRPL Payment</strong><small>PayGuard never receives your XRPL seed</small></div></div><div class="step-row"><span class="step-number">03</span><div><strong>Verify an FDC proof</strong><small>Finalization is asynchronous and fail-closed</small></div></div></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">RECOVERY</div><h2>Safe exits</h2></div></div><p class="panel-copy">A stopped policy can release unspent reservations through the router state machine. No recovery path creates an authorization or hides the public transfer graph.</p><button class="text-button" type="button" data-action="details">Read recovery rules ↗</button></section></div>`;
}

function vaultUnavailableReason(reason: string): string {
  return ({
    RPC_UNCONFIGURED: "No verified RPC provider configured",
    RPC_UNAVAILABLE: "RPC provider unavailable",
    SNAPSHOT_UNFINALIZED: "Snapshot is not finalized",
    SNAPSHOT_INVALID: "Public snapshot failed validation",
  } as Record<string, string>)[reason] ?? "Public snapshot unavailable";
}

function requestsView(): string {
  const snapshot = requestState.status === "UNAVAILABLE" ? undefined : requestState.snapshot;
  const unavailable = requestState.status === "UNAVAILABLE";
  const unavailableReason = unavailable ? requestUnavailableReason(requestState.reason) : "Finalized public request";
  const liveReadiness = requestState.status === "UNAVAILABLE" ? undefined : requestState.readiness;
  const readiness = snapshot && liveReadiness ? requestReadinessLabel(liveReadiness) : "UNAVAILABLE";
  const requestCell = snapshot ? `<strong>${esc(short(snapshot.requestId))}</strong><small>Occurrence ${snapshot.occurrence} · nonce ${snapshot.requestNonce}</small>` : `<strong>—</strong><small>No verified request ID</small>`;
  const actionCell = snapshot ? `<strong>${esc(short(snapshot.target))}</strong><small>${snapshot.amount} FTestXRP · public transfer</small>` : `<strong>—</strong><small>Target and amount unavailable</small>`;
  const checkpointCell = snapshot ? `<strong>${esc(short(snapshot.spendCheckpoint))}</strong><small>Slot ${snapshot.scheduleSlot} · expires ${snapshot.expiry}</small>` : `<strong>—</strong><small>Waiting for RPC</small>`;
  const publicState = snapshot
    ? `<div class="request-public-state"><div><span>Readiness</span><strong>${readiness}</strong></div><div><span>Decision evidence</span><strong>${snapshot.decision === "PENDING" ? "Waiting for threshold" : snapshot.decision === "ALLOW" ? "Threshold ALLOW · public" : `DENY · ${snapshot.publicReasonClass ?? "UNKNOWN"}`}</strong></div><div><span>Attempt</span><strong>${snapshot.attempt}</strong></div><div><span>Checkpoint</span><strong class="mono-value">${esc(short(snapshot.requestHash))}</strong></div></div>`
    : `<div class="request-public-state"><div><span>Readiness</span><strong>Unavailable</strong></div><div><span>Decision evidence</span><strong>No chain result</strong></div><div><span>Attempt</span><strong>—</strong></div><div><span>Checkpoint</span><strong>—</strong></div></div>`;
  return `${pageIntro("PUBLIC REQUEST QUEUE", "Requests & schedules", "Executors can advance public checkpoints. They cannot choose ALLOW, read private rules, or bypass the result threshold.", "new-request")}
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACTION REQUESTS</div><h2>${snapshot ? "Public request state" : "Nothing can execute yet"}</h2></div><div class="table-tools"><button class="filter-button" type="button">All statuses⌄</button><button class="icon-button" type="button" aria-label="Refresh">↻</button></div></div><div class="request-table"><div class="table-head"><span>REQUEST</span><span>PUBLIC ACTION</span><span>CHECKPOINT</span><span>STATUS</span><span></span></div><div class="table-row"><span>${requestCell}</span><span>${actionCell}</span><span>${checkpointCell}</span><span><span class="state-tag ${snapshot ? (liveReadiness === "READY_TO_EXECUTE" ? "green-tag" : "gray-tag") : "amber-tag"}">${esc(readiness)}</span></span><span>···</span></div></div>${publicState}<div class="table-footer"><span>Showing public finalized state only</span><span class="muted">${esc(unavailableReason)} · no browser cache</span></div></section><div class="recovery-strip"><div class="recovery-icon">↻</div><div><strong>Fresh-process recovery is built in</strong><p>A relay restart reconstructs work from chain checkpoints, not a private policy database.</p></div><button class="text-button" type="button" data-action="details">See checkpoint model ↗</button></div>`;
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
    ? `<h2>${receipt.status === "SETTLED" ? "Payment settled" : "Expected payment"}</h2><p class="panel-copy">The payee sees only the public amount, destination, timing window, and settlement checkpoint. Private policy rules remain outside this receipt.</p><div class="request-public-state payee-public-state"><div><span>Amount</span><strong>${receipt.expectedAmount} FTestXRP</strong></div><div><span>Target</span><strong class="mono-value">${esc(short(receipt.payee))}</strong></div><div><span>Expected at</span><strong>${receipt.expectedAt}</strong></div><div><span>Expiry</span><strong>${receipt.expiry}</strong></div></div><div class="unavailable-box"><span class="status-dot"></span><div><strong>${receipt.status}</strong><small>${receipt.status === "SETTLED" ? `Transaction ${esc(short(receipt.settlementTransactionHash))} · checkpoint ${esc(short(receipt.settlementCheckpoint))}` : unavailableReason}</small></div></div>`
    : `<h2>No verified request yet</h2><p class="panel-copy">A payee can inspect only a finalized public request, transfer receipt, and supported redemption status. Policy rules, caps, delegates, and private denial reasons stay in FCC custody.</p><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Public request endpoint unavailable</strong><small>${esc(unavailableReason)}. No amount, recipient, timing, or transaction is asserted in this local preview.</small></div></div>`;
  return `${pageIntro("PUBLIC SETTLEMENT VIEW", "Payee status", "See the expected public amount, timing, and settlement receipt without learning the private policy behind the request.")}
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
  return `${pageIntro("WALLET-FREE VERIFIER", "Auditor view", "Inspect public commitments and conservation without connecting a wallet or revealing the policy.")}
    <div class="auditor-grid"><section class="panel verify-card"><div class="eyebrow">PUBLIC EVIDENCE</div><h2>Verify a PayGuard action</h2><p>Paste a request ID or transaction hash from a verified release. Private policy material is never requested.</p><label>Request or transaction ID<input placeholder="0x…" spellcheck="false" /></label><button class="primary-button" type="button" data-action="verify">Check finalized state</button><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>${evidence ? "Public evidence verified" : "Evidence endpoint not connected"}</strong><small>${esc(unavailableReason)}. ${evidence ? `Block ${evidence.evidenceBlock} · ${evidence.executionStatus} · no private payload.` : "This preview cannot assert a transaction, block, proof, or signer."}</small></div></div></section><section class="panel evidence-card"><div class="eyebrow">ASSERTION CHECKLIST</div><h2>What an auditor will see</h2><ul class="evidence-list">${checklist}</ul></section></div>`;
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
  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action ?? "")));
  app.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((button) => button.addEventListener("click", () => selectTemplate(button.dataset.template ?? "")));
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
}

function handleAction(action: string): void {
  if (action === "new-policy") { activeView = "studio"; render(); return; }
  if (action === "landing") { window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#landing`); landingOpen = true; mobileMenuOpen = false; render(); return; }
  if (action === "open-app") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); landingOpen = false; activeView = "overview"; render(); return; }
  if (action === "landing-studio") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); landingOpen = false; activeView = "studio"; render(); return; }
  if (action === "notifications") { notificationOpen = !notificationOpen; render(); return; }
  if (action === "mobile-menu") { mobileMenuOpen = !mobileMenuOpen; render(); return; }
  if (action === "export-notifications") { exportNotifications(); return; }
  if (action === "verify") appNotice = "Evidence endpoint is unavailable; no transaction, block, proof, or signer was asserted.";
  else if (action === "connect") appNotice = "Wallet providers are unavailable until a verified Coston2 release is configured.";
  else if (action === "details") appNotice = "This preview reports only finalized public checkpoints; live dependencies are not configured.";
  else if (action === "help") appNotice = "PayGuard keeps policy rules in FCC custody while public requests and settlement remain visible.";
  else appNotice = "This action remains planned for a verified PayGuard release.";
  render();
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
window.addEventListener("hashchange", () => {
  landingOpen = window.location.hash === "#landing";
  render();
});
