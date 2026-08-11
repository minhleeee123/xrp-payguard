import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEMO_ORIGIN = "https://xrp-payguard.vercel.app";
export const DEMO_OUTPUT = "evidence/local/xrp-payguard-v2-candidate-demo-2026-08-11.mp4";
const FPS = 8;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseDemoCLI(args) {
  if (args[0] !== "record" || args.some((arg, index) => index > 0 && arg !== "--overwrite")) {
    throw new Error("usage: node tooling/record-web-demo.mjs record [--overwrite]");
  }
  return { overwrite: args.includes("--overwrite") };
}

export function verifyDemoManifest(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.status !== "AVAILABLE"
    || value.testnetOnly !== true || value.staticShellOnly !== true || !Array.isArray(value.entries)) {
    throw new Error("production evidence manifest is unavailable or unsafe");
  }
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.path !== "string" || !entry.path.startsWith("/evidence/")
      || entry.testnetOnly !== true || entry.noPrivateKeyRecorded !== true
      || entry.noCredentialRecorded !== true || entry.noPolicyPlaintextOrCiphertextRecorded !== true) {
      throw new Error("production evidence manifest contains an unsafe entry");
    }
  }
  const chain114 = value.entries.filter((entry) => entry.chainId === "114").length;
  const simulations = value.entries.filter((entry) => entry.path.startsWith("/evidence/simulation/")).length;
  const lifecycle = value.entries.some((entry) => entry.path === "/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json");
  if (value.entries.length !== 24 || chain114 !== 23 || simulations !== 3 || !lifecycle) {
    throw new Error("production evidence manifest does not match the reviewed demo baseline");
  }
  return { entries: value.entries.length, chain114, simulations };
}

export function isExpectedDemoFaviconFailure(status, url) {
  return status === 404 && url === `${DEMO_ORIGIN}/favicon.ico`;
}

async function command(name, args) {
  await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(name, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", rejectCommand);
    child.once("exit", (code, signal) => code === 0
      ? resolveCommand()
      : rejectCommand(new Error(`${name} failed with ${signal ?? `exit ${code}`}`)));
  });
}

async function requireCommand(name, versionArgs) {
  await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(name, versionArgs, { stdio: "ignore" });
    child.once("error", rejectCommand);
    child.once("exit", (code) => code === 0 ? resolveCommand() : rejectCommand(new Error(`${name} is unavailable`)));
  });
}

async function waitForDebugger(child) {
  return await new Promise((resolveDebugger, rejectDebugger) => {
    let buffered = "";
    const timeout = setTimeout(() => rejectDebugger(new Error("Chrome debugger startup timed out")), 15_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      buffered += chunk;
      const match = buffered.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolveDebugger(Number(match[1]));
      }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      rejectDebugger(new Error(`Chrome exited before debugger startup: ${signal ?? code}`));
    });
  });
}

async function pageForPort(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((candidate) => candidate.type === "page");
      if (page) return page;
    } catch {
      // The local debugger may need a few milliseconds after printing its URL.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Chrome page target did not become available");
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", rejectSocket, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const failures = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") failures.push("runtime-exception");
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error"
      && !isExpectedDemoFaviconFailure(404, message.params.entry.url)) failures.push("console-error");
    if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
      const expectedJsonFaviconFallback = isExpectedDemoFaviconFailure(
        message.params.response.status,
        message.params.response.url,
      );
      if (!expectedJsonFaviconFallback) failures.push(`http-${message.params.response.status}`);
    }
  });
  const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`browser evaluation failed: ${result.exceptionDetails.text}`);
    return result.result.value;
  };
  return { socket, send, evaluate, failures };
}

function srtTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function subtitles(stages) {
  let cursor = 0;
  return `${stages.map((stage, index) => {
    const start = cursor;
    cursor += stage.seconds;
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(cursor)}\n${stage.caption}\n`;
  }).join("\n")}\n`;
}

async function ensureOutputAvailable(path, overwrite) {
  try {
    await access(path, fsConstants.F_OK);
    if (!overwrite) throw new Error(`${path} already exists; pass --overwrite only after reviewing the existing artifact`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function recordDemo({ overwrite = false } = {}) {
  const response = await fetch(`${DEMO_ORIGIN}/evidence/index.json`, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`production evidence index returned HTTP ${response.status}`);
  const manifest = verifyDemoManifest(await response.json());
  await Promise.all([
    requireCommand("google-chrome", ["--version"]),
    requireCommand("ffmpeg", ["-version"]),
    requireCommand("ffprobe", ["-version"]),
  ]);

  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const output = resolve(repositoryRoot, DEMO_OUTPUT);
  if (!output.startsWith(`${resolve(repositoryRoot, "evidence/local")}/`)) throw new Error("demo output escaped ignored local evidence directory");
  await ensureOutputAvailable(output, overwrite);
  await mkdir(resolve(repositoryRoot, "evidence/local"), { recursive: true });
  const scratch = await mkdtemp(join(resolve(repositoryRoot, "evidence/local"), ".payguard-demo-"));
  const chromeProfile = join(scratch, "chrome-profile");
  const frames = join(scratch, "frames");
  const stagedOutput = join(scratch, "demo.mp4");
  await mkdir(frames);
  const chrome = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--remote-debugging-port=0", `--user-data-dir=${chromeProfile}`, "--window-size=1440,900",
    `${DEMO_ORIGIN}/#landing`,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let cdp;
  let frameNumber = 0;
  const stages = [
    { seconds: 6, caption: "XRP PayGuard V2 live candidate — confidential authorization policy, public testnet action" },
    { seconds: 8, caption: "The payment remains public; targets, caps, schedules, and delegate rules are the protected object" },
    { seconds: 9, caption: "Three guardians explain custody, two-matching-result quorum, and canonical rollback authority" },
    { seconds: 9, caption: "XRPL Payment → FDC proof → Smart Account → PayGuard vault → threshold policy gate" },
    { seconds: 8, caption: "Recurring personal and treasury controls are product models, not invented pilots or traction" },
    { seconds: 8, caption: "Public-safe evidence exposes only testnet facts and explicit simulated-versus-hardware boundaries" },
    { seconds: 10, caption: "Auditor: 24 reviewed records, 23 on Coston2, 3 explicit simulation records; categories overlap" },
    { seconds: 10, caption: "Wallet-free V2 proof: three registered status-2 machines, custody, ALLOW execution, CAP_EXCEEDED denial, governance, and conservation" },
    { seconds: 6, caption: "Current delivery: V2 live Coston2 candidate with simulated TEE — hardware release remains unverified" },
  ];

  try {
    const port = await waitForDebugger(chrome);
    const page = await pageForPort(port);
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"), cdp.send("Log.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));

    const capture = async () => {
      const result = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 86, fromSurface: true });
      frameNumber += 1;
      await writeFile(join(frames, `frame-${String(frameNumber).padStart(6, "0")}.jpg`), Buffer.from(result.data, "base64"));
    };
    const hold = async (seconds) => {
      for (let frame = 0; frame < seconds * FPS; frame += 1) {
        const started = Date.now();
        await capture();
        const remaining = Math.max(0, 1000 / FPS - (Date.now() - started));
        await new Promise((resolveWait) => setTimeout(resolveWait, remaining));
      }
    };
    const scrollTo = async (selector) => {
      const found = await cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (!found) throw new Error(`demo selector unavailable: ${selector}`);
      await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:"smooth",block:"start"})`);
    };

    const landing = await cdp.evaluate(`({title:document.title,sections:document.querySelectorAll(".landing-shell main > section").length,mascots:document.querySelectorAll(".guardian-svg").length,storage:localStorage.length+sessionStorage.length})`);
    if (!landing.title.startsWith("XRP PayGuard") || landing.sections !== 8 || landing.mascots !== 3 || landing.storage !== 0) {
      throw new Error(`production landing did not match the reviewed demo baseline: ${JSON.stringify(landing)}`);
    }
    await hold(stages[0].seconds);
    await scrollTo("#why"); await hold(stages[1].seconds);
    await scrollTo("#guardians"); await hold(stages[2].seconds);
    await scrollTo("#journey"); await hold(stages[3].seconds);
    await scrollTo("#use-cases"); await hold(stages[4].seconds);
    await scrollTo("#evidence"); await hold(stages[5].seconds);
    await cdp.evaluate(`document.querySelector("[data-action=landing-auditor]").click()`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    const auditor = await cdp.evaluate(`({text:document.body.innerText,storage:localStorage.length+sessionStorage.length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`);
    if (!auditor.text.includes("24 reviewed artifacts") || !auditor.text.includes("23 Coston2 artifacts")
      || !auditor.text.includes("3 local simulation artifacts") || auditor.storage !== 0 || auditor.overflow) {
      throw new Error("production Auditor did not match the reviewed demo baseline");
    }
    await hold(stages[6].seconds);
    await cdp.send("Page.navigate", { url: `${DEMO_ORIGIN}/#app/demo` });
    await new Promise((resolveWait) => setTimeout(resolveWait, 800));
    const lifecycle = await cdp.evaluate(`({text:document.body.innerText,storage:localStorage.length+sessionStorage.length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,legacyOpen:Boolean(document.querySelector(".legacy-demo-archive")?.open)})`);
    if (!lifecycle.text.includes("V2 LIVE CANDIDATE VERIFIED") || !lifecycle.text.includes("CAP_EXCEEDED")
      || !lifecycle.text.includes("13 public checkpoints") || !lifecycle.text.includes("hardware attestation and verified release remain open")
      || lifecycle.storage !== 0 || lifecycle.overflow || lifecycle.legacyOpen) {
      throw new Error("production V2 lifecycle did not match the reviewed candidate boundary");
    }
    await hold(3);
    await scrollTo(".demo-detail-grid");
    await hold(stages[7].seconds - 3);
    await cdp.send("Page.navigate", { url: `${DEMO_ORIGIN}/#landing` });
    await new Promise((resolveWait) => setTimeout(resolveWait, 800));
    await hold(stages[8].seconds);
    if (cdp.failures.length > 0) throw new Error(`browser failures observed: ${cdp.failures.join(",")}`);

    const subtitlePath = join(scratch, "captions.srt");
    await writeFile(subtitlePath, subtitles(stages), "utf8");
    await command("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", String(FPS), "-i", join(frames, "frame-%06d.jpg"),
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-vf", `subtitles=${subtitlePath}:force_style='FontName=DejaVu Sans,FontSize=12,PrimaryColour=&H00FFFFFF,BackColour=&HCC000000,BorderStyle=3,Outline=1,MarginV=24'`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", stagedOutput,
    ]);
    const metadataPath = join(scratch, "probe.json");
    await command("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height", "-of", "json", stagedOutput, "-o", metadataPath]);
    const probe = JSON.parse(await readFile(metadataPath, "utf8"));
    const video = probe.streams.find((stream) => stream.codec_name === "h264");
    const audio = probe.streams.find((stream) => stream.codec_name === "aac");
    const duration = Number(probe.format.duration);
    if (!video || video.width !== 1440 || video.height !== 900 || !audio || duration < 70 || duration > 80) {
      throw new Error("recorded demo media did not match the required format");
    }
    await rename(stagedOutput, output);
    return { status: "recorded", output: DEMO_OUTPUT, frames: frameNumber, durationSeconds: duration, bytes: Number(probe.format.size), manifest };
  } finally {
    if (cdp) cdp.socket.close();
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
      chrome.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
      ]);
    }
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function main() {
  const options = parseDemoCLI(process.argv.slice(2));
  console.log(JSON.stringify(await recordDemo(options), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
