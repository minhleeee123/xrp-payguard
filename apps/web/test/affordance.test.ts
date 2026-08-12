import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const liveFcc = readFileSync(new URL("../src/live-fcc.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/studio.css", import.meta.url), "utf8");

describe("desktop interaction affordance", () => {
  it("marks template cards as explicit selectable controls", () => {
    expect(main).toContain('class="template-choice-state"');
    expect(main).toContain("SELECT →");
    expect(main).toContain("✓ SELECTED");
    expect(studio).toContain(".template-card .template-choice-state");
  });

  it("separates editable inputs from informational surfaces", () => {
    expect(styles).toContain("border-left: 3px solid var(--color-signal-lime)");
    expect(styles).toContain(".request-lookup input:focus-visible");
    expect(studio).toContain(".studio-form input:focus-visible");
    expect(styles).toContain(".state-tag");
    expect(styles).toContain("cursor: default");
    expect(styles).toContain(".token-symbol");
    expect(styles).toContain("border: 1px solid var(--color-slate)");
  });

  it("gives every action tier an observable interaction state", () => {
    expect(styles).toContain(".primary-button:hover");
    expect(styles).toContain(".outline-button:active");
    expect(styles).toContain(".text-button:hover");
    expect(styles).toContain(".icon-button:hover");
    expect(styles).toContain(".primary-button:disabled:hover");
  });

  it("moves optional card guidance into accessible contextual help", () => {
    expect(main).toContain("installCardHelp();");
    expect(main).toContain('button.className = "card-help"');
    expect(main).toContain('tooltip.setAttribute("role", "tooltip")');
    expect(main).toContain('button.setAttribute("aria-describedby", tooltipId)');
    expect(main).toContain('button.setAttribute("aria-expanded", "false")');
    expect(main).toContain('event.key !== "Escape"');
    expect(styles).toContain(".card-help:hover .card-help-tooltip");
    expect(styles).toContain(".card-help:focus-visible .card-help-tooltip");
    expect(styles).toContain(".card-help.pinned .card-help-tooltip");
  });
});

describe("application information density", () => {
  it("does not repeat global candidate or workspace status around every task", () => {
    expect(main).not.toContain("candidateContextBar");
    expect(main).not.toContain("CONNECTED TESTNET WORKSPACE");
    expect(main).not.toContain("sidebarNetworkCard");
    expect(styles).not.toContain(".candidate-context");
    expect(styles).not.toContain(".workspace-label");
  });

  it("removes non-actionable duplicate panels from task views", () => {
    expect(main).not.toContain("DEPENDENCY HEALTH");
    expect(main).not.toContain("EVM TESTNET PATH");
    expect(main).not.toContain("XRPL-NATIVE PATH");
    expect(main).not.toContain("Fresh-process recovery is built in");
    expect(main).not.toContain('class="team-note"');
  });

  it("presents Demo lifecycle as a concise result with optional evidence depth", () => {
    expect(main).toContain("Verified Coston2 run");
    expect(main).toContain('class="lifecycle-flow"');
    expect(main).toContain("3 machines");
    expect(main).toContain("3 receipts");
    expect(main).toContain("2 results");
    expect(main).toContain('class="panel evidence-disclosure"');
    expect(main).toContain('class="panel evidence-disclosure" data-no-card-help open');
    expect(main).toContain("Historical V1 archive");
    expect(main).toContain('class="legacy-demo-header"');
    expect(main).toContain('class="legacy-evidence-details"');
    expect(main).not.toContain("V2 LIVE CANDIDATE VERIFIED");
    expect(main).not.toContain("One complete hosted lifecycle");
    expect(main).toContain('activeView === "demo"');
    expect(styles).toContain(".lifecycle-overview");
    expect(styles).toContain(".lifecycle-flow");
    expect(styles).toContain(".evidence-disclosure");
  });

  it("prioritizes the three main tasks and removes the Overview surface", () => {
    expect(main).toContain("nav-group nav-group-main");
    expect(main).toContain("nav-group nav-group-proof");
    expect(main).not.toContain("nav-group nav-group-admin");
    expect(main).not.toContain('navItem("team"');
    expect(main).toContain("observedRequestActorsView()");
    expect(main).not.toContain('navItem("overview"');
    expect(main).not.toContain("function overviewView");
  });

  it("renders Policy Studio as four visible, gated sections with sticky navigation", () => {
    for (const label of ["Template", "Rules", "Review", "Activate"]) expect(main).toContain(`[${label === "Template" ? "1" : label === "Rules" ? "2" : label === "Review" ? "3" : "4"}, \"${label}\"]`);
    expect(main).toContain('type="datetime-local"');
    expect(main).toContain("Compute commitment");
    expect(main).toContain("interactiveStudioPanel()}${interactiveDemoView()");
    for (const step of [1, 2, 3, 4]) expect(main).toContain(`id="studio-section-${step}"`);
    expect(main).toContain("wireStudioSectionTracking");
    expect(main).toContain("scrollIntoView");
    expect(studio).toContain(".studio-stepper");
    expect(studio).toContain("position: sticky");
    expect(studio).toContain(".studio-all-steps");
    expect(studio).toContain(".studio-action-bar");
  });

  it("makes activation self-service while keeping relay execution separate", () => {
    expect(main).toContain("Connect your Coston2 wallet");
    expect(main).toContain("Collect 3 live FCC receipts");
    expect(main).toContain("Register your policy on Coston2");
    expect(main).toContain("Use connected wallet as owner");
    expect(main).toContain("Authorize FCC evaluation");
    expect(main).toContain("POLICY STOPPED");
    expect(main).toContain("POLICY REVOKED");
    expect(main).not.toContain("Operator wallet required for V2 writes");
    expect(main).not.toContain('name="owner" value="${esc(account ?? "")}"');
  });

  it("puts vault transactions before the compact overview", () => {
    expect(main.indexOf("${vaultTransactionPanel(live, account)}")).toBeLessThan(main.indexOf('class="vault-card vault-overview panel"'));
    expect(main).not.toContain("Verification & account details");
    expect(main).toContain('class="vault-account-details"');
    expect(styles).toContain(".vault-summary-grid");
    expect(styles).toContain(".vault-details-grid");
    expect(styles).not.toContain(".vault-details summary");
  });

  it("presents deposit as one user goal and keeps approval as an internal verified step", () => {
    expect(main).toContain('data-vault-action="DEPOSIT"');
    expect(main).toContain("Deposit FTestXRP");
    expect(main).toContain("planVaultUserAction");
    expect(main).not.toContain("Prepare exact approval");
    expect(main).not.toContain("Prepare deposit");
    expect(main).not.toContain('data-vault-kind="APPROVE"');
    expect(main).not.toContain("REVIEW OPERATION");
    expect(main).not.toContain('data-action="submit-vault-intent"');
    expect(main).toContain("void submitVaultTransaction();");
  });

  it("uses human FTestXRP amounts and separates request creation from inspection", () => {
    expect(main).toContain('inputmode="decimal"');
    expect(main).not.toContain("Maximum per action: 100000");
    expect(main).toContain('inputmode="decimal"');
    expect(main).toContain('data-request-mode="CREATE"');
    expect(main).toContain('data-request-mode="INSPECT"');
    expect(main).not.toContain("Owner creates policy");
    expect(styles).not.toContain(".payment-flow-guide");
    expect(styles).toContain(".request-mode-tabs");
  });

  it("keeps one visible progress trail across multi-signature wallet flows", () => {
    expect(main).toContain("WALLET PROGRESS");
    expect(main).toContain("custodyProgressRows");
    expect(main).toContain("Signature ${progress.index}/3 verified");
    expect(main).toContain('showAppNotice(liveFccNotice, null)');
    expect(main).toContain("Completed signatures remain marked");
    expect(styles).toContain(".wallet-progress-step.complete");
    expect(studio).toContain(".progress-receipt.complete");
    expect(liveFcc).toContain('status: "AWAITING_SIGNATURE" | "RECEIPT_VERIFIED"');
    expect(liveFcc).toContain("await onProgress?.");
  });

  it("requires explicit payment decisions while defaulting only the seven-day window", () => {
    expect(main).toContain("defaultStudioPolicyWindow()");
    expect(main).toContain('target: ""');
    expect(main).toContain('requester: ""');
    expect(main).toContain('maxPerAction: ""');
    expect(main).toContain('dailyCap: ""');
    expect(main).not.toContain('requester: account ?? ""');
    expect(main).toContain('<span class="required-label">REQUIRED</span>');
    expect(studio).toContain(".required-label");
  });

  it("keeps requester authorization compact with owner, payee, and an optional wallet", () => {
    expect(main).toContain("Who can request?");
    expect(main).toContain("Owner <small>Always</small>");
    expect(main).toContain('name="payeeCanRequest"');
    expect(main).toContain('type="checkbox" name="requesterMode" value="delegate"');
    expect(main).toContain("Additional requester");
    expect(main).toContain('payeeCanRequest: data.get("payeeCanRequest") === "on"');
    expect(main).toContain('requesterMode === "delegate" ? value("requester") : ""');
    expect(main).not.toContain('<input type="hidden" name="requester"');
    expect(main).toContain('let studioRequesterMode: "owner" | "delegate" = "owner"');
    expect(main).toContain('const ownerOnly = studioRequesterMode === "owner"');
    expect(main).toContain('studioRequesterMode = input.checked ? "delegate" : "owner"');
    expect(main).not.toContain("Requester wallet (can ask for payment)");
    expect(studio).toContain(".compact-choice");
    expect(main).toContain('class="studio-rule-group studio-rule-payment"');
    expect(main).toContain('class="studio-rule-group studio-rule-authorization"');
    expect(main).toContain('class="studio-rule-group studio-rule-limits"');
    expect(main).toContain('class="studio-rules-header-state"');
    expect(main).not.toContain('class="derived-field"');
    expect(main).not.toContain('class="private-row"');
    expect(studio).toContain(".studio-schedule-row");
  });

  it("uses a low-copy, large-type desktop task interface", () => {
    for (const intro of [
      'pageIntro("POLICY STUDIO", "Create a payment policy", "")',
      'pageIntro("VAULTS", "Fund your payment policy", "")',
      'pageIntro("REQUESTS", "Request or inspect a payment", "")',
      'pageIntro("VERIFY", "Coston2 lifecycle", "")',
      'pageIntro("PAYEE", "Payment status", "")',
      'pageIntro("AUDITOR", "Verify public evidence", "")',
    ]) expect(main).toContain(intro);
    expect(main).not.toContain("These four public test IDs were created before this browser session");
    expect(main).not.toContain("WHAT REMAINS PRIVATE");
    expect(main).toContain('class="auditor-more"');
    expect(main).toContain('class="sr-only"');
    expect(styles).toContain("@media (min-width: 761px)");
    expect(styles).toContain(".page-intro h1 { font-size: 48px; }");
    expect(styles).toContain(".nav-item { min-height: 49px;");
    expect(studio).toContain(".studio-form input { min-height: 48px;");
  });
});
