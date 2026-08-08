import "./styles.css";
import { getAddress, type Hex } from "viem";
import { buildPublicPreview, normalizeStudioAddress, type StudioInput } from "./model.js";

type View = "overview" | "studio" | "vaults" | "requests" | "auditor" | "team";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("PayGuard root missing");
const app = appElement;

let activeView: View = "overview";
let studioNotice = "No policy data has left this browser tab.";
let commitment = "Not computed";

const esc = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
const short = (value: string): string => value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

function render(): void {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">✦</span><span>PayGuard</span><span class="brand-beta">LOCAL</span></div>
        <div class="workspace-label">PERSONAL WORKSPACE</div>
        <nav class="primary-nav" aria-label="Primary navigation">
          ${navItem("overview", "Overview", "⌂")}
          ${navItem("studio", "Policy Studio", "◈")}
          ${navItem("vaults", "Vaults", "▣")}
          ${navItem("requests", "Requests", "↗")}
          ${navItem("auditor", "Auditor", "◌")}
          ${navItem("team", "Team & roles", "♧")}
        </nav>
        <div class="sidebar-bottom">
          <div class="security-card"><span class="status-dot amber"></span><div><strong>Local preview</strong><small>Live providers are not connected</small></div></div>
          <button class="help-link" type="button" data-action="help">? <span>How PayGuard works</span></button>
          <div class="user-row"><div class="avatar">ML</div><div><strong>Owner</strong><small>Wallet not connected</small></div><span class="more">···</span></div>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${label(activeView)}</strong></div><div class="top-actions"><span class="network-chip"><span class="status-dot amber"></span>Coston2 <em>planned</em></span><button class="icon-button" type="button" aria-label="Notifications">♢<span class="notification-dot"></span></button><button class="outline-button" type="button" data-action="connect">Connect wallet</button></div></header>
        <section class="content">${viewContent()}</section>
      </main>
    </div>`;
  wireEvents();
}

function navItem(view: View, text: string, icon: string): string {
  return `<button class="nav-item ${activeView === view ? "active" : ""}" type="button" data-view="${view}"><span class="nav-icon">${icon}</span>${text}${view === "requests" ? '<span class="nav-count">2</span>' : ""}</button>`;
}

function label(view: View): string { return ({ overview: "Overview", studio: "Policy Studio", vaults: "Vaults", requests: "Requests", auditor: "Auditor", team: "Team & roles" })[view]; }

function viewContent(): string {
  if (activeView === "studio") return studioView();
  if (activeView === "vaults") return vaultsView();
  if (activeView === "requests") return requestsView();
  if (activeView === "auditor") return auditorView();
  if (activeView === "team") return teamView();
  return overviewView();
}

function pageIntro(eyebrow: string, title: string, copy: string, action = ""): string {
  return `<div class="page-intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${action ? `<button class="primary-button" type="button" data-action="${action}">${action === "new-policy" ? "+ New policy" : action}</button>` : ""}</div>`;
}

function overviewView(): string {
  return `${pageIntro("PERSONAL PAYGUARD", "Good morning, Minh.", "Public funds stay visible. Your payment rules stay inside the registered FCC machine set.", "new-policy")}
    <div class="notice-banner"><span class="notice-icon">◉</span><div><strong>Live connection is not configured</strong><span>This local preview never reports a mock approval, payment, price, or proof. Connect a verified Coston2 release to continue.</span></div><button type="button" data-action="details">View limits</button></div>
    <div class="metric-grid"><div class="metric-card"><div class="metric-label">AVAILABLE BALANCE <span class="public-pill">PUBLIC</span></div><div class="metric-value">— <small>FTestXRP</small></div><div class="metric-foot muted">No vault provider connected</div></div><div class="metric-card"><div class="metric-label">RESERVED <span class="public-pill">PUBLIC</span></div><div class="metric-value">—</div><div class="metric-foot muted">Pending state unavailable</div></div><div class="metric-card"><div class="metric-label">ACTIVE POLICIES</div><div class="metric-value">0</div><div class="metric-foot"><span class="status-dot amber"></span> No live policy registry</div></div><div class="metric-card accent-card"><div class="metric-label">NEXT RECURRING ACTION</div><div class="metric-value">—</div><div class="metric-foot muted">Create a policy to preview</div></div></div>
    <div class="section-grid"><section class="panel activity-panel"><div class="panel-heading"><div><div class="eyebrow">PUBLIC CHECKPOINTS</div><h2>Recent activity</h2></div><button class="text-button" type="button" data-view="requests">View all ↗</button></div><div class="empty-state"><div class="empty-orbit">◌</div><strong>No verified activity yet</strong><span>Requests, decisions, and transfers appear here only after a public chain checkpoint is finalized.</span><button class="outline-button" type="button" data-action="new-policy">Explore Policy Studio</button></div></section><section class="panel health-panel"><div class="panel-heading"><div><div class="eyebrow">DEPENDENCY HEALTH</div><h2>Trust surface</h2></div><span class="health-label"><span class="status-dot amber"></span>Limited</span></div><ul class="health-list"><li><span class="health-icon gray">◇</span><div><strong>FCC machine quorum</strong><small>Registration not verified</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">◈</span><div><strong>FDC attestation</strong><small>Proof verifier not configured</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">◫</span><div><strong>FTSO snapshot</strong><small>Feed resolution not verified</small></div><span class="state-tag amber-tag">PLANNED</span></li><li><span class="health-icon gray">▣</span><div><strong>Router & vault</strong><small>Local contracts tested only</small></div><span class="state-tag green-tag">LOCAL</span></li></ul></section></div>`;
}

function studioView(): string {
  return `${pageIntro("PRIVATE POLICY STUDIO", "Create a payment policy", "Define what can happen in private. Only the commitment, receipts, and public request domain leave this tab.")}
    <div class="studio-layout"><form class="panel studio-form" id="studio-form"><div class="form-header"><div><h2>Policy basics</h2><p>Version 1 · private rules are held by three policy-fixed FCC machines.</p></div><span class="version-chip">POLICY_SCHEMA_V1</span></div><label>Policy name<input name="policyId" value="subscription-01" maxlength="32" autocomplete="off" /></label><div class="two-col"><label>Owner address<input name="owner" value="0x00000000000000000000000000000000000000a1" spellcheck="false" /></label><label>Allowed target<input name="target" value="0x00000000000000000000000000000000000000c3" spellcheck="false" /></label></div><div class="two-col"><label>Maximum per action<input name="maxPerAction" value="75" inputmode="numeric" /></label><label>Daily cap<input name="dailyCap" value="500" inputmode="numeric" /></label></div><div class="two-col"><label>Starts at (UTC)<input name="startAt" value="1000" inputmode="numeric" /></label><label>Ends at (UTC)<input name="endAt" value="10000" inputmode="numeric" /></label></div><div class="form-divider"></div><div class="private-row"><span class="lock-icon">▣</span><div><strong>Private rule groups</strong><small>Targets, deny precedence, caps, schedules, and delegated roles are encrypted independently for each registered machine.</small></div><span class="state-tag green-tag">IN MEMORY</span></div><div class="form-actions"><span class="form-note" id="studio-notice">${esc(studioNotice)}</span><button class="primary-button" type="submit">Compute commitment ↗</button></div></form><aside class="studio-side"><section class="panel boundary-card"><div class="eyebrow">PUBLIC / PRIVATE BOUNDARY</div><h3>What the chain can see</h3><ul class="boundary-list"><li><span class="check">✓</span> Policy commitment</li><li><span class="check">✓</span> Version and owner</li><li><span class="check">✓</span> Requested target and amount</li><li><span class="lock">▣</span> Rules remain in FCC custody</li></ul></section><section class="panel commitment-card"><div class="eyebrow">COMMITMENT PREVIEW</div><div class="commitment-value" id="commitment-value">${esc(commitment)}</div><small>Computed locally · not registered</small><div class="commitment-state"><span class="status-dot amber"></span> Activation requires all three receipts</div></section><section class="privacy-note"><span>✦</span><div><strong>Nothing is saved here</strong><p>Refresh this tab to discard the in-memory draft. PayGuard never puts policy plaintext or ciphertext in browser storage.</p></div></section></aside></div>`;
}

function vaultsView(): string {
  return `${pageIntro("PUBLIC ASSET VAULTS", "Your vaults", "Balances, reservations, and transfers are public chain facts. Funding and withdrawals need a verified wallet connection.", "deposit")}
    <div class="vault-card panel"><div class="vault-card-top"><div class="token-symbol">X</div><div><h2>FTestXRP vault</h2><span class="muted">Public asset · Coston2 target</span></div><span class="state-tag amber-tag">NOT CONNECTED</span></div><div class="vault-balance"><span>Available balance</span><strong>— <small>FTestXRP</small></strong><span class="muted">No live RPC state</span></div><div class="vault-stats"><div><span>Deposited</span><strong>—</strong></div><div><span>Reserved</span><strong>—</strong></div><div><span>Spent</span><strong>—</strong></div><div><span>Withdrawn</span><strong>—</strong></div></div><div class="vault-actions"><button class="primary-button" type="button" data-action="connect">Connect wallet to fund</button><button class="outline-button" type="button" data-action="details">How XRPL funding works</button></div></div><div class="section-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">FUNDING PATH</div><h2>XRPL → Flare</h2></div><span class="state-tag amber-tag">PLANNED</span></div><div class="step-list"><div class="step-row"><span class="step-number">01</span><div><strong>Build Smart Account operation</strong><small>Owner, PersonalAccount, nonce, asset, amount, fee</small></div></div><div class="step-row"><span class="step-number">02</span><div><strong>Sign an XRPL Payment</strong><small>PayGuard never receives your XRPL seed</small></div></div><div class="step-row"><span class="step-number">03</span><div><strong>Verify an FDC proof</strong><small>Finalization is asynchronous and fail-closed</small></div></div></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">RECOVERY</div><h2>Safe exits</h2></div></div><p class="panel-copy">A stopped policy can release unspent reservations through the router state machine. No recovery path creates an authorization or hides the public transfer graph.</p><button class="text-button" type="button" data-action="details">Read recovery rules ↗</button></section></div>`;
}

function requestsView(): string {
  return `${pageIntro("PUBLIC REQUEST QUEUE", "Requests & schedules", "Executors can advance public checkpoints. They cannot choose ALLOW, read private rules, or bypass the result threshold.", "new-request")}
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACTION REQUESTS</div><h2>Nothing can execute yet</h2></div><div class="table-tools"><button class="filter-button" type="button">All statuses⌄</button><button class="icon-button" type="button" aria-label="Refresh">↻</button></div></div><div class="request-table"><div class="table-head"><span>REQUEST</span><span>PUBLIC ACTION</span><span>CHECKPOINT</span><span>STATUS</span><span></span></div><div class="table-row"><span><strong>—</strong><small>No verified request ID</small></span><span><strong>—</strong><small>Target and amount unavailable</small></span><span><strong>—</strong><small>Waiting for RPC</small></span><span><span class="state-tag amber-tag">UNAVAILABLE</span></span><span>···</span></div></div><div class="table-footer"><span>Showing public finalized state only</span><span class="muted">No browser cache</span></div></section><div class="recovery-strip"><div class="recovery-icon">↻</div><div><strong>Fresh-process recovery is built in</strong><p>A relay restart reconstructs work from chain checkpoints, not a private policy database.</p></div><button class="text-button" type="button" data-action="details">See checkpoint model ↗</button></div>`;
}

function auditorView(): string {
  return `${pageIntro("WALLET-FREE VERIFIER", "Auditor view", "Inspect public commitments and conservation without connecting a wallet or revealing the policy.")}
    <div class="auditor-grid"><section class="panel verify-card"><div class="eyebrow">PUBLIC EVIDENCE</div><h2>Verify a PayGuard action</h2><p>Paste a request ID or transaction hash from a verified release. Private policy material is never requested.</p><label>Request or transaction ID<input placeholder="0x…" spellcheck="false" /></label><button class="primary-button" type="button" data-action="verify">Check finalized state</button><div class="unavailable-box"><span class="status-dot amber"></span><div><strong>Evidence endpoint not connected</strong><small>This preview cannot assert a transaction, block, proof, or signer.</small></div></div></section><section class="panel evidence-card"><div class="eyebrow">ASSERTION CHECKLIST</div><h2>What an auditor will see</h2><ul class="evidence-list"><li><span class="evidence-icon">#</span><div><strong>Policy commitment</strong><small>Hash only · no rules or ciphertext</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">♧</span><div><strong>Machine/key binding</strong><small>Three frozen identities · 2-of-3 result threshold</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">↗</span><div><strong>Decision digest</strong><small>Exact request, checkpoint, expiry, and signers</small></div><span class="state-tag gray-tag">WAITING</span></li><li><span class="evidence-icon">∑</span><div><strong>Conservation</strong><small>Deposited = available + reserved + spent + withdrawn</small></div><span class="state-tag gray-tag">WAITING</span></li></ul></section></div>`;
}

function teamView(): string {
  return `${pageIntro("ROLES & GOVERNANCE", "Team workspace", "Separate policy author, funder, executor, payee, and auditor responsibilities. No role can supply an authorization result.", "invite")}
    <section class="panel roles-panel"><div class="panel-heading"><div><div class="eyebrow">CURRENT WORKSPACE</div><h2>Personal workspace</h2></div><span class="state-tag gray-tag">LOCAL ONLY</span></div><div class="role-row"><div class="avatar purple">O</div><div class="role-person"><strong>Owner</strong><small>Policy author · funder · emergency recovery</small></div><span class="role-permission">Full public controls</span><button class="text-button" type="button">···</button></div><div class="role-row muted-row"><div class="avatar dashed">+</div><div class="role-person"><strong>Invite a teammate</strong><small>Auditor, payee, or delegated executor</small></div><button class="outline-button" type="button" data-action="invite">Invite</button></div></section><div class="team-note"><span class="lock-icon">▣</span><div><strong>Governance is explicit</strong><p>Policy changes create a new version and new three-machine receipts. Active rules never silently mutate.</p></div></div>`;
}

function wireEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view as View; render(); }));
  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action ?? "")));
  const form = app.querySelector<HTMLFormElement>("#studio-form");
  form?.addEventListener("submit", (event) => { event.preventDefault(); computeStudio(form); });
}

function handleAction(action: string): void {
  if (action === "new-policy") { activeView = "studio"; render(); return; }
  if (action === "verify") { window.alert("Evidence endpoint is not connected in this local preview."); return; }
  if (action === "connect") { window.alert("Wallet providers are intentionally unavailable until a verified Coston2 release is configured."); return; }
  window.alert(action === "details" ? "This local preview reports only verified public checkpoints; live dependencies are not configured." : "This workspace action is planned for the verified release.");
}

function computeStudio(form: HTMLFormElement): void {
  try {
    const data = new FormData(form);
    const input: StudioInput = {
      policyId: String(data.get("policyId") ?? ""),
      owner: normalizeStudioAddress(String(data.get("owner") ?? "")),
      target: normalizeStudioAddress(String(data.get("target") ?? "")),
      maxPerAction: BigInt(String(data.get("maxPerAction") ?? "0")),
      dailyCap: BigInt(String(data.get("dailyCap") ?? "0")),
      startAt: BigInt(String(data.get("startAt") ?? "0")),
      endAt: BigInt(String(data.get("endAt") ?? "0")),
    };
    commitment = buildPublicPreview(input).commitment;
    studioNotice = "Commitment computed in memory. No receipt or activation was submitted.";
    render();
  } catch {
    const notice = app.querySelector<HTMLElement>("#studio-notice");
    if (notice) notice.textContent = "Check addresses and unsigned numeric fields; nothing was sent.";
  }
}

render();
