// Builds the profile artwork in assets/ (light + dark). No dependencies.
//   node scripts/build.mjs        (reads data/corpus.json from scripts/scan.mjs)

import { mkdir, writeFile, readFile } from "node:fs/promises";

const OUT = "assets";
const corpus = JSON.parse(await readFile("data/corpus.json", "utf8"));
const today = new Date();

const THEMES = {
  dark: { ink: "#F0F6FC", muted: "#9198A1", faint: "#3D444D", card: "#151B23", border: "#262C36", accent: "#F2A65A" },
  light: { ink: "#1F2328", muted: "#59636E", faint: "#D1D9E0", card: "#F6F8FA", border: "#D8DEE4", accent: "#BC4C00" },
};

const SERIF = `'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif`;
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'Cascadia Mono',Consolas,Menlo,monospace`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => n.toLocaleString("en-US");

/* ───────────── fortunes (one per day) ───────────── */

const FORTUNES = [
  ["Program testing can be used to show the presence of bugs, but never to show their absence.", "Edsger W. Dijkstra"],
  ["Beware of bugs in the above code; I have only proved it correct, not tried it.", "Donald Knuth"],
  ["The first principle is that you must not fool yourself — and you are the easiest person to fool.", "Richard Feynman"],
  ["What I cannot create, I do not understand.", "Richard Feynman"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Simplicity is prerequisite for reliability.", "Edsger W. Dijkstra"],
  ["All models are wrong, but some are useful.", "George Box"],
  ["Debugging is twice as hard as writing the code in the first place.", "Brian Kernighan"],
  ["There are two ways of constructing a software design: make it so simple that there are obviously no deficiencies, or so complicated that there are no obvious deficiencies.", "C. A. R. Hoare"],
  ["Simplicity does not precede complexity, but follows it.", "Alan Perlis"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["The purpose of computing is insight, not numbers.", "Richard Hamming"],
  ["We can only see a short distance ahead, but we can see plenty there that needs to be done.", "Alan Turing"],
  ["When a measure becomes a target, it ceases to be a good measure.", "Goodhart's law"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["All problems in computer science can be solved by another level of indirection.", "David Wheeler"],
  ["The most dangerous phrase in the language is: we've always done it this way.", "Grace Hopper"],
  ["Plan to throw one away; you will, anyhow.", "Fred Brooks"],
  ["When in doubt, use brute force.", "Ken Thompson"],
  ["Data dominates.", "Rob Pike"],
  ["A language that doesn't affect the way you think about programming is not worth knowing.", "Alan Perlis"],
  ["Weeks of coding can save you hours of planning.", "unknown"],
];

/* ───────────── shared ───────────── */

const style = (extra = "") => `<style>
.serif{font-family:${SERIF}}.sans{font-family:${SANS}}.mono{font-family:${MONO}}
.f{opacity:0;animation:rise 1.1s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.blink{animation:blink 1.1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
${extra}
@media (prefers-reduced-motion:reduce){.f,.d,.c,.b{animation:none;opacity:1;transform:none;stroke-dashoffset:0}}
</style>`;

/* ───────────── hero ───────────── */

function lorenz() {
  const s = 10, r = 28, b = 8 / 3, dt = 0.006;
  let x = 0.1, y = 0, z = 0;
  const f = (x, y, z) => [s * (y - x), x * (r - z) - y, x * y - b * z];
  const pts = [];
  for (let i = 0; i < 7600; i++) {
    const k1 = f(x, y, z);
    const k2 = f(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], z + (dt / 2) * k1[2]);
    const k3 = f(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], z + (dt / 2) * k2[2]);
    const k4 = f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i > 600 && i % 3 === 0) pts.push([x, y, z]);
  }
  const th = -0.75;
  return pts.map(([x, y, z]) => [x * Math.cos(th) - y * Math.sin(th), z]);
}

function fit(pts, x0, y0, w, h) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / (bx - ax), h / (by - ay));
  const ox = x0 + (w - (bx - ax) * k) / 2, oy = y0 + (h - (by - ay) * k) / 2;
  return pts.map(([x, y]) => [ox + (x - ax) * k, oy + (by - y) * k]);
}

function hero(t) {
  const W = 880, H = 240;
  const d = "M" + fit(lorenz(), 560, 18, 300, 204).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
  const cmd = "$ cd ~/papertoanything";
  const cw = 7.8;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dhruva P Gowda">
<title>Dhruva P Gowda</title>
${style(`.d{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 7s cubic-bezier(.45,0,.2,1) .5s forwards}@keyframes draw{to{stroke-dashoffset:0}}`)}
<defs><radialGradient id="glow"><stop offset="0" stop-color="${t.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient></defs>
<text class="mono f" x="8" y="48" font-size="11" letter-spacing="2" fill="${t.muted}" style="animation-delay:.05s">DHRUVA137  ·  BLR  ·  12.97°N 77.59°E</text>
<text class="serif f" x="5" y="118" font-size="54" fill="${t.ink}" letter-spacing="-1" style="animation-delay:.2s">Dhruva P Gowda</text>
<text class="serif f" x="8" y="156" font-size="21" font-style="italic" fill="${t.muted}" style="animation-delay:.45s">Passing isn’t proof.</text>
<rect class="f" x="8" y="180" width="28" height="1.5" fill="${t.accent}" style="animation-delay:.7s"/>
<g class="f" style="animation-delay:.9s">
  <text class="mono" x="8" y="210" font-size="13" fill="${t.ink}" textLength="${(cmd.length * cw).toFixed(1)}" lengthAdjust="spacingAndGlyphs"><tspan fill="${t.accent}">$</tspan>${esc(cmd.slice(1))}</text>
  <rect class="blink" x="${(8 + cmd.length * cw + 4).toFixed(1)}" y="198" width="7.5" height="15" fill="${t.accent}"/>
</g>
<path id="lz" class="d" pathLength="1" d="${d}" fill="none" stroke="${t.muted}" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>
<g opacity="0">
  <circle r="9" fill="url(#glow)"/><circle r="2.2" fill="${t.accent}"/>
  <animateMotion dur="70s" begin="7.5s" repeatCount="indefinite"><mpath xlink:href="#lz"/></animateMotion>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.02;.98;1" dur="70s" begin="7.5s" repeatCount="indefinite"/>
</g>
</svg>`;
}

/* ───────────── corpus ───────────── */

const SHORT = { Python: "py", TypeScript: "ts", JavaScript: "js", Kotlin: "kt", "C++": "cpp", C: "c", Dart: "dart", Shell: "sh", Rust: "rs", Go: "go", Java: "java", Julia: "jl", "C#": "cs", R: "r", Swift: "swift", CUDA: "cu" };
const AGC_BITS = 38912 * 16; // Apollo Guidance Computer: 36K words rope + 2K words RAM, 16-bit words

function byteName(b) {
  if (b === 0x20) return "SP";
  if (b === 0x0a) return "\\n";
  if (b === 0x09) return "\\t";
  if (b > 0x20 && b < 0x7f) return `'${String.fromCharCode(b)}'`;
  return `0x${b.toString(16).padStart(2, "0")}`;
}

function corpusPanel(t, c) {
  const W = 880, H = 344, L = 28, R = W - 28;
  const bits = [...c.sha256].flatMap((h) => parseInt(h, 16).toString(2).padStart(4, "0").split("").map(Number));

  // 256-bit fingerprint
  let grid = "";
  bits.forEach((on, i) => {
    const x = L + (i % 32) * 12, y = 64 + Math.floor(i / 32) * 12;
    const delay = (0.3 + ((i * 97) % 256) / 256 * 1.6).toFixed(2);
    grid += on
      ? `<rect class="c" x="${x}" y="${y}" width="9" height="9" rx="1.5" fill="${t.accent}" style="animation-delay:${delay}s"/>`
      : `<rect class="c" x="${x}" y="${y}" width="9" height="9" rx="1.5" fill="${t.faint}" fill-opacity=".5" style="animation-delay:${delay}s"/>`;
  });
  const gw = 32 * 12 - 3;

  // readouts
  const tot = c.langs.reduce((s, l) => s + l.bytes, 0);
  const langStr = c.langs.slice(0, 4).map((l) => `${SHORT[l.name] || l.name.toLowerCase()} ${Math.round((l.bytes / tot) * 100)}`).join(" · ");
  const rows = [
    ["bits", num(c.bits)],
    ["brotli -q9", `${num(c.compressedBytes * 8)}  (${((c.compressedBytes / c.bytes) * 100).toFixed(1)}%)`],
    ["lines", num(c.lines)],
    ["files / repos", `${num(c.files)} / ${c.repos}`],
    ["assert", num(c.asserts)],
    ["TODO", num(c.todos)],
    ["hot token", `${c.topToken.token} ×${num(c.topToken.count)}`],
    ["langs %", langStr],
  ];
  const x0 = 478, cw = 6.9;
  let readouts = "";
  rows.forEach(([k, v], i) => {
    const y = 72 + i * 19;
    const a = x0 + k.length * cw + 10, b = R - v.length * cw - 10;
    readouts += `<text class="mono" x="${x0}" y="${y}" font-size="11.5" fill="${t.muted}">${esc(k)}</text>`;
    if (b > a) readouts += `<line x1="${a.toFixed(0)}" y1="${y - 3.5}" x2="${b.toFixed(0)}" y2="${y - 3.5}" stroke="${t.faint}" stroke-dasharray="1 3"/>`;
    readouts += `<text class="mono" x="${R}" y="${y}" font-size="11.5" text-anchor="end" fill="${t.ink}">${esc(v)}</text>`;
  });

  // byte histogram
  const max = Math.max(...c.hist);
  const step = (R - L) / 256, base = 306, hMax = 58;
  const top3 = c.hist.map((n, b) => [n, b]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((p) => p[1]);
  let bars = "";
  const bx = (b) => L + b * step + step / 2;
  c.hist.forEach((n, b) => {
    const h = n ? Math.max(1.5, (Math.log1p(n) / Math.log1p(max)) * hMax) : 1;
    const ws = b === 0x20 || b === 0x0a || b === 0x09;
    const fill = top3.includes(b) || ws ? t.accent : n ? t.muted : t.faint;
    const op = top3.includes(b) || ws ? 1 : b >= 0x80 ? 0.35 : n ? 0.6 : 0.5;
    bars += `<rect class="b" x="${(bx(b) - 1.05).toFixed(2)}" y="${(base - h).toFixed(1)}" width="2.1" height="${h.toFixed(1)}" fill="${fill}" fill-opacity="${op}" style="animation-delay:${(0.5 + b * 0.005).toFixed(3)}s"/>`;
  });
  let notes = "";
  let lastX = -1e9, lift = 0;
  [...top3].sort((a, b) => a - b).forEach((b) => {
    const h = (Math.log1p(c.hist[b]) / Math.log1p(max)) * hMax;
    lift = bx(b) - lastX < 60 ? lift + 11 : 0;
    lastX = bx(b);
    const pct = ((c.hist[b] / c.bytes) * 100).toFixed(1);
    notes += `<text class="mono f" x="${(bx(b) + 4).toFixed(1)}" y="${(base - h - 6 - lift).toFixed(1)}" font-size="9.5" fill="${t.ink}" style="animation-delay:2s">${esc(byteName(b))} ${pct}%</text>`;
  });
  const axis = [[0x00, "0x00", "start"], [0x20, "0x20", "middle"], [0x7f, "0x7F", "middle"], [0xff, "0xFF", "end"]]
    .map(([b, s, an]) => `<text class="mono" x="${an === "start" ? L : an === "end" ? R : bx(b).toFixed(1)}" y="${base + 16}" font-size="9.5" text-anchor="${an}" fill="${t.muted}">${s}</text>`)
    .join("");

  const when = c.generated.slice(0, 16).replace("T", " ");
  const agc = Math.round(c.bits / AGC_BITS);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="sha256 of all my code: ${c.sha256}">
<title>sha256(all my code)</title>
${style(`.c{opacity:0;animation:on .5s ease forwards}@keyframes on{to{opacity:1}}
.b{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);animation:grow .9s cubic-bezier(.2,.7,.2,1) forwards}@keyframes grow{to{transform:scaleY(1)}}`)}
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.card}" stroke="${t.border}"/>
<text class="mono" x="${L}" y="40" font-size="10.5" letter-spacing="1.6" fill="${t.muted}"><tspan fill="${t.accent}">sha256</tspan>( ALL MY CODE )</text>
<text class="mono" x="${R}" y="40" font-size="10.5" letter-spacing=".6" text-anchor="end" fill="${t.muted}">↻ ${esc(when)} UTC</text>
${grid}
<text class="mono" x="${L}" y="178" font-size="10.5" fill="${t.muted}" textLength="${gw}" lengthAdjust="spacingAndGlyphs">${c.sha256}</text>
<text class="serif" x="${L}" y="208" font-size="15" font-style="italic" fill="${t.muted}">≈ <tspan fill="${t.ink}">${agc}×</tspan> the memory of the Apollo Guidance Computer</text>
${readouts}
<rect x="${L}" y="230" width="${R - L}" height="1" fill="${t.border}"/>
${bars}
${notes}
${axis}
<text class="mono" x="${((bx(0x7f) + R) / 2).toFixed(0)}" y="${base + 16}" font-size="9.5" text-anchor="middle" fill="${t.muted}" fill-opacity=".8">byte frequency · log</text>
</svg>`;
}

/* ───────────── fortune ───────────── */

function wrap(s, n) {
  const out = [];
  let line = "";
  for (const w of s.split(" ")) {
    if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

function fortune(t) {
  const day = Math.floor(today.getTime() / 864e5);
  const [q, who] = FORTUNES[day % FORTUNES.length];
  const lines = wrap(q, 76);
  const cw = 9, lh = 27, y0 = 70, speed = 0.032, start = 0.8;
  const W = 880, attrY = y0 + (lines.length - 1) * lh + 36, H = attrY + 20;
  const total = start + q.length * speed + 0.4;

  let body = "", t0 = start;
  lines.forEach((ln, k) => {
    const y = y0 + k * lh, n = ln.length, t1 = t0 + n * speed;
    const kt = [0, t0 / total], wv = [0, 0], xv = [8, 8];
    for (let i = 1; i <= n; i++) { kt.push((t0 + i * speed) / total); wv.push(i * cw); xv.push(8 + i * cw + 2); }
    kt.push(1); wv.push(n * cw); xv.push(8 + n * cw + 2);
    const keyTimes = kt.map((v) => Math.min(1, v).toFixed(4)).join(";");
    const last = k === lines.length - 1;
    body += `<clipPath id="l${k}"><rect x="0" y="${y - 20}" width="${8 + n * cw + 2}" height="${lh}"><animate attributeName="width" calcMode="discrete" dur="${total.toFixed(2)}s" fill="freeze" keyTimes="${keyTimes}" values="${wv.map((w) => w + 8).join(";")}"/></rect></clipPath>
<text class="mono" x="8" y="${y}" font-size="15" fill="${t.ink}" textLength="${n * cw}" lengthAdjust="spacingAndGlyphs" clip-path="url(#l${k})">${esc(ln)}</text>
<rect x="8" y="${y - 14}" width="8" height="17" fill="${t.accent}" opacity="0">
  <animate attributeName="x" calcMode="discrete" dur="${total.toFixed(2)}s" fill="freeze" keyTimes="${keyTimes}" values="${xv.join(";")}"/>
  <set attributeName="opacity" to="1" begin="${t0.toFixed(2)}s"/>
  ${last ? `<animate attributeName="opacity" values="1;0" keyTimes="0;.5" calcMode="discrete" dur="1.1s" begin="${t1.toFixed(2)}s" repeatCount="indefinite"/>` : `<set attributeName="opacity" to="0" begin="${t1.toFixed(2)}s"/>`}
</rect>`;
    t0 = t1;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(q)} — ${esc(who)}">
<title>${esc(q)} — ${esc(who)}</title>
${style()}
<text class="mono" x="8" y="30" font-size="12" fill="${t.muted}"><tspan fill="${t.accent}">$</tspan> fortune</text>
${body}
<text class="serif" x="8" y="${attrY}" font-size="15" font-style="italic" fill="${t.muted}" opacity="0">— ${esc(who)}<set attributeName="opacity" to="1" begin="${(total - 0.2).toFixed(2)}s"/></text>
</svg>`;
}

/* ───────────── write ───────────── */

await mkdir(OUT, { recursive: true });
const jobs = [];
for (const [name, t] of Object.entries(THEMES)) {
  jobs.push(writeFile(`${OUT}/hero-${name}.svg`, hero(t)));
  jobs.push(writeFile(`${OUT}/corpus-${name}.svg`, corpusPanel(t, corpus)));
  jobs.push(writeFile(`${OUT}/fortune-${name}.svg`, fortune(t)));
}
await Promise.all(jobs);
console.log(`wrote ${jobs.length} files to ${OUT}/`);
