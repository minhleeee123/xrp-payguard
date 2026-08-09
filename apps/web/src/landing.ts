type GuardianKind = "cipher" | "quorum" | "ledger";

export function landingView(): string {
  return `<div class="landing-shell">
    <header class="landing-topbar">
      <a class="landing-brand" href="#landing"><span class="brand-mark" aria-hidden="true">P</span><span>PayGuard</span><span class="brand-beta" aria-hidden="true">COSTON2</span></a>
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
        <div class="landing-actions"><button class="primary-button" type="button" data-action="landing-demo">Inspect Coston2 demo</button><button class="outline-button" type="button" data-action="landing-studio">Open Policy Studio</button><a class="landing-text-link" href="#why">Understand the boundary ↘</a></div>
        <div class="landing-status"><span class="status-dot amber"></span><span>Coston2 public facts + simulated FCC signers · <strong>no production FCC claim</strong></span></div>
        <div class="hero-proof-strip" aria-label="Current delivery boundary"><span>01 · TESTNET FACTS</span><span>02 · 3-SIGNER COSTON2 SIMULATION</span><span>03 · FAIL-CLOSED UI</span></div>
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
          ${journeyStep("04", "FCC policy gate", "Private rules evaluate the public request against one frozen machine and code domain.", "SIMULATED")}
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
        <div class="evidence-story"><div class="eyebrow">PUBLIC-SAFE EVIDENCE</div><h2 id="evidence-title">Inspect facts,<br />not <em>promises.</em></h2><p>The hosted mirror publishes only testnet addresses, hashes, transactions, blocks, timings, and assertion booleans. Private policy material, credentials, and raw signatures are excluded.</p><div class="evidence-actions"><button class="outline-button" type="button" data-action="landing-auditor">Open Auditor</button><button class="outline-button" type="button" data-action="landing-demo">Open lifecycle</button><a class="landing-text-link" href="/evidence/index.json" target="_blank" rel="noreferrer">Evidence index ↗</a></div></div>
        <div class="evidence-terminal" role="group" aria-label="Current verified versus limited scope"><div class="terminal-bar"><span>PAYGUARD / SCOPE</span><span>2026-08-09</span></div><dl><div><dt>NETWORK</dt><dd>Coston2 · testnet only</dd></div><div><dt>CONTRACTS</dt><dd>Runtime + wiring checked</dd></div><div><dt>XRP → FDC → VAULT</dt><dd>One public run observed</dd></div><div><dt>FCC POLICY PATH</dt><dd>Simulated signers only</dd></div><div><dt>WEB DAPP</dt><dd>Wallet reads + guarded writes</dd></div><div><dt>RELEASE</dt><dd>Not yet verified</dd></div></dl><span class="terminal-cursor" aria-hidden="true">_</span></div>
      </section>

      <section class="landing-section landing-reveal faq-section" id="limits" aria-labelledby="limits-title">
        <div class="faq-heading"><div class="eyebrow">LIMITATIONS · READ FIRST</div><h2 id="limits-title">Clear answers before you trust the <em>system.</em></h2></div>
        <div class="faq-list">
          <details open><summary>What does PayGuard keep private?</summary><p>Policy relationships, caps, schedules, delegate rules, private entropy, and intermediate evaluation details are intended to remain inside the fixed FCC custody set. Public commitments and actions remain visible.</p></details>
          <details><summary>Does PayGuard hide XRP or FXRP transfers?</summary><p>No. Amount, recipient, timing, and transaction graph remain public. PayGuard is neither a mixer nor an anonymous payment rail.</p></details>
          <details><summary>What happens when FCC, FDC, FTSO, RPC, or relay fails?</summary><p>The affected path becomes unavailable, denied, or resumable from canonical public state. No dependency failure may become a mock proof, price, payment, evaluation, or execution.</p></details>
          <details><summary>What is live today?</summary><p>PayGuard has public Coston2 contracts, finalized wallet/vault/request reads, guarded vault and router writes, XRP/FDC/Smart Account/FAssets observations, and a credential-free three-signer lifecycle recorded on Coston2. A registered production FCC policy-machine release is not yet verified.</p></details>
        </div>
      </section>

      <section class="landing-final landing-reveal" aria-labelledby="final-title">
        <div class="final-mark" aria-hidden="true">P</div><div><div class="eyebrow">START WITH THE BOUNDARY</div><h2 id="final-title">Draft the rule locally.<br /><em>Verify</em> every next gate.</h2><p>No wallet is required to explore the product model. Validation computes an in-memory commitment only; it does not create custody receipts or authorization.</p></div><button class="primary-button" type="button" data-action="landing-studio">Open Policy Studio</button>
      </section>
    </main>
    <footer class="landing-footer"><span>PAYGUARD · PUBLIC CONTROL / PRIVATE RULES</span><span>TESTNET + SIMULATED SIGNERS · NO RELEASE CLAIM</span></footer>
  </div>`;
}

function guardianCard(kind: GuardianKind, name: string, role: string, copy: string, status: string): string {
  const signal = kind === "cipher" ? "CUSTODY / 03" : kind === "quorum" ? "DIGEST / 02" : "ROOT / N+1";
  return `<article class="guardian-card" data-mascot="${kind}"><div class="guardian-art" data-signal="${signal}" aria-hidden="true">${guardianMascot(kind)}</div><div class="guardian-copy"><span class="guardian-name">${name}</span><h3>${role}</h3><p>${copy}</p><span class="landing-tag">${status}</span></div></article>`;
}

function guardianMascot(kind: GuardianKind): string {
  if (kind === "cipher") {
    return `<svg class="guardian-svg guardian-cipher" viewBox="0 0 180 160" aria-hidden="true" focusable="false">
      <g class="mascot-orbit mascot-orbit-cipher" fill="none"><path d="M24 83a66 66 0 0 1 132 0 M35 113a66 66 0 0 0 110 0" /><path d="M20 83h14 M146 83h14" /></g>
      <g class="mascot-field mascot-cipher-field"><path d="M90 26 134 43v39c0 28-18 49-44 61-26-12-44-33-44-61V43z" /></g>
      <g class="mascot-body mascot-cipher-body" fill="none">
        <path d="M90 26 134 43v39c0 28-18 49-44 61-26-12-44-33-44-61V43z" />
        <path d="M59 52h62v43H59z M67 95v20l23 15 23-15V95" />
        <circle class="mascot-eye" cx="76" cy="72" r="3.5" /><circle class="mascot-eye" cx="104" cy="72" r="3.5" /><path d="M80 83h20" />
        <path class="mascot-lock" d="M81 102h18v17H81z M85 102v-6a5 5 0 0 1 10 0v6 M90 108v5" />
        <path d="M46 68 32 78l14 9 M134 68l14 10-14 9" />
      </g>
      <g class="mascot-custody" fill="none"><circle cx="51" cy="42" r="4" /><circle cx="90" cy="20" r="4" /><circle cx="129" cy="42" r="4" /><path d="m55 40 31-18 M94 22l31 18" /></g>
      <path class="mascot-scan mascot-cipher-scan" d="M60 61h60" />
      <circle class="mascot-signal" cx="90" cy="20" r="3.5" />
    </svg>`;
  }
  if (kind === "quorum") {
    return `<svg class="guardian-svg guardian-quorum" viewBox="0 0 180 160" aria-hidden="true" focusable="false">
      <g class="mascot-orbit mascot-orbit-quorum" fill="none"><circle cx="64" cy="77" r="52" /><circle cx="116" cy="77" r="52" /></g>
      <g class="mascot-field mascot-quorum-field"><rect x="27" y="43" width="52" height="70" rx="4" /><rect x="101" y="43" width="52" height="70" rx="4" /></g>
      <g class="mascot-body mascot-quorum-body" fill="none">
        <path d="M53 43V29l-8-7 M127 43V29l8-7" />
        <rect x="27" y="43" width="52" height="70" rx="4" /><rect x="101" y="43" width="52" height="70" rx="4" />
        <circle class="mascot-eye" cx="44" cy="65" r="3.5" /><circle class="mascot-eye" cx="62" cy="65" r="3.5" />
        <circle class="mascot-eye" cx="118" cy="65" r="3.5" /><circle class="mascot-eye" cx="136" cy="65" r="3.5" />
        <path d="M43 78h20 M117 78h20 M39 113v19 M67 113v19 M113 113v19 M141 113v19" />
        <path d="M79 88h9 M92 88h9" />
      </g>
      <g class="mascot-link" fill="none"><path d="M74 88h32" /><path d="m90 76 12 12-12 12-12-12z" /><path d="M84 88h12" /></g>
      <g class="mascot-witness-marks" fill="none"><path d="m43 96 5 5 10-11 M117 96l5 5 10-11" /></g>
      <circle class="mascot-signal" cx="90" cy="88" r="3.5" />
    </svg>`;
  }
  return `<svg class="guardian-svg guardian-ledger" viewBox="0 0 180 160" aria-hidden="true" focusable="false">
    <g class="mascot-orbit mascot-orbit-ledger" fill="none"><path d="M32 35h116v90H32z" /><path d="M24 48h16 M140 48h16 M24 112h16 M140 112h16" /></g>
    <g class="mascot-field mascot-ledger-field"><path d="M57 34h66v103H57z M49 43h8v86h-8z M123 43h8v86h-8z" /></g>
    <g class="mascot-body mascot-ledger-body" fill="none">
      <path d="M57 34h66v103H57z M49 43h8v86h-8z M123 43h8v86h-8z" />
      <path d="M69 48h42v31H69z" /><circle class="mascot-eye" cx="80" cy="62" r="3.5" /><circle class="mascot-eye" cx="100" cy="62" r="3.5" /><path d="M81 71h18" />
      <path d="M68 137v9 M112 137v9 M49 73H36l-8 10 M131 73h13l8 10" />
      <path d="M68 91h44v34H68z" />
    </g>
    <g class="mascot-checkpoints" fill="none"><path d="M76 99h28 M76 107h28 M76 115h19" /><circle cx="109" cy="99" r="2" /><circle cx="109" cy="107" r="2" /><circle cx="100" cy="115" r="2" /></g>
    <path class="mascot-ledger-tick" d="M69 86h42" />
    <circle class="mascot-signal" cx="121" cy="34" r="3.5" />
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
