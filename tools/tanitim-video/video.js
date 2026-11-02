// The KozaPass explainer video as a pure function of time: setup(payload) builds the page once, renderAt(t) poses
// every element for second t. make.mjs drives it frame by frame in a headless browser, so nothing here runs on a clock
// and the picture stays in step with the voice-over however long a frame takes to capture.
import { CHAIN, scenes as SCENES, STOPS } from "./scenes.mjs";

const STAGE = { x: 690, y: 96, w: 1130, h: 860 };
const BAR = 40;
const BEZEL = 13;
const FADE = 0.45;
const SHOT_FADE = 0.4;
const PROGRESS_W = 1000;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;
/** Progress of t through [a, b], 0..1. */
const seg = (t, a, b) => clamp((t - a) / (b - a));
const px = (v) => `${v}px`;

let ICONS = {};
let RUN = [];
let progress;
let brandMini;

function add(parent, cls, html = "", style = {}) {
  const e = document.createElement("div");
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  Object.assign(e.style, style);
  parent.appendChild(e);
  return e;
}

function addText(parent, cls, text) {
  const e = add(parent, cls);
  e.textContent = text;
  return e;
}

function pose(e, { x = 0, y = 0, s = 1, r = 0, o } = {}) {
  e.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
  if (o !== undefined) e.style.opacity = String(o);
}

/** A lucide icon (the app's icon set), drawn from the data make.mjs reads out of web/node_modules. */
function svgIcon(name, size, width = 2) {
  const node = ICONS[name];
  if (!node) throw new Error(`Missing icon: ${name}`);
  const inner = node
    .map(([tag, attrs]) => {
      const list = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${list}/>`;
    })
    .join("");
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** The KozaPass mark (web/components/brand/logo.tsx, full variant). */
function markSvg(size, cutout = "#fbf8f1") {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}"><g transform="translate(13 18.5) rotate(35)"><ellipse rx="8" ry="11" fill="#8c2f4b"/><path d="M-7.1 -4.5Q0 -2 7.1 -4.5M-7.8 0.6Q0 3.1 7.8 0.6M-6.8 5.6Q0 8 6.8 5.6" fill="none" stroke="${cutout}" stroke-width="1.1" stroke-linecap="round"/></g><path class="thread" pathLength="1" d="M19.3 9.5C20 6 24 5.5 24.5 8C25 10.5 21.5 10.5 22.5 7.5C23.5 4.5 27 4 30 2.5" fill="none" stroke="#8c2f4b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---------- shared pieces ----------

function topText(root, sc) {
  const box = add(root, "top-text");
  const parts = [sc.title, sc.body].filter(Boolean).map((t, i) => addText(box, i === 0 ? "title" : "body", t));
  return (lt) =>
    parts.forEach((e, i) => {
      const p = easeOut(seg(lt, 0.15 + i * 0.3, 0.85 + i * 0.3));
      pose(e, { y: lerp(24, 0, p), o: p });
    });
}

function textColumn(root, sc) {
  const col = add(root, "text-col");
  const chip = sc.chip ?? (sc.stop !== undefined && sc.stop < STOPS.length ? `${sc.stop + 1} · ${STOPS[sc.stop]}` : null);
  const parts = [];
  if (chip) parts.push(addText(col, "chip", chip.toLocaleUpperCase("tr")));
  parts.push(addText(col, "title", sc.title));
  if (sc.body) parts.push(addText(col, "body", sc.body));
  const emphasis = sc.emphasis ? addText(col, "emphasis", sc.emphasis) : null;
  return (lt, d) => {
    parts.forEach((e, i) => {
      const p = easeOut(seg(lt, 0.15 + i * 0.18, 0.75 + i * 0.18));
      pose(e, { y: lerp(26, 0, p), o: p });
    });
    if (emphasis) {
      const p = easeOut(seg(lt, 0.6 * d, 0.6 * d + 0.6));
      pose(emphasis, { s: lerp(0.9, 1, p), o: p });
    }
  };
}

function chainCard(root, c) {
  const e = add(root, "card", `<div class="ic">${svgIcon(c.icon, 34)}</div><div><div class="lb"></div><div class="sb"></div></div>`);
  e.querySelector(".lb").textContent = c.label;
  e.querySelector(".sb").textContent = c.sub;
  return e;
}

/** Where the chain cards lie in the problem scene: centre x, centre y, tilt. */
const SCATTER = [
  [400, 560, -6],
  [1500, 470, 5],
  [830, 820, -3],
  [1190, 610, 4],
  [1600, 830, -5],
];

const drift = (lt, i) => [Math.sin(lt * 0.9 + i * 1.7) * 6, Math.cos(lt * 0.7 + i) * 7, Math.sin(lt * 0.6 + i) * 1.2];

// ---------- scenes ----------

function buildIntro(root, sc) {
  const box = add(
    root,
    "intro",
    `<div class="intro-row"><div class="intro-mark">${markSvg(210)}</div><div class="intro-word">KozaPass</div></div><div class="intro-tag"></div>`,
  );
  box.querySelector(".intro-tag").textContent = sc.tagline;
  const mark = box.querySelector(".intro-mark");
  const thread = box.querySelector(".thread");
  const word = box.querySelector(".intro-word");
  const tag = box.querySelector(".intro-tag");
  thread.style.strokeDasharray = "1";
  return (lt) => {
    const m = easeOut(seg(lt, 0.15, 1.1));
    pose(mark, { s: lerp(0.72, 1, m), o: seg(lt, 0.15, 0.6) });
    thread.style.strokeDashoffset = String(1 - ease(seg(lt, 0.8, 1.8)));
    const w = easeOut(seg(lt, 1.0, 1.7));
    pose(word, { x: lerp(-26, 0, w), o: w });
    const g = easeOut(seg(lt, 1.7, 2.4));
    pose(tag, { y: lerp(18, 0, g), o: g });
  };
}

function buildProblem(root, sc) {
  const text = topText(root, sc);
  const cards = CHAIN.map((c) => chainCard(root, c));
  const cert = add(
    root,
    "cert",
    `<div class="ic">${svgIcon("badge-check", 34)}</div><div><div class="lb">GOTS sertifikası</div><div class="sb">Boyahane · PDF</div></div>`,
    { left: px(1010), top: px(370) },
  );
  const stamp = addText(cert, "stamp", "SÜRESİ DOLDU");
  // Messages between firms; the lost ones fade out halfway.
  const tokens = [
    { icon: "message-circle", color: "#22945a", from: 0, to: 3, at: 0.15 },
    { icon: "mail", color: "#2f6fdb", from: 1, to: 4, at: 0.23, lost: true },
    { icon: "sheet", color: "#1e7042", from: 3, to: 2, at: 0.31 },
    { icon: "message-circle", color: "#22945a", from: 2, to: 0, at: 0.4, lost: true },
    { icon: "file-text", color: "#6b665e", from: 4, to: 1, at: 0.48 },
    { icon: "mail", color: "#2f6fdb", from: 0, to: 1, at: 0.56, lost: true },
  ].map((t) => ({ ...t, el: add(root, "token", svgIcon(t.icon, 30, 2.2), { background: t.color }) }));

  return (lt, d) => {
    text(lt);
    cards.forEach((e, i) => {
      const [x, y, r] = SCATTER[i];
      const [dx, dy, dr] = drift(lt, i);
      const p = easeOut(seg(lt, 0.4 + i * 0.15, 1.1 + i * 0.15));
      e.style.left = px(x + dx);
      e.style.top = px(y + dy);
      pose(e, { s: lerp(0.85, 1, p), r: r + dr, o: p });
    });
    for (const t of tokens) {
      const q = (lt - t.at * d) / 2.0;
      if (q < 0 || q > 1.15) {
        t.el.style.display = "none";
        continue;
      }
      t.el.style.display = "";
      const [ax, ay] = SCATTER[t.from];
      const [bx, by] = SCATTER[t.to];
      const k = ease(clamp(q));
      const mx = (ax + bx) / 2;
      const my = Math.min(ay, by) - 170;
      let x = (1 - k) ** 2 * ax + 2 * (1 - k) * k * mx + k ** 2 * bx;
      let y = (1 - k) ** 2 * ay + 2 * (1 - k) * k * my + k ** 2 * by;
      let o = seg(q, 0, 0.12);
      let s = 1;
      if (t.lost) {
        const lost = seg(q, 0.45, 0.72);
        o *= 1 - lost;
        s = lerp(1, 0.55, lost);
        y += lost * 46;
        x += lost * 18;
      } else {
        o *= 1 - seg(q, 0.98, 1.15);
        s = 1 + 0.22 * Math.sin(Math.PI * seg(q, 0.86, 1.06));
      }
      t.el.style.left = px(x);
      t.el.style.top = px(y);
      pose(t.el, { s, o });
    }
    const c = easeOut(seg(lt, 0.34 * d, 0.34 * d + 0.7));
    pose(cert, { y: lerp(20, 0, c), r: -2, o: c });
    const st = seg(lt, 0.6 * d, 0.6 * d + 0.45);
    pose(stamp, { s: lerp(1.8, 1, easeOut(st)), r: -11, o: st });
  };
}

function buildRegulation(root, sc) {
  const text = topText(root, sc);
  const tag = add(
    root,
    "tag",
    `<svg width="420" height="720" viewBox="0 -90 420 720">
      <path d="M210 118 C 194 58, 238 0, 212 -86" fill="none" stroke="#b9a98f" stroke-width="3" stroke-linecap="round"/>
      <path d="M70 150 L210 60 L350 150 V596 a24 24 0 0 1 -24 24 H94 a24 24 0 0 1 -24 -24 Z" fill="#fff" stroke="#e2d6c3" stroke-width="3"/>
      <circle cx="210" cy="118" r="15" fill="#faf6ee" stroke="#d9cdb8" stroke-width="3"/>
      <text x="210" y="206" text-anchor="middle" font-family="Newsreader" font-size="29" fill="#1c1b19">Organik pamuk tişört</text>
      <text x="210" y="240" text-anchor="middle" font-family="Geist" font-size="17" fill="#5f5a52">%95 organik pamuk · %5 elastan</text>
      <rect class="qr-box" x="110" y="290" width="200" height="200" rx="18" fill="#fbf7f8" stroke="#8c2f4b" stroke-width="4" stroke-dasharray="16 12"/>
      <text class="qr-q" x="210" y="440" text-anchor="middle" font-family="Newsreader" font-size="160" fill="#8c2f4b">?</text>
      <text x="210" y="560" text-anchor="middle" font-family="Geist" font-size="19" fill="#8a857c">Dijital ürün pasaportu</text>
    </svg>`,
  );
  const box = tag.querySelector(".qr-box");
  const q = tag.querySelector(".qr-q");
  box.style.transformOrigin = "210px 390px";
  q.style.transformOrigin = "210px 390px";
  return (lt) => {
    text(lt);
    const p = easeOut(seg(lt, 0.3, 1.2));
    tag.style.opacity = String(p);
    tag.style.transform = `translateY(${lerp(50, 0, p)}px) rotate(${Math.sin((lt * 2 * Math.PI) / 3.4) * 2.2}deg)`;
    const b = easeOut(seg(lt, 1.1, 1.8));
    box.style.opacity = String(b);
    box.style.transform = `scale(${lerp(0.8, 1, b)})`;
    const k = seg(lt, 1.8, 2.3);
    const pulse = 1 + 0.06 * Math.sin(Math.max(0, lt - 2.3) * 3);
    q.style.opacity = String(k);
    q.style.transform = `scale(${lerp(1.6, 1, easeOut(k)) * (k >= 1 ? pulse : 1)})`;
  };
}

function buildSolution(root, sc) {
  const text = topText(root, sc);
  const ROW_Y = 520;
  const ROW_X = [330, 645, 960, 1275, 1590];
  const SCALE = 0.86;
  const half = 150 * SCALE;
  const arrows = ROW_X.slice(0, -1).map((x, i) => {
    const x1 = x + half + 8;
    const x2 = ROW_X[i + 1] - half - 8;
    return `<path class="arrow" pathLength="1" d="M${x1} ${ROW_Y} H${x2} M${x2 - 10} ${ROW_Y - 9} L${x2} ${ROW_Y} L${x2 - 10} ${ROW_Y + 9}" fill="none" stroke="#8c2f4b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  const funnel = ROW_X.map(
    (x) => `<path class="funnel" pathLength="1" d="M${x} ${ROW_Y + 62} C ${x} 690, 960 650, 960 772" fill="none" stroke="#d9cdb8" stroke-width="3" stroke-linecap="round"/>`,
  );
  const lines = add(root, "lines", `<svg width="1920" height="1080">${funnel.join("")}${arrows.join("")}</svg>`);
  const cards = CHAIN.map((c) => chainCard(root, c));
  const pill = add(root, "pp-pill", `${svgIcon("qr-code", 40, 2)}<span></span>`);
  pill.querySelector("span").textContent = sc.pill;
  const arrowEls = [...lines.querySelectorAll(".arrow")];
  const funnelEls = [...lines.querySelectorAll(".funnel")];
  for (const e of [...arrowEls, ...funnelEls]) e.style.strokeDasharray = "1";
  return (lt) => {
    text(lt);
    cards.forEach((e, i) => {
      const [sx, sy, sr] = SCATTER[i];
      const [dx, dy, dr] = drift(lt, i);
      const p = ease(seg(lt, 0.5 + i * 0.08, 1.9 + i * 0.08));
      e.style.left = px(lerp(sx + dx, ROW_X[i], p));
      e.style.top = px(lerp(sy + dy, ROW_Y, p));
      pose(e, { s: lerp(1, SCALE, p), r: lerp(sr + dr, 0, p), o: 1 });
    });
    arrowEls.forEach((e, i) => (e.style.strokeDashoffset = String(1 - easeOut(seg(lt, 2.0 + i * 0.12, 2.5 + i * 0.12)))));
    funnelEls.forEach((e) => (e.style.strokeDashoffset = String(1 - ease(seg(lt, 2.9, 3.8)))));
    const p = easeOut(seg(lt, 3.6, 4.2));
    pill.style.opacity = String(p);
    pill.style.transform = `translate(-50%, -50%) scale(${lerp(0.8, 1, p)})`;
  };
}

function cameraAt(cams, p) {
  if (p <= cams[0].at) return cams[0];
  for (let i = 1; i < cams.length; i++) {
    if (p <= cams[i].at) {
      const a = cams[i - 1];
      const b = cams[i];
      const q = ease((p - a.at) / (b.at - a.at));
      return { cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), zoom: lerp(a.zoom, b.zoom, q) };
    }
  }
  return cams[cams.length - 1];
}

/** One screenshot in a browser window or on a phone, with a camera (zoom and pan) and highlights. */
function buildShot(root, shot) {
  const [iw, ih] = shot.size;
  const [cx0, cy0, cw, ch] = shot.crop ?? [0, 0, iw, ih];
  let vw;
  let vh;
  let outerW;
  let outerH;
  if (shot.frame === "browser") {
    const aspect = cw / ch;
    vw = Math.round(Math.min(STAGE.w, (STAGE.h - BAR) * aspect, cw * (shot.maxScale ?? 10)));
    vh = Math.round(vw / aspect);
    outerW = vw;
    outerH = vh + BAR;
  } else {
    if (shot.scale) {
      vw = Math.round(cw * shot.scale);
      vh = Math.round(ch * shot.scale);
    } else {
      // A phone shows 844 of a 390 px wide page.
      vh = STAGE.h - 2 * BEZEL - 40;
      vw = Math.round((vh * 390) / 844);
    }
    outerW = vw + 2 * BEZEL;
    outerH = vh + 2 * BEZEL;
  }
  const [cx, cy] = shot.place ?? [STAGE.x + STAGE.w / 2, STAGE.y + STAGE.h / 2];
  const el = add(root, `shot ${shot.frame}`, "", {
    left: px(Math.round(cx - outerW / 2)),
    top: px(Math.round(cy - outerH / 2)),
    width: px(outerW),
    height: px(outerH),
  });
  if (shot.frame === "browser") {
    el.innerHTML = `<div class="bar"><i></i><i></i><i></i><div class="url">${svgIcon("lock", 13, 2.2)}kozapass.vercel.app</div></div>`;
  }
  const vp = add(el, "vp", "", { width: px(vw), height: px(vh) });
  const img = document.createElement("img");
  img.src = `/${shot.src}`;
  img.width = iw;
  img.height = ih;
  vp.appendChild(img);
  const highlights = (shot.highlights ?? []).map((h) => ({ ...h, el: add(vp, "hl") }));
  const label = shot.label ? addText(el, "shot-label", shot.label) : null;
  const k = vw / cw;
  const cams = shot.camera ?? [{ at: 0, cx: cx0 + cw / 2, cy: shot.frame === "phone" ? cy0 : cy0 + ch / 2, zoom: 1 }];

  return (lt, d) => {
    const a = shot.from * d;
    const b = shot.to * d;
    const fadeIn = shot.from > 0 ? seg(lt, a - SHOT_FADE / 2, a + SHOT_FADE / 2) : 1;
    const fadeOut = shot.to < 1 ? 1 - seg(lt, b - SHOT_FADE / 2, b + SHOT_FADE / 2) : 1;
    const o = Math.min(fadeIn, fadeOut);
    el.style.display = o <= 0 ? "none" : "";
    if (o <= 0) return;
    el.style.opacity = String(o);
    el.style.transform = `translateY(${lerp(28, 0, easeOut(fadeIn))}px)`;
    const local = lt - a;
    const len = b - a;
    const cam = cameraAt(cams, clamp(local / len));
    const S = k * cam.zoom;
    const tx = clamp(vw / 2 - cam.cx * S, vw - (cx0 + cw) * S, -cx0 * S);
    const ty = ch * S >= vh ? clamp(vh / 2 - cam.cy * S, vh - (cy0 + ch) * S, -cy0 * S) : (vh - ch * S) / 2 - cy0 * S;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${S})`;
    for (const h of highlights) {
      const ha = h.from * len;
      const hb = h.to * len;
      const ho = Math.min(seg(local, ha, ha + 0.35), h.to >= 1 ? 1 : 1 - seg(local, hb - 0.35, hb));
      h.el.style.display = ho <= 0 ? "none" : "";
      if (ho <= 0) continue;
      const [x, y, w, hh] = h.rect;
      const pad = 6;
      Object.assign(h.el.style, {
        left: px(tx + x * S - pad),
        top: px(ty + y * S - pad),
        width: px(w * S + 2 * pad),
        height: px(hh * S + 2 * pad),
        opacity: String(ho),
        transform: `scale(${lerp(1.05, 1, easeOut(seg(local, ha, ha + 0.4)))})`,
      });
    }
    if (label) label.style.opacity = String(easeOut(seg(lt, a + 0.25, a + 0.8)));
  };
}

function buildShots(root, sc) {
  const parts = [textColumn(root, sc), ...sc.shots.map((shot) => buildShot(root, shot))];
  return (lt, d) => parts.forEach((u) => u(lt, d));
}

function buildOutro(root, sc, payload) {
  const box = add(
    root,
    "outro",
    `<div class="o-left">
      <div class="o-brand"><span class="o-mark">${markSvg(150)}</span><span class="o-word">KozaPass</span></div>
      <div class="o-slogan"></div>
      <div class="o-url"></div>
    </div>
    <div class="o-qr">${payload.qr}<div>Canlı demo</div></div>`,
  );
  box.querySelector(".o-slogan").textContent = sc.slogan;
  box.querySelector(".o-url").textContent = sc.url;
  const notes = add(root, "o-notes");
  for (const line of [sc.note, payload.credit].filter(Boolean)) addText(notes, "", line);
  const mark = box.querySelector(".o-mark");
  const thread = box.querySelector(".thread");
  thread.style.strokeDasharray = "1";
  const word = box.querySelector(".o-word");
  const slogan = box.querySelector(".o-slogan");
  const url = box.querySelector(".o-url");
  const qr = box.querySelector(".o-qr");
  return (lt) => {
    const m = easeOut(seg(lt, 0.1, 0.9));
    pose(mark, { s: lerp(0.8, 1, m), o: m });
    thread.style.strokeDashoffset = String(1 - ease(seg(lt, 0.5, 1.4)));
    const w = easeOut(seg(lt, 0.5, 1.1));
    pose(word, { x: lerp(-20, 0, w), o: w });
    const s = easeOut(seg(lt, 1.0, 1.6));
    pose(slogan, { y: lerp(20, 0, s), o: s });
    const u = easeOut(seg(lt, 1.5, 2.1));
    pose(url, { y: lerp(16, 0, u), o: u });
    const q = easeOut(seg(lt, 1.8, 2.5));
    pose(qr, { s: lerp(0.9, 1, q), o: q });
    notes.style.opacity = String(easeOut(seg(lt, 2.4, 3.0)));
  };
}

const BUILDERS = {
  intro: buildIntro,
  problem: buildProblem,
  regulation: buildRegulation,
  solution: buildSolution,
  shots: buildShots,
  outro: buildOutro,
};

// ---------- the frame ----------

function buildProgress(frame) {
  const box = add(frame, "progress", `<div class="track"></div><div class="fill"></div>`);
  const fill = box.querySelector(".fill");
  const stops = STOPS.map((name, i) => {
    const e = add(box, "stop", "<b></b><span></span>", { left: px((i / (STOPS.length - 1)) * PROGRESS_W) });
    e.querySelector("span").textContent = name;
    return e;
  });
  return { box, fill, stops };
}

const stopX = (i) => (clamp(i, 0, STOPS.length - 1) / (STOPS.length - 1)) * PROGRESS_W;

window.setup = async ({ timeline, icons, qr, credit }) => {
  ICONS = icons;
  const frame = document.getElementById("frame");
  RUN = timeline.map((tl, index) => {
    const sc = SCENES.find((s) => s.id === tl.id);
    const el = add(frame, "scene", "", { display: "none" });
    return { ...tl, index, sc, el, update: BUILDERS[sc.layout](el, sc, { qr, credit }) };
  });
  brandMini = add(frame, "brand-mini", `${markSvg(36, "#faf6ee")}<span>KozaPass</span>`);
  progress = buildProgress(frame);
  const fonts = ["400 64px Newsreader", "600 30px Geist", "500 40px 'Geist Mono'"];
  await Promise.all(fonts.map((f) => document.fonts.load(f, "KozaPass ğüşİıöç")));
  await Promise.all(
    [...document.images].map((img) =>
      img.decode().catch(() => {
        throw new Error(`Image did not load: ${img.src}`);
      }),
    ),
  );
  return { fonts: fonts.map((f) => document.fonts.check(f, "ğüşİıöç")), duration: RUN.at(-1).start + RUN.at(-1).duration };
};

window.renderAt = (t) => {
  let barOpacity = 0;
  let brandOpacity = 0;
  let current = RUN[0];
  for (const r of RUN) {
    const lt = t - r.start;
    if (lt < 0 || lt > r.duration) {
      r.el.style.display = "none";
      continue;
    }
    current = r;
    const first = r.index === 0;
    const last = r.index === RUN.length - 1;
    const o = Math.min(first ? 1 : seg(lt, 0, FADE), last ? 1 - seg(lt, r.duration - 0.8, r.duration) : 1 - seg(lt, r.duration - FADE, r.duration));
    r.el.style.display = "";
    r.el.style.opacity = String(o);
    r.update(lt, r.duration);
    if (r.sc.stop !== undefined) barOpacity = Math.max(barOpacity, o);
    if (!first && !last) brandOpacity = Math.max(brandOpacity, o);
  }
  brandMini.style.opacity = String(brandOpacity);
  progress.box.style.opacity = String(barOpacity);
  const k = current.sc.stop;
  if (k !== undefined) {
    const previous = RUN[current.index - 1]?.sc.stop ?? -1;
    const p = easeOut(seg(t - current.start, 0.2, 1.1));
    const from = previous < 0 ? 0 : previous >= STOPS.length ? PROGRESS_W : stopX(previous);
    const to = k >= STOPS.length ? PROGRESS_W : stopX(k);
    progress.fill.style.width = px(lerp(from, to, p));
    progress.stops.forEach((e, i) => {
      e.classList.toggle("done", i < k);
      e.classList.toggle("active", i === k);
    });
  }
};
