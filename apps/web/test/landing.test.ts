import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { landingView } from "../src/landing.js";

describe("editorial landing page", () => {
  it("contains the full product story and honest release boundary", () => {
    const html = landingView();
    for (const id of ["why", "guardians", "journey", "use-cases", "evidence", "limits"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("PRIVATE POLICY · PUBLIC ACTION");
    expect(html).toContain("PayGuard is not private money");
    expect(html).toContain("Simulated signers only");
    expect(html).toContain("no production FCC claim");
    expect(html).toContain("Not yet verified");
    expect(html).toContain("PRODUCT MODEL · NOT PILOTED");
    expect(html).toContain('<a class="landing-brand" href="#landing"><span class="brand-mark" aria-hidden="true">P</span><span>PayGuard</span><span class="brand-beta" aria-hidden="true">COSTON2</span></a>');
    expect(html).not.toContain('class="landing-brand" href="#landing" aria-label=');
    expect(html.match(/class="neon-divider"/g)).toHaveLength(1);
    expect(html.match(/<details/g)).toHaveLength(4);
  });

  it("renders three meaningful code-native SVG mascots without chromatic assets", () => {
    const html = landingView();
    expect(html.match(/data-mascot=/g)).toHaveLength(3);
    expect(html).toContain('data-mascot="cipher"');
    expect(html).toContain('data-mascot="quorum"');
    expect(html).toContain('data-mascot="ledger"');
    expect(html).toContain('class="guardian-svg guardian-cipher"');
    expect(html).toContain('class="guardian-svg guardian-quorum"');
    expect(html).toContain('class="guardian-svg guardian-ledger"');
    expect(html).toContain('class="mascot-custody"');
    expect(html).toContain('class="mascot-link"');
    expect(html).toContain('class="mascot-checkpoints"');
    expect(html.match(/class="guardian-svg/g)).toHaveLength(3);
    expect(html.match(/aria-hidden="true" focusable="false"/g)).toHaveLength(4);
    expect(html).not.toMatch(/<img|gradient|data:image|https?:\/\/[^" ]+\.(?:png|jpe?g|webp)/i);
  });

  it("keeps motion optional and content visible without animation", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".reveal-ready .landing-reveal.is-visible");
    expect(css).toContain(".reveal-ready .landing-reveal { opacity: 1; transform: none; }");
    for (const motion of ["custodyConverge", "quorumLink", "ledgerTick"]) expect(css).toContain(`@keyframes ${motion}`);
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient/i);
  });

  it("ships a local SVG favicon instead of causing a production asset miss", () => {
    const document = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
    expect(document).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(favicon).toContain('fill="#c5ff4a"');
    expect(favicon).not.toMatch(/gradient|<image\b|href="https?:\/\//i);
  });
});
