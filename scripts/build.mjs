// Builds the profile artwork in assets/ (light + dark). No dependencies.
//   node scripts/build.mjs
// Edit the copy in PROJECTS / HERO below, re-run, commit.

import { mkdir, writeFile } from "node:fs/promises";

const OUT = "assets";

const THEMES = {
  dark: {
    ink: "#F0F6FC",
    muted: "#9198A1",
    faint: "#3D444D",
    card: "#151B23",
    border: "#262C36",
    accent: "#F2A65A",
  },
  light: {
    ink: "#1F2328",
    muted: "#59636E",
    faint: "#D1D9E0",
    card: "#F6F8FA",
    border: "#D8DEE4",
    accent: "#BC4C00",
  },
};

const SERIF = `'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif`;
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'Cascadia Mono',Consolas,Menlo,monospace`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ───────────── copy ───────────── */

const HERO = {
  kicker: "DHRUVA137   /   BENGALURU, IN",
  name: "Dhruva P Gowda",
  lines: ["Measuring what AI systems actually do —", "and building software that has to be checked."],
  tags: ["AI safety", "evaluation & measurement", "verified systems"],
};

const PROJECTS = [
  {
    slug: "passing-isnt-proof",
    kind: "Research",
    title: "Passing Isn’t Proof",
    body: ["How coding agents learn, hide and copy test-gaming,", "and a behavioural guard that stops it."],
    meta: "TARA · SAFL Agentic AI Security · 2026",
    glyph: "proof",
  },
  {
    slug: "Q.E.N.I.V.O",
    kind: "Engine",
    title: "QENIVO",
    body: ["A certified optimisation engine for LP, MILP and", "convex QP, written from the published mathematics."],
    meta: "Python · GPU-batched what-if planning",
    glyph: "simplex",
  },
  {
    slug: "V.E.R.A",
    kind: "Tool",
    title: "V.E.R.A.",
    body: ["Verified Enumeration of Risky Algorithms — finds", "the cryptography inside compiled binaries."],
    meta: "Python · CLI · API · MCP",
    glyph: "grid",
  },
  {
    slug: "kollude",
    kind: "Forensics",
    title: "kollude",
    body: ["Swarm-collusion forensics for multi-agent logs, with", "anytime-valid alarms and a named first mover."],
    meta: "Python · TypeScript · e-CUSUM",
    glyph: "converge",
  },
  {
    slug: "pramana",
    kind: "Agents",
    title: "Pramana",
    body: ["A deterministic admission gate between an AI", "shopping agent and the payment APIs it can reach."],
    meta: "Razorpay AI Buildathon · 2026",
    glyph: "seal",
  },
  {
    slug: "coast",
    kind: "Systems",
    title: "COAST",
    body: ["Keeps a vehicle’s position moving when GNSS dies,", "with a 392 KB on-device inertial-odometry model."],
    meta: "Smart India Hackathon · ISRO PS 26168",
    glyph: "tunnel",
  },
];

const SECTIONS = [
  { id: "now", n: "01", label: "Currently" },
  { id: "work", n: "02", label: "Selected work" },
  { id: "elsewhere", n: "03", label: "Elsewhere" },
];

/* ───────────── lorenz attractor ───────────── */

function lorenz() {
  const s = 10, r = 28, b = 8 / 3, dt = 0.006;
  let x = 0.1, y = 0, z = 0;
  const f = (x, y, z) => [s * (y - x), x * (r - z) - y, x * y - b * z];
  const pts = [];
  for (let i = 0; i < 7600; i++) {
    // RK4
    const k1 = f(x, y, z);
    const k2 = f(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], z + (dt / 2) * k1[2]);
    const k3 = f(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], z + (dt / 2) * k2[2]);
    const k4 = f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i > 600 && i % 3 === 0) pts.push([x, y, z]);
  }
  // Slight turn so the wings overlap a little; then fit into the box.
  const th = -0.75;
  const proj = pts.map(([x, y, z]) => [x * Math.cos(th) - y * Math.sin(th), z]);
  return proj;
}

function fit(pts, x0, y0, w, h) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / (bx - ax), h / (by - ay));
  const ox = x0 + (w - (bx - ax) * k) / 2, oy = y0 + (h - (by - ay) * k) / 2;
  return pts.map(([x, y]) => [ox + (x - ax) * k, oy + (by - y) * k]);
}

const toPath = (pts) =>
  "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");

/* ───────────── pieces ───────────── */

const style = (t, extra = "") => `<style>
.serif{font-family:${SERIF}}
.sans{font-family:${SANS}}
.mono{font-family:${MONO}}
.f{opacity:0;animation:rise 1.1s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
${extra}
@media (prefers-reduced-motion:reduce){.f,.d{animation:none;opacity:1;transform:none;stroke-dashoffset:0}}
</style>`;

function hero(t) {
  const W = 880, H = 290;
  const pts = fit(lorenz(), 590, 22, 270, 246);
  const d = toPath(pts);
  const tags = HERO.tags
    .map((tag, i) => (i ? `<tspan fill="${t.accent}">  ·  </tspan>` : "") + `<tspan>${esc(tag)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(HERO.name)}">
<title>${esc(HERO.name)}</title>
${style(t, `.d{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 7s cubic-bezier(.45,0,.2,1) .5s forwards}
@keyframes draw{to{stroke-dashoffset:0}}`)}
<defs>
  <radialGradient id="glow"><stop offset="0" stop-color="${t.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
</defs>

<text class="mono f" x="8" y="56" font-size="11" letter-spacing="2" fill="${t.muted}" style="animation-delay:.05s">${esc(HERO.kicker)}</text>
<text class="serif f" x="5" y="128" font-size="54" fill="${t.ink}" letter-spacing="-1" style="animation-delay:.2s">${esc(HERO.name)}</text>
<text class="serif f" x="8" y="174" font-size="20" font-style="italic" fill="${t.muted}" style="animation-delay:.45s">${esc(HERO.lines[0])}</text>
<text class="serif f" x="8" y="202" font-size="20" font-style="italic" fill="${t.muted}" style="animation-delay:.6s">${esc(HERO.lines[1])}</text>
<rect class="f" x="8" y="232" width="28" height="1.5" fill="${t.accent}" style="animation-delay:.8s"/>
<text class="sans f" x="8" y="258" font-size="13" fill="${t.muted}" style="animation-delay:.9s">${tags}</text>

<path id="lz" class="d" pathLength="1" d="${d}" fill="none" stroke="${t.muted}" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>
<g opacity="0">
  <circle r="9" fill="url(#glow)"/>
  <circle r="2.2" fill="${t.accent}"/>
  <animateMotion dur="70s" begin="7.5s" repeatCount="indefinite" rotate="0"><mpath xlink:href="#lz"/></animateMotion>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.02;.98;1" dur="70s" begin="7.5s" repeatCount="indefinite"/>
</g>
</svg>`;
}

function glyph(kind, t) {
  const m = `stroke="${t.muted}" stroke-opacity=".7"`;
  const a = `stroke="${t.accent}"`;
  const base = `fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case "proof":
      return `<g ${base}><rect x="3" y="3" width="34" height="34" rx="7" ${m}/><path d="M11 21l6 6 12-14" ${m}/><path d="M7 33L33 7" ${a}/></g>`;
    case "simplex":
      return `<g ${base}><path d="M4 30L9 11 27 4 37 19 27 36Z" ${m}/><path d="M13 1.5L39 7" ${m} stroke-dasharray="2 3"/><circle cx="27" cy="4" r="2.6" fill="${t.accent}" stroke="none"/></g>`;
    case "grid": {
      const hot = new Set([7, 13, 19]);
      let s = "";
      for (let i = 0; i < 25; i++) {
        const x = 2 + (i % 5) * 7.6, y = 2 + Math.floor(i / 5) * 7.6;
        s += hot.has(i)
          ? `<rect x="${x}" y="${y}" width="5" height="5" rx="1" fill="${t.accent}"/>`
          : `<rect x="${x}" y="${y}" width="5" height="5" rx="1" fill="none" stroke="${t.muted}" stroke-opacity=".55" stroke-width="1"/>`;
      }
      return `<g>${s}</g>`;
    }
    case "converge": {
      const ys = [4, 12, 20, 28, 36];
      return `<g ${base}>${ys.map((y) => `<path d="M5 ${y}L33 20" stroke="${t.muted}" stroke-opacity=".4"/><circle cx="4" cy="${y}" r="2" fill="${t.card}" ${m}/>`).join("")}<circle cx="34" cy="20" r="3.2" fill="${t.accent}" stroke="none"/></g>`;
    }
    case "seal":
      return `<g ${base}><circle cx="20" cy="20" r="17" ${m}/><circle cx="20" cy="20" r="12" ${m} stroke-dasharray="1.5 3"/><path d="M14.5 20.5l4 4 7-9" ${a} stroke-width="1.6"/></g>`;
    case "tunnel":
      return `<g ${base}><rect x="14" y="5" width="12" height="30" rx="2" fill="${t.muted}" fill-opacity=".12" stroke="none"/><path d="M2 33C7 31 11 26 14 23" ${m}/><path d="M14 23C18 20 22 19 26 17" ${a} stroke-dasharray="2.2 2.6"/><path d="M26 17C30 15 34 11 38 6" ${m}/><circle cx="38" cy="6" r="2.2" fill="${t.accent}" stroke="none"/></g>`;
  }
  return "";
}

function card(p, i, t) {
  const W = 432, H = 176;
  const n = String(i + 1).padStart(2, "0");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.title)}">
<title>${esc(p.title)}</title>
${style(t)}
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.card}" stroke="${t.border}"/>
<text class="mono" x="28" y="40" font-size="10.5" letter-spacing="1.6" fill="${t.muted}"><tspan fill="${t.accent}">${n}</tspan>   ${esc(p.kind.toUpperCase())}</text>
<g transform="translate(${W - 28 - 40} 22)">${glyph(p.glyph, t)}</g>
<text class="serif" x="27" y="84" font-size="26" letter-spacing="-.4" fill="${t.ink}">${esc(p.title)}</text>
<text class="sans" font-size="13" fill="${t.muted}">${p.body.map((l, k) => `<tspan x="28" y="${112 + k * 19}">${esc(l)}</tspan>`).join("")}</text>
<rect x="28" y="${H - 34}" width="${W - 56}" height="1" fill="${t.border}"/>
<text class="mono" x="28" y="${H - 14}" font-size="10" letter-spacing=".4" fill="${t.muted}" fill-opacity=".85">${esc(p.meta)}</text>
<text class="sans" x="${W - 28}" y="${H - 13}" font-size="13" text-anchor="end" fill="${t.accent}">↗</text>
</svg>`;
}

function section(s, t) {
  const W = 880, H = 44;
  const label = s.label.toUpperCase();
  const tx = 8 + 34 + label.length * 8.6 + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.label)}">
<title>${esc(s.label)}</title>
${style(t)}
<text class="mono" x="8" y="28" font-size="11" letter-spacing="2.4" fill="${t.muted}"><tspan fill="${t.accent}">${s.n}</tspan>   ${esc(label)}</text>
<rect x="${tx.toFixed(0)}" y="24" width="${(W - 8 - tx).toFixed(0)}" height="1" fill="${t.faint}"/>
</svg>`;
}

/* ───────────── write ───────────── */

await mkdir(OUT, { recursive: true });
const jobs = [];
for (const [name, t] of Object.entries(THEMES)) {
  jobs.push(writeFile(`${OUT}/hero-${name}.svg`, hero(t)));
  PROJECTS.forEach((p, i) => jobs.push(writeFile(`${OUT}/work-${i + 1}-${name}.svg`, card(p, i, t))));
  SECTIONS.forEach((s) => jobs.push(writeFile(`${OUT}/section-${s.id}-${name}.svg`, section(s, t))));
}
await Promise.all(jobs);
console.log(`wrote ${jobs.length} files to ${OUT}/`);
