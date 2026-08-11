import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/studio.css", import.meta.url), "utf8");

describe("desktop interaction affordance", () => {
  it("marks template cards as explicit selectable controls", () => {
    expect(main).toContain('class="template-choice-state"');
    expect(main).toContain("SELECT TEMPLATE →");
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

  it("prioritizes the three main tasks and removes the Overview surface", () => {
    expect(main).toContain("nav-group nav-group-main");
    expect(main).toContain("nav-group nav-group-proof");
    expect(main).toContain("nav-group nav-group-admin");
    expect(main).not.toContain('navItem("overview"');
    expect(main).not.toContain("function overviewView");
  });

  it("renders Policy Studio as four visible, gated sections with sticky navigation", () => {
    for (const label of ["Template", "Rules", "Review", "Activate"]) expect(main).toContain(`[${label === "Template" ? "1" : label === "Rules" ? "2" : label === "Review" ? "3" : "4"}, \"${label}\"]`);
    expect(main).toContain('type="datetime-local"');
    expect(main).toContain("Compute policy commitment");
    expect(main).toContain("interactiveStudioPanel()}${interactiveDemoView()");
    for (const step of [1, 2, 3, 4]) expect(main).toContain(`id="studio-section-${step}"`);
    expect(main).toContain("wireStudioSectionTracking");
    expect(main).toContain("scrollIntoView");
    expect(studio).toContain(".studio-stepper");
    expect(studio).toContain("position: sticky");
    expect(studio).toContain(".studio-all-steps");
    expect(studio).toContain(".studio-action-bar");
  });

  it("puts vault transactions before the compact overview", () => {
    expect(main.indexOf("${vaultTransactionPanel(live, account)}")).toBeLessThan(main.indexOf('class="vault-card vault-overview panel"'));
    expect(main).not.toContain("Verification & account details");
    expect(main).toContain('class="vault-account-details"');
    expect(styles).toContain(".vault-summary-grid");
    expect(styles).toContain(".vault-details-grid");
    expect(styles).not.toContain(".vault-details summary");
  });
});
