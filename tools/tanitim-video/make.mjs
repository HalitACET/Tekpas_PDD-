// Builds the KozaPass explainer video with a voice-over (how to run: README.md).
//   1. voice: one clip per scene, from Piper (offline), Gemini or your own recordings; cached in out/voice/<engine>/
//   2. timeline: every scene lasts as long as its clip needs
//   3. frames: video.html posed frame by frame in headless Chromium (Playwright from web/)
//   4. MP4: ffmpeg (from the local .venv) encodes the frames and the narration
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PIPER_LEXICON, scenes } from "./scenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(HERE, "out");
const WINDOWS = process.platform === "win32";
const PY = path.join(HERE, ".venv", WINDOWS ? "Scripts" : "bin", WINDOWS ? "python.exe" : "python");
const RATE = 24000;
/** Voice starts this long after its scene; the scene runs on this long after the voice; scenes cross-fade this long. */
const LEAD = 0.6;
const TAIL = 1.25;
const OVERLAP = 0.45;
const PIPER_VOICE = "tr_TR-dfki-medium";
// GEMINI_API_KEY and GEMINI_TTS_MODEL may sit in tools/tanitim-video/.env (git-ignored).
if (fs.existsSync(path.join(HERE, ".env"))) process.loadEnvFile(path.join(HERE, ".env"));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const FPS = Number(args.fps ?? 30);
/** How frames leave Chrome: PNG keeps the colours exactly; JPEG is faster. */
const FRAME = args["frame-format"] === "jpeg" ? "jpeg" : "png";
const ENGINE = args.voice ?? "piper";
const CREDITS = {
  piper: "Seslendirme: Piper, DFKI Türkçe ses (CC BY-NC-SA 4.0)",
  gemini: "Seslendirme: Google Gemini",
  files: "",
};
let FFMPEG;

function run(cmd, argv, { env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-2000)}`))));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (value) => createHash("sha1").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);

async function fetchRetry(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}

// ---------- WAV ----------

function readWav(file) {
  const b = fs.readFileSync(file);
  let fmt;
  for (let off = 12; off + 8 <= b.length; ) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === "data") return { ...fmt, data: b.subarray(off + 8, off + 8 + size) };
    off += 8 + size + (size % 2);
  }
  throw new Error(`No audio data in ${file}`);
}

function writeWav(file, pcm, rate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}

const wavSeconds = (file) => {
  const w = readWav(file);
  return w.data.length / (w.rate * w.channels * (w.bits / 8));
};

// ---------- voice ----------

const lexicon = (text) => Object.entries(PIPER_LEXICON).reduce((t, [from, to]) => t.replaceAll(from, to), text);

async function piper(text, file) {
  const dir = path.join(HERE, "voices");
  const model = path.join(dir, `${PIPER_VOICE}.onnx`);
  if (!fs.existsSync(model)) await run(PY, ["-m", "piper.download_voices", "--download-dir", dir, PIPER_VOICE]);
  const input = file.replace(/\.wav$/, ".txt");
  fs.writeFileSync(input, `${text}\n`, "utf8");
  await run(PY, ["-m", "piper", "-m", model, "-i", input, "-f", file, "--length-scale", "1.08", "--sentence-silence", "0.3"], {
    env: { PYTHONUTF8: "1" },
  });
}

async function gemini(text, file) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TTS_MODEL;
  if (!key || !model) throw new Error("--voice=gemini needs GEMINI_API_KEY and GEMINI_TTS_MODEL (see README.md).");
  const body = {
    contents: [{ parts: [{ text: `Bir tanıtım filminin anlatıcısı gibi sakin, net ve güven veren bir sesle oku: ${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE ?? "Charon" } } },
    },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 6) {
      const detail = await res.json().catch(() => ({}));
      const delay = detail.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      const seconds = delay ? Math.ceil(parseFloat(delay)) + 1 : 30;
      console.log(`gemini: rate limit, waiting ${seconds} s`);
      await sleep(seconds * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 600)}`);
    const part = (await res.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw new Error("gemini: the answer has no audio");
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000);
    writeWav(file, Buffer.from(part.inlineData.data, "base64"), rate);
    return;
  }
}

function recordings() {
  const dir = path.join(HERE, "recordings");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const found = scenes.map((_, i) => {
    const n = String(i + 1).padStart(2, "0");
    const f = files.find((name) => name.startsWith(`${n}.`));
    return f ? path.join(dir, f) : null;
  });
  const missing = found.map((f, i) => (f ? null : String(i + 1).padStart(2, "0"))).filter(Boolean);
  if (missing.length) throw new Error(`recordings/ is missing ${missing.map((n) => `${n}.*`).join(", ")} (see README.md).`);
  return found;
}

/** Silence trimmed at both ends; mono 24 kHz 16 bit for every engine. */
const TRIM = [
  "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
  "areverse",
  "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
  "areverse",
].join(",");

async function voice() {
  const dir = path.join(OUT, "voice", ENGINE);
  fs.mkdirSync(dir, { recursive: true });
  const sources = ENGINE === "files" ? recordings() : [];
  const clips = [];
  for (const [i, sc] of scenes.entries()) {
    const n = String(i + 1).padStart(2, "0");
    const text = ENGINE === "piper" ? lexicon(sc.voice) : sc.voice;
    const source = sources[i];
    const key = hash({ ENGINE, text, source: source ? fs.statSync(source).mtimeMs : null, piper: PIPER_VOICE, gemini: process.env.GEMINI_TTS_VOICE });
    const clip = path.join(dir, `${n}.wav`);
    const meta = path.join(dir, `${n}.json`);
    if (!fs.existsSync(clip) || readJson(meta)?.key !== key) {
      let raw = path.join(dir, `${n}.raw.wav`);
      if (ENGINE === "piper") await piper(text, raw);
      else if (ENGINE === "gemini") await gemini(text, raw);
      else if (ENGINE === "files") raw = source;
      else throw new Error(`Unknown voice "${ENGINE}": piper, gemini or files.`);
      await run(FFMPEG, ["-y", "-loglevel", "error", "-i", raw, "-af", TRIM, "-ac", "1", "-ar", String(RATE), "-sample_fmt", "s16", clip]);
      fs.writeFileSync(meta, JSON.stringify({ key, text }, null, 2));
      console.log(`voice ${n} (${wavSeconds(clip).toFixed(1)} s): ${sc.voice}`);
    }
    clips.push({ file: clip, duration: wavSeconds(clip) });
  }
  return clips;
}

// ---------- timeline and narration ----------

const round = (v) => Math.round(v * 1000) / 1000;

function plan(clips) {
  let end = 0;
  return scenes.map((sc, i) => {
    const lead = sc.lead ?? LEAD;
    const duration = Math.max(sc.minDuration, lead + clips[i].duration + TAIL);
    const start = i === 0 ? 0 : end - OVERLAP;
    end = start + duration;
    return { id: sc.id, start: round(start), duration: round(duration), voiceStart: round(start + lead), voiceDuration: round(clips[i].duration) };
  });
}

function narration(timeline, clips, file) {
  const last = timeline.at(-1);
  const total = last.start + last.duration;
  const out = Buffer.alloc(Math.ceil(total * RATE) * 2);
  const fade = Math.round(0.008 * RATE);
  timeline.forEach((tl, i) => {
    const { data } = readWav(clips[i].file);
    const n = data.length / 2;
    const at = Math.round(tl.voiceStart * RATE);
    for (let j = 0; j < n && at + j < out.length / 2; j++) {
      const gain = Math.min(1, j / fade, (n - 1 - j) / fade);
      out.writeInt16LE(Math.round(data.readInt16LE(j * 2) * gain), (at + j) * 2);
    }
  });
  writeWav(file, out, RATE);
  return total;
}

// ---------- assets for the page ----------

async function fonts() {
  const dir = path.join(OUT, "fonts");
  const css = path.join(dir, "fonts.css");
  if (fs.existsSync(css)) return;
  fs.mkdirSync(dir, { recursive: true });
  const url =
    "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=block";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  let text = await (await fetchRetry(url, { headers: { "user-agent": ua } })).text();
  const urls = [...new Set([...text.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  for (const [i, u] of urls.entries()) {
    fs.writeFileSync(path.join(dir, `f${i}.woff2`), Buffer.from(await (await fetchRetry(u)).arrayBuffer()));
    text = text.replaceAll(u, `f${i}.woff2`);
  }
  fs.writeFileSync(css, text);
}

/** The lucide icons video.js and scenes.mjs name, read from the web app's lucide-react (ISC licence). */
function icons() {
  const used = new Set();
  for (const file of ["video.js", "scenes.mjs"]) {
    for (const m of fs.readFileSync(path.join(HERE, file), "utf8").matchAll(/(?:svgIcon\(|icon:\s*)"([a-z0-9-]+)"/g)) used.add(m[1]);
  }
  const dir = path.join(ROOT, "web", "node_modules", "lucide-react", "dist", "esm", "icons");
  return Object.fromEntries(
    [...used].map((name) => {
      const src = fs.readFileSync(path.join(dir, `${name}.mjs`), "utf8");
      // The array after "node:", up to its matching bracket (some icons list aliases after it).
      const begin = src.indexOf("[", src.indexOf("node:"));
      let depth = 0;
      let quoted = false;
      let end = begin;
      for (; end < src.length; end++) {
        const c = src[end];
        if (c === '"' && src[end - 1] !== "\\") quoted = !quoted;
        if (quoted) continue;
        if (c === "[") depth++;
        if (c === "]" && --depth === 0) break;
      }
      if (begin < 0 || depth !== 0) throw new Error(`Cannot read icon ${name}`);
      return [name, Function(`return ${src.slice(begin, end + 1)}`)()];
    }),
  );
}

async function qrSvg(text) {
  const code = "import segno, sys; print(segno.make(sys.argv[1], error='m').svg_inline(scale=10, border=0, dark='#1c1b19', light=None, omitsize=True))";
  return (await run(PY, ["-c", code, text])).trim();
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
};

/** The repository over HTTP on 127.0.0.1, so the page can load its modules and the screenshots. */
function serve() {
  const server = createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------- frames and MP4 ----------

async function render(timeline, total, audio, output) {
  const { chromium } = createRequire(path.join(ROOT, "web", "package.json"))("@playwright/test");
  const server = await serve();
  // Google Chrome, as in web/playwright.config.ts.
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e));
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(new Error(m.text())));
    page.on("response", (r) => r.status() >= 400 && errors.push(new Error(`${r.status()} ${r.url()}`)));
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/tanitim-video/video.html`);
    await page.waitForFunction(() => typeof window.setup === "function");
    const info = await page.evaluate((payload) => window.setup(payload), {
      timeline,
      icons: icons(),
      qr: await qrSvg("https://kozapass.vercel.app"),
      credit: CREDITS[ENGINE],
    });
    if (errors.length) throw errors[0];
    if (!info.fonts.every(Boolean)) throw new Error(`Fonts did not load: ${JSON.stringify(info.fonts)}`);

    if (args.stills) {
      const dir = path.join(OUT, "stills");
      fs.mkdirSync(dir, { recursive: true });
      for (const t of String(args.stills).split(",").map(Number)) {
        await page.evaluate((s) => window.renderAt(s), t);
        await page.screenshot({ path: path.join(dir, `t${t.toFixed(1).padStart(5, "0")}.png`) });
      }
      console.log(`stills: ${dir}`);
      return;
    }

    const cdp = await page.context().newCDPSession(page);
    // --range=from-to (seconds) renders a part, to check a scene quickly.
    const [from, to] = typeof args.range === "string" ? args.range.split("-").map(Number) : [0, total];
    const first = Math.round(from * FPS);
    const last = Math.min(Math.ceil(to * FPS), Math.ceil(total * FPS));
    // Players expect BT.709 limited range (QuickTime, WhatsApp); JPEG frames are BT.601 full range.
    const convert = FRAME === "png" ? "scale=out_range=tv:out_color_matrix=bt709" : "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709";
    // prettier-ignore
    const ff = spawn(FFMPEG, [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", FRAME === "png" ? "png" : "mjpeg", "-i", "-",
      "-ss", String(from), "-t", String(to - from), "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0",
      "-vf", `${convert},format=yuv420p`,
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-r", String(FPS),
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart", "-shortest", output,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let ffError = "";
    ff.stderr.on("data", (d) => (ffError += d));
    const finished = new Promise((resolve, reject) =>
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffError.slice(-1500)}`)))),
    );
    const capture = FRAME === "png" ? { format: "png", optimizeForSpeed: true } : { format: "jpeg", quality: 92, optimizeForSpeed: true };
    for (let n = first; n < last; n++) {
      await page.evaluate((s) => window.renderAt(s), n / FPS);
      const { data } = await cdp.send("Page.captureScreenshot", capture);
      if (!ff.stdin.write(Buffer.from(data, "base64"))) await once(ff.stdin, "drain");
      if ((n - first) % (FPS * 15) === 0) console.log(`frames ${n - first}/${last - first}`);
    }
    ff.stdin.end();
    await finished;
    if (errors.length) throw errors[0];
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  if (!fs.existsSync(PY)) throw new Error("tools/tanitim-video/.venv is missing: see README.md (Kurulum).");
  FFMPEG = (await run(PY, ["-c", "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"])).trim();
  fs.mkdirSync(OUT, { recursive: true });
  await fonts();
  const clips = await voice();
  const timeline = plan(clips);
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
  const audio = path.join(OUT, `narration-${ENGINE}.wav`);
  const total = narration(timeline, clips, audio);
  console.log(`timeline: ${scenes.length} scenes, ${total.toFixed(1)} s`);
  if (args["voice-only"]) return;
  const output = path.resolve(typeof args.out === "string" ? args.out : path.join(OUT, `kozapass-tanitim-${ENGINE}.mp4`));
  await render(timeline, total, audio, output);
  if (!args.stills) console.log(`video: ${output}`);
}

main().catch((e) => {
  console.error(args.debug ? e : (e.message ?? e));
  process.exit(1);
});
