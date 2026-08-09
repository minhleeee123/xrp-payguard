type GuardianKind = "cipher" | "quorum" | "ledger";

export function landingView(): string {
  return `<div class="landing-shell">
    <header class="landing-topbar">
      <a class="landing-brand" href="#landing"><span class="brand-mark" aria-hidden="true">P</span><span>PayGuard</span><span class="brand-beta" aria-hidden="true">LOCAL</span></a>
      <nav class="landing-nav" aria-label="Landing navigation">
        <a href="#why">WHY</a><a href="#guardians">GUARDIANS</a><a href="#journey">ARCHITECTURE</a><a href="#use-cases">USE CASES</a><a href="#evidence">EVIDENCE</a>
      </nav>
      <button class="outline-button" type="button" data-action="open-app">Open app</button>
    </header>
    <main>
      <section class="landing-hero" aria-labelledby="landing-title">
        <div class="landing-hero-art" aria-hidden="true">
          <svg viewBox="0 0 1000 520" role="presentation" aria-hidden="true" focusable="false">
            <ellipse class="globe-line globe-line-a" cx="500" cy="260" rx="430" ry="205" />
            <ellipse class="globe-line globe-line-b" cx="500" cy="260" rx="210" ry="205" />
            <ellipse class="globe-line globe-line-c" cx="500" cy="260" rx="430" ry="92" />
            <g class="globe-dots" fill="currentColor">${landingDots()}</g>
          </svg>
        </div>
        <span class="hero-orbit hero-orbit-one" aria-hidden="true"></span><span class="hero-orbit hero-orbit-two" aria-hidden="true"></span>
        <span class="hero-signal hero-signal-a" aria-hidden="true"></span><span class="hero-signal hero-signal-b" aria-hidden="true"></span><span class="hero-signal hero-signal-c" aria-hidden="true"></span>
        <div class="landing-scanline" aria-hidden="true"></div>
        <div class="landing-eyebrow">PRIVATE POLICY · PUBLIC ACTION</div>
        <h1 id="landing-title">Authorize public value with <em>private</em> rules.</h1>
        <p class="landing-lede">XRP PayGuard is an XRP-native policy control layer designed for Flare: keep the authorization rule inside a fixed FCC machine set, while every requested action and settlement remains public and auditable.</p>
        <div class="landing-actions"><button class="primary-button" type="button" data-action="landing-studio">Open Policy Studio</button><a class="landing-text-link" href="#why">Understand the boundary ↘</a></div>
        <div class="landing-status"><span class="status-dot amber"></span><span>Coston2 public facts + local FCC simulation · <strong>no release claim</strong></span></div>
        <div class="hero-proof-strip" aria-label="Current delivery boundary"><span>01 · TESTNET FACTS</span><span>02 · LOCAL 3-MACHINE SIMULATION</span><span>03 · FAIL-CLOSED UI</span></div>
      </section>
      <div class="neon-divider" aria-hidden="true"></div>

      <section class="landing-section landing-reveal boundary-section" id="why" aria-labelledby="why-title">
        <div class="landing-section-heading">
          <div><div class="eyebrow">WHY PAYGUARD</div><h2 id="why-title">A public ledger should not become your <em>rulebook.</em></h2></div>
          <p>Recurring payments need limits, schedules, merchant groups, delegates, and emergency controls. Publishing those relationships gives observers more information than the payment itself requires.</p>
        </div>
        <div class="boundary-board">
          <article class="boundary-column public-column"><div class="boundary-label">PUBLIC · ON XRPL / FLARE</div><h3>Facts anyone may audit.</h3><ul><li>Asset, amount, recipient, and timing</li><li>Policy commitment and version</li><li>Request, nonce, expiry, and checkpoint</li><li>Threshold digest and settlement receipt</li></ul></article>
          <div class="boundary-gate" aria-hidden="true"><span>↔</span><small>EXACT DOMAIN</small></div>
          <article class="boundary-column private-column"><div class="boundary-label">PRIVATE · INSIDE FCC</div><h3>Rules that stay out of public artifacts.</h3><ul><li>Target and merchant relationships</li><li>Per-action, daily, and rolling caps</li><li>Schedule logic and deny precedence</li><li>Delegated allowances and private entropy</li></ul></article>
        </div>
        <p class="boundary-footnote"><span aria-hidden="true">⌁</span> PayGuard is not private money. Ordinary transfers still reveal their public transaction graph; the protected object is the authorization policy.</p>
      </section>

      <section class="landing-section landing-reveal guardian-section" id="guardians" aria-labelledby="guardians-title">
        <div class="landing-section-heading">
          <div><div class="eyebrow">MEET THE CONTROL LAYERS</div><h2 id="guardians-title">Three guardians.<br />One <em>exact</em> request.</h2></div>
          <p>The mascots make the trust model easier to remember; they are not claims of live machines. Each represents a protocol responsibility that must fail closed when its evidence is missing.</p>
        </div>
        <div class="guardian-grid">
          ${guardianCard("cipher", "Cipher", "Policy custodian", "Three compatible machines must acknowledge the same commitment and domain before a policy can become canonical.", "TARGET · 3 OF 3 CUSTODY")}
          ${guardianCard("quorum", "Quorum", "Threshold witness", "Two distinct registered machines must sign one identical evaluation digest. Split results never combine into approval.", "LOCAL · 2 MATCHING RESULTS")}
          ${guardianCard("ledger", "Ledger", "Checkpoint keeper", "Canonical chain state owns nonce, spend root, occurrence, expiry, and rollback authority across restarts.", "TESTED · FAIL CLOSED")}
        </div>
      </section>

      <section class="landing-section landing-reveal journey-section" id="journey" aria-labelledby="journey-title">
        <div class="journey-heading"><div><div class="eyebrow">FLAGSHIP ARCHITECTURE</div><h2 id="journey-title">From XRPL intent to a controlled Flare action.</h2></div><p>Funding and authorization are deliberately separate. A valid payment proof can fund the vault; it cannot decide whether a later policy-bound action is allowed.</p></div>
        <div class="journey-track">
          ${journeyStep("01", "XRPL wallet", "The owner signs a public Payment. PayGuard never receives the XRPL seed.", "PUBLIC")}
          <div class="journey-arrow" aria-hidden="true">→</div>
          ${journeyStep("02", "FDC + Smart Account", "The exact transaction, proof owner, round, finality, nonce, and operation are bound.", "OBSERVED")}
          <div class="journey-arrow" aria-hidden="true">→</div>
          ${journeyStep("03", "PayGuard vault", "Public balance and conservation checkpoints advance atomically on Flare.", "COSTON2")}
          <div class="journey-arrow" aria-hidden="true">→</div>
          ${journeyStep("04", "FCC policy gate", "Private rules evaluate the public request against one frozen machine and code domain.", "LOCAL SIM")}
          <div class="journey-arrow" aria-hidden="true">→</div>
          ${journeyStep("05", "Public action", "Only an exact threshold result may reach the allowlisted router action.", "TARGET")}
        </div>
        <div class="protocol-tape" aria-label="Protocol composition"><span>XRPL PAYMENT</span><i>+</i><span>FDC PROOF</span><i>+</i><span>SMART ACCOUNT</span><i>+</i><span>FASSETS</span><i>+</i><span>FCC POLICY</span><i>→</i><span>PUBLIC RECEIPT</span></div>
      </section>

      <section class="landing-section landing-reveal use-case-section" id="use-cases" aria-labelledby="use-cases-title">
        <div class="landing-section-heading">
          <div><div class="eyebrow">POLICY TEMPLATES</div><h2 id="use-cases-title">One primitive for recurring <em>control.</em></h2></div>
          <p>Start from a narrow template, inspect exactly what will be public, then create a new version whenever the rule changes. No active policy mutates silently.</p>
        </div>
        <div class="use-case-grid">
          <article class="use-case-card"><span class="use-case-index">U 01</span><div class="use-case-icon" aria-hidden="true">↻</div><h3>Personal subscriptions</h3><p>Bound a merchant target, amount ceiling, interval, occurrence count, and grace window without publishing the complete relationship map.</p><span class="landing-tag">PRODUCT MODEL · NOT PILOTED</span></article>
          <article class="use-case-card"><span class="use-case-index">U 02</span><div class="use-case-icon" aria-hidden="true">▦</div><h3>Treasury vendors</h3><p>Separate policy author, funder, executor, payee, and auditor roles while preserving public reconciliation and a deterministic deny path.</p><span class="landing-tag">PRODUCT MODEL · NOT PILOTED</span></article>
          <article class="use-case-card"><span class="use-case-index">U 03</span><div class="use-case-icon" aria-hidden="true">⇢</div><h3>Delegated budgets</h3><p>Let an explicitly named delegate request a bounded action without giving that delegate—or the web client—the ability to supply ALLOW.</p><span class="landing-tag">PRODUCT MODEL · NOT PILOTED</span></article>
        </div>
      </section>

      <section class="landing-section landing-reveal evidence-section" id="evidence" aria-labelledby="evidence-title">
        <div class="evidence-story"><div class="eyebrow">PUBLIC-SAFE EVIDENCE</div><h2 id="evidence-title">Inspect facts,<br />not <em>promises.</em></h2><p>The hosted mirror publishes only testnet addresses, hashes, transactions, blocks, timings, and assertion booleans. Private policy material, credentials, and raw signatures are excluded.</p><div class="evidence-actions"><button class="outline-button" type="button" data-action="landing-auditor">Open Auditor</button><a class="landing-text-link" href="/evidence/index.json" target="_blank" rel="noreferrer">Evidence index ↗</a></div></div>
        <div class="evidence-terminal" role="group" aria-label="Current verified versus limited scope"><div class="terminal-bar"><span>PAYGUARD / SCOPE</span><span>2026-08-09</span></div><dl><div><dt>NETWORK</dt><dd>Coston2 · testnet only</dd></div><div><dt>CONTRACTS</dt><dd>Runtime + wiring checked</dd></div><div><dt>XRP → FDC → VAULT</dt><dd>One public run observed</dd></div><div><dt>FCC POLICY PATH</dt><dd>Local simulated only</dd></div><div><dt>HOSTED WEB</dt><dd>Static shell + evidence</dd></div><div><dt>RELEASE</dt><dd>Not yet verified</dd></div></dl><span class="terminal-cursor" aria-hidden="true">_</span></div>
      </section>

      <section class="landing-section landing-reveal faq-section" id="limits" aria-labelledby="limits-title">
        <div class="faq-heading"><div class="eyebrow">LIMITATIONS · READ FIRST</div><h2 id="limits-title">Clear answers before you trust the <em>system.</em></h2></div>
        <div class="faq-list">
          <details open><summary>What does PayGuard keep private?</summary><p>Policy relationships, caps, schedules, delegate rules, private entropy, and intermediate evaluation details are intended to remain inside the fixed FCC custody set. Public commitments and actions remain visible.</p></details>
          <details><summary>Does PayGuard hide XRP or FXRP transfers?</summary><p>No. Amount, recipient, timing, and transaction graph remain public. PayGuard is neither a mixer nor an anonymous payment rail.</p></details>
          <details><summary>What happens when FCC, FDC, FTSO, RPC, or relay fails?</summary><p>The affected path becomes unavailable, denied, or resumable from canonical public state. No dependency failure may become a mock proof, price, payment, evaluation, or execution.</p></details>
          <details><summary>What is live today?</summary><p>PayGuard has public Coston2 contract and XRP/FDC/Smart Account/FAssets observations, a static Vercel shell, and a credential-free local three-machine FCC simulation. A registered live policy-machine release is not yet verified.</p></details>
        </div>
      </section>

      <section class="landing-final landing-reveal" aria-labelledby="final-title">
        <div class="final-mark" aria-hidden="true">P</div><div><div class="eyebrow">START WITH THE BOUNDARY</div><h2 id="final-title">Draft the rule locally.<br /><em>Verify</em> every next gate.</h2><p>No wallet is required to explore the product model. Validation computes an in-memory commitment only; it does not create custody receipts or authorization.</p></div><button class="primary-button" type="button" data-action="landing-studio">Open Policy Studio</button>
      </section>
    </main>
    <footer class="landing-footer"><span>PAYGUARD · PUBLIC CONTROL / PRIVATE RULES</span><span>TESTNET + LOCAL SIMULATION · NO RELEASE CLAIM</span></footer>
  </div>`;
}

function guardianCard(kind: GuardianKind, name: string, role: string, copy: string, status: string): string {
  return `<article class="guardian-card" data-mascot="${kind}"><div class="guardian-art">${guardianMascot(kind)}</div><div class="guardian-copy"><span class="guardian-name">${name}</span><h3>${role}</h3><p>${copy}</p><span class="landing-tag">${status}</span></div></article>`;
}

function guardianMascot(kind: GuardianKind): string {
  const symbol = kind === "cipher"
    ? '<path d="M82 88h16v15H82z M86 88v-5a4 4 0 0 1 8 0v5" />'
    : kind === "quorum"
      ? '<circle cx="82" cy="95" r="5" /><circle cx="98" cy="95" r="5" /><path d="M87 95h6" />'
      : '<path d="M79 86h22v18H79z M84 91h12 M84 96h12 M84 101h8" />';
  const antenna = kind === "cipher" ? "M90 38V25l-9-8" : kind === "quorum" ? "M90 38V20m-9 7 9-7 9 7" : "M90 38V25l10-7";
  const mouth = kind === "quorum" ? "M78 72c7 7 17 7 24 0" : kind === "ledger" ? "M80 74h20" : "M80 72c5 4 15 4 20 0";
  return `<svg class="guardian-svg guardian-${kind}" viewBox="0 0 180 160" aria-hidden="true" focusable="false">
    <g class="mascot-orbit" fill="none"><circle cx="90" cy="80" r="68" /><path d="M21 80h14 M145 80h14" /></g>
    <g class="mascot-body" fill="none"><path d="${antenna}" /><circle class="mascot-signal" cx="${kind === "cipher" ? 79 : kind === "quorum" ? 90 : 101}" cy="${kind === "quorum" ? 19 : 17}" r="4" />
      <rect x="44" y="38" width="92" height="52" rx="4" /><circle class="mascot-eye" cx="71" cy="62" r="4" /><circle class="mascot-eye" cx="109" cy="62" r="4" /><path d="${mouth}" />
      <path d="M60 91v42h60V91 M60 104H43l-10 18 M120 104h17l10 18 M73 133v12 M107 133v12" />
      <rect x="72" y="82" width="36" height="30" rx="2" />${symbol}
    </g>
  </svg>`;
}

function journeyStep(index: string, title: string, copy: string, state: string): string {
  return `<article class="journey-step"><span>${index}</span><strong>${title}</strong><small>${copy}</small><em>${state}</em></article>`;
}

function landingDots(): string {
  const landmasses = [
    [-0.55, -0.23, 0.28, 0.28], [-0.37, 0.30, 0.15, 0.34], [-0.08, -0.30, 0.12, 0.10],
    [0.08, 0.08, 0.19, 0.31], [0.36, -0.24, 0.38, 0.22], [0.60, 0.31, 0.16, 0.13], [0.00, -0.48, 0.10, 0.08],
  ] as const;
  const dots: string[] = [];
  for (let row = 0; row < 19; row += 1) {
    for (let column = 0; column < 35; column += 1) {
      const x = 75 + column * 25;
      const y = 55 + row * 23;
      const nx = (x - 500) / 430;
      const ny = (y - 260) / 205;
      if (nx * nx + ny * ny > 1) continue;
      const land = landmasses.some(([cx, cy, rx, ry]) => ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 < 1);
      if (!land || (row * 5 + column * 7) % 6 === 0) continue;
      const opacity = 0.35 + ((row + column) % 4) * 0.1;
      dots.push(`<circle cx="${x}" cy="${y}" r="1.6" opacity="${opacity.toFixed(2)}" />`);
    }
  }
  return dots.join("");
}
