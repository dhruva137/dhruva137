// Generates animated, theme-aware SVG panels from live GitHub data.
// No dependencies. Node 18+.
//
// Env:
//   GH_USER        GitHub username (defaults to repo owner)
//   GH_TOKEN       token for API + GraphQL (a classic PAT with no scopes is enough)
//   DISPLAY_NAME   headline name   (defaults to your GitHub profile name)
//   TAGLINE        one-line description under the name
//   EXCLUDE_LANGS  comma-separated languages to hide, e.g. "HTML,CSS,Jupyter Notebook"
//   MAX_REPOS      number of repositories to feature (default 6)

import { mkdir, writeFile, readFile } from "node:fs/promises";

const USER = process.env.GH_USER || process.env.GITHUB_REPOSITORY_OWNER || "dhruva137";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const TAGLINE = process.env.TAGLINE || "Building careful systems and measuring what they do.";
const EXCLUDE = (process.env.EXCLUDE_LANGS || "HTML,CSS,Jupyter Notebook").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_REPOS = Number(process.env.MAX_REPOS || 6);
const OUT = "assets";
const W = 880;
const PAD = 32;

if (!USER) throw new Error("Set GH_USER (or run inside GitHub Actions).");

/* ───────────────────────── data ───────────────────────── */

const headers = {
  "User-Agent": "readme-metrics",
  Accept: "application/vnd.github+json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function rest(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function contributions() {
  const empty = () => {
    // Zero-filled year so the layout still renders without a token.
    const days = [];
    const end = new Date();
    for (let i = 52 * 7 + end.getUTCDay(); i >= 0; i--) {
      days.push({ c: 0, d: new Date(end - i * 864e5).toISOString().slice(0, 10) });
    }
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { total: 0, weeks };
  };

  // 1. Try GraphQL if token is provided
  if (TOKEN) {
    try {
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`,
          variables: { login: USER },
        }),
      });
      const j = await r.json();
      if (j.data?.user?.contributionsCollection?.contributionCalendar) {
        const cal = j.data.user.contributionsCollection.contributionCalendar;
        return {
          total: cal.totalContributions,
          weeks: cal.weeks.map((w) => w.contributionDays.map((d) => ({ c: d.contributionCount, d: d.date }))),
        };
      }
    } catch (e) {
      console.warn("GraphQL unavailable, trying public fallback:", e.message);
    }
  }

  // 2. Fallback to public GitHub contribution endpoint (no token required)
  try {
    const r = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.contributions) && j.contributions.length > 0) {
        const days = j.contributions.map((d) => ({ c: d.count, d: d.date }));
        const weeks = [];
        for (let i = 0; i < days.length; i += 7) {
          weeks.push(days.slice(i, i + 7));
        }
        const total = (j.total && (j.total.lastYear ?? j.total[new Date().getFullYear()])) || days.reduce((a, b) => a + b.c, 0);
        return { total, weeks };
      }
    }
  } catch (e) {
    console.warn("Public contributions endpoint unavailable:", e.message);
  }

  return empty();
}

let user;
try {
  user = await rest(`/users/${USER}`);
} catch (e) {
  console.warn("Could not fetch user profile:", e.message);
  user = { name: USER, followers: 0 };
}
const NAME = process.env.DISPLAY_NAME || user.name || USER;

let repos = [];
try {
  for (let p = 1; p <= 3; p++) {
    const page = await rest(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed&page=${p}`);
    repos.push(...page);
    if (page.length < 100) break;
  }
} catch (e) {
  console.warn("Could not fetch repos list:", e.message);
}
repos = repos.filter((r) => !r.fork && !r.archived);

const langTotals = {};
await Promise.all(
  repos.slice(0, 25).map(async (r) => {
    try {
      const l = await rest(`/repos/${r.full_name}/languages`);
      for (const [k, v] of Object.entries(l)) if (!EXCLUDE.includes(k)) langTotals[k] = (langTotals[k] || 0) + v;
    } catch {}
  })
);

// Fallback to repo.language if detailed languages were rate-limited or empty
if (Object.keys(langTotals).length === 0) {
  for (const r of repos) {
    if (r.language && !EXCLUDE.includes(r.language)) {
      langTotals[r.language] = (langTotals[r.language] || 0) + (r.size || 100);
    }
  }
}

const cal = await contributions();
const days = cal.weeks.flat();
const weekTotals = cal.weeks.map((w) => w.reduce((a, d) => a + d.c, 0));

const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);
const forks = repos.reduce((a, r) => a + r.forks_count, 0);
const active30 = repos.filter((r) => Date.now() - new Date(r.pushed_at) < 30 * 864e5).length;

const featured = repos
  .filter((r) => r.name.toLowerCase() !== USER.toLowerCase())
  .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
  .slice(0, MAX_REPOS);

const langSum = Object.values(langTotals).reduce((a, b) => a + b, 0) || 1;
const langSorted = Object.entries(langTotals).sort((a, b) => b[1] - a[1]);
const langs = langSorted.slice(0, 6).map(([name, bytes]) => ({ name, pct: bytes / langSum }));
const rest_ = langSorted.slice(6).reduce((a, [, b]) => a + b, 0);
if (rest_ > 0) langs.push({ name: "Other", pct: rest_ / langSum });
if (langs.length === 0) langs.push({ name: "Code", pct: 1 });

let streak = 0, longest = 0, peak = 0;
for (const d of days) {
  streak = d.c > 0 ? streak + 1 : 0;
  longest = Math.max(longest, streak);
  peak = Math.max(peak, d.c);
}

let cur = 0;
{
  let i = days.length - 1;
  if (i >= 0 && days[i].c === 0) i--; // today may not have activity yet
  while (i >= 0 && days[i].c > 0) { cur++; i--; }
}

const today = new Date().toISOString().slice(0, 10);

/* ───────────────────────── helpers ───────────────────────── */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const ago = (iso) => {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso)) / 864e5;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 30) return `${Math.floor(d)} days ago`;
  if (d < 365) { const m = Math.floor(d / 30); return `${m} month${m > 1 ? "s" : ""} ago`; }
  const y = Math.floor(d / 365); return `${y} year${y > 1 ? "s" : ""} ago`;
};
const delay = (s) => `style="animation-delay:${s.toFixed(2)}s"`;

/* ───────────────────────── design tokens ─────────────────────────
   Cool neutral paper / ink with a single desaturated cobalt accent.
   Serif for display, sans for everything else. One slow motion
   sequence: the hero line draws, the activity field resolves.      */

const THEMES = {
  light: { bg: "#FBFBFA", ink: "#14171C", mute: "#6A707A", line: "#E3E5E8", accent: "#3A56D4" },
  dark: { bg: "#0F1115", ink: "#ECEEF1", mute: "#8A909B", line: "#23272E", accent: "#8CA2FF" },
};
const SERIF = `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

const css = (t) => `
text{font-family:${SANS};fill:${t.ink};font-variant-numeric:tabular-nums}
.lab{font-size:12px;fill:${t.mute}}
.sub{font-size:13px;fill:${t.mute}}
.serif{font-family:${SERIF};font-weight:400;letter-spacing:-.015em}
.f{opacity:0;animation:rise 1s cubic-bezier(.2,.7,.2,1) forwards}
.g{transform-box:fill-box;transform-origin:left center;transform:scaleX(0);animation:grow 1.4s cubic-bezier(.2,.7,.2,1) forwards}
.d{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 2.8s cubic-bezier(.4,0,.2,1) .4s forwards}
.p{animation:breathe 3.6s ease-in-out infinite}
.s{opacity:0;animation:scan 11s linear 4s infinite}
@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes grow{to{transform:scaleX(1)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes breathe{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes scan{0%{transform:translateX(0);opacity:0}6%{opacity:.55}94%{opacity:.55}100%{transform:translateX(795px);opacity:0}}
@media (prefers-reduced-motion:reduce){
  .f,.g,.d,.p{animation:none;opacity:1;transform:none;stroke-dashoffset:0}
  .s{display:none}
}`;

const frame = (t, h, body, w = W) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<style>${css(t)}</style>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="8" fill="${t.bg}" stroke="${t.line}"/>
${body}
</svg>`;

/* ───────────────────────── panels ───────────────────────── */

function hero(t) {
  // Compact strip: tagline + sparkline only. No name — GitHub already shows it.
  const H = 116;
  const max = Math.max(1, ...weekTotals);
  const x0 = PAD, x1 = W - PAD, yb = 94, hh = 32;
  const pts = weekTotals.map((v, i) => [x0 + ((x1 - x0) * i) / Math.max(1, weekTotals.length - 1), yb - (v / max) * hh]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] || [x1, yb];
  return frame(
    t,
    H,
    `
<text class="f" x="${PAD}" y="42" font-size="15" fill="${t.mute}" ${delay(0.1)}>${esc(trunc(TAGLINE, 110))}</text>
<text class="lab f" x="${PAD}" y="66" ${delay(0.3)}>Contributions, last 52 weeks</text>
<text class="lab f" x="${W - PAD}" y="66" text-anchor="end" ${delay(0.3)}>${fmt(cal.total)} total</text>
<rect x="${x0}" y="${yb}" width="${x1 - x0}" height="1" fill="${t.line}"/>
${
  pts.length
    ? `<path class="d" pathLength="1" d="${line}" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
<g class="f" ${delay(3.1)}><circle class="p" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${t.accent}"/></g>`
    : ""
}`
  );
}

/* ─── 3-D particle field ────────────────────────────────────
   Pure SVG + SMIL — no JS — works on GitHub.
   Three depth layers:
     Far  — tiny dim dots, very slow elliptic orbits
     Mid  — medium dots, moderate speed, muted edge flickers
     Near — larger accent dots, faster, bright edge pulses
   Edges blink in/out independently to suggest formations.
────────────────────────────────────────────────────────── */
function particle(t) {
  const W2 = W, H2 = 320;
  // Deterministic PRNG (seeded so the SVG is stable)
  let s = 0x9e3779b9;
  const rng = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };

  const layer = (n, rMin, rMax, durMin, durMax, opBase, opSpan, accentOdds) =>
    Array.from({ length: n }, (_, i) => ({
      cx:   PAD + rng() * (W2 - PAD * 2),
      cy:   24  + rng() * (H2 - 48),
      r:    rMin + rng() * (rMax - rMin),
      rx:   8   + rng() * 64,
      ry:   3   + rng() * 22,
      dur:  (durMin + rng() * (durMax - durMin)).toFixed(1),
      bDur: (durMin * 1.4 + rng() * durMax).toFixed(1),
      beg:  (rng() * 10).toFixed(1),
      op:   (opBase + rng() * opSpan).toFixed(2),
      fill: rng() < accentOdds ? t.accent : t.ink,
      id:   `pt_${Math.random().toString(36).slice(2, 7)}_${i}`,
    }));

  const far  = layer(30, 1.2, 2.2, 20, 40, 0.10, 0.20, 0.04);
  const mid  = layer(18, 2.0, 3.4, 11, 22, 0.28, 0.28, 0.12);
  const near = layer(10, 3.2, 5.2,  6, 14, 0.60, 0.30, 0.60);

  const dot = ({ cx, cy, r, rx, ry, dur, bDur, beg, op, fill, id }) => {
    const opLow = (parseFloat(op) * 0.25).toFixed(2);
    const pathD = `M${(cx - rx).toFixed(1)},${cy.toFixed(1)} a${rx},${ry} 0 1,1 ${(rx * 2).toFixed(1)},0 a${rx},${ry} 0 1,1 -${(rx * 2).toFixed(1)},0`;
    return [
      `<path id="${id}" d="${pathD}" fill="none" stroke="none"/>`,
      `<circle r="${r.toFixed(1)}" fill="${fill}">`,
      `  <animateMotion dur="${dur}s" repeatCount="indefinite" rotate="none" begin="${beg}s"><mpath href="#${id}"/></animateMotion>`,
      `  <animate attributeName="opacity" values="${opLow};${op};${opLow}" dur="${bDur}s" repeatCount="indefinite" begin="${beg}s"/>`,
      `</circle>`,
    ].join("\n");
  };

  // Edges — pre-sampled so the SVG has no runtime logic
  const edges = [];
  const tryEdge = (a, b, maxDist, stroke, sw, opPeak, durMin, durMax) => {
    const dx = a.cx - b.cx, dy = a.cy - b.cy;
    if (Math.hypot(dx, dy) < maxDist) {
      const dur = (durMin + rng() * durMax).toFixed(1);
      const beg = (rng() * 8).toFixed(1);
      edges.push(
        `<line x1="${a.cx.toFixed(1)}" y1="${a.cy.toFixed(1)}" x2="${b.cx.toFixed(1)}" y2="${b.cy.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}">` +
        `<animate attributeName="stroke-opacity" values="0;${opPeak};0.04;${(opPeak * 0.55).toFixed(2)};0" dur="${dur}s" repeatCount="indefinite" begin="${beg}s"/></line>`
      );
    }
  };
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++)
      tryEdge(near[i], near[j], 220, t.accent, 0.7, 0.38, 6, 10);
  for (let i = 0; i < mid.length; i++)
    for (let j = i + 1; j < mid.length; j++)
      tryEdge(mid[i], mid[j], 150, t.ink, 0.5, 0.14, 10, 16);

  const label = `<text font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" x="${PAD}" y="${H2 - 10}" fill="${t.mute}" opacity="0.35">particle field · ${far.length + mid.length + near.length} points</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" role="img">`,
    `<style>@media(prefers-reduced-motion:reduce){circle,line{animation:none!important}}</style>`,
    `<rect x=".5" y=".5" width="${W2 - 1}" height="${H2 - 1}" rx="8" fill="${t.bg}" stroke="${t.line}"/>`,
    ...edges,
    ...[...far, ...mid, ...near].map(dot),
    label,
    `</svg>`,
  ].join("\n");
}

function metrics(t) {
  const H = 136;
  const top = featured[0];
  const items = [
    ["Public repositories", fmt(repos.length), `${active30} active in the last 30 days`],
    ["Stars received", fmt(stars), top && top.stargazers_count > 0 ? `Most starred: ${trunc(top.name, 20)}` : "No stars yet"],
    ["Forks", fmt(forks), `${fmt(user.followers)} followers`],
    ["Contributions, 12 months", fmt(cal.total), `${(cal.total / 52).toFixed(1)} per week on average`],
  ];
  const colW = (W - PAD * 2) / 4;
  const cells = items
    .map(([label, value, sub], i) => {
      const x = PAD + i * colW + (i ? 20 : 0);
      const d = 0.15 + i * 0.12;
      return `${i ? `<rect x="${x - 20}" y="28" width="1" height="80" fill="${t.line}"/>` : ""}
<text class="lab f" x="${x}" y="46" ${delay(d)}>${esc(label)}</text>
<text class="serif f" x="${x}" y="88" font-size="40" ${delay(d + 0.05)}>${esc(value)}</text>
<text class="sub f" x="${x}" y="112" ${delay(d + 0.1)}>${esc(sub)}</text>`;
    })
    .join("\n");
  return frame(t, H, cells);
}

function activity(t) {
  const cs = 12, step = 15, y0 = 72;
  const H = y0 + 7 * step + 44;
  const nz = days.map((d) => d.c).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(nz.length * p))] || 1;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (c === 0 ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);
  const op = [0.08, 0.3, 0.52, 0.76, 1];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let prevM = -1, lastLabelCol = -9;
  const labels = [], cells = [];
  cal.weeks.forEach((w, col) => {
    const m = new Date(w[0].d).getUTCMonth();
    // Prevent overlapping left-edge month label if the following week immediately starts a new month
    const isFirstWeekTooClose = col === 0 && cal.weeks[1] && new Date(cal.weeks[1][0].d).getUTCMonth() !== m;
    if (m !== prevM) {
      if (!isFirstWeekTooClose && col - lastLabelCol >= 3 && col < cal.weeks.length - 2) {
        labels.push(`<text class="lab f" x="${PAD + col * step}" y="62" ${delay(0.3)}>${months[m]}</text>`);
        lastLabelCol = col;
      }
      prevM = m;
    }
    w.forEach((d, row) => {
      const l = level(d.c);
      cells.push(
        `<rect class="f" x="${PAD + col * step}" y="${y0 + row * step}" width="${cs}" height="${cs}" rx="2" fill="${l ? t.accent : t.ink}" fill-opacity="${op[l]}" ${delay(0.4 + col * 0.03 + row * 0.004)}/>`
      );
    });
  });

  const lx = W - PAD - 5 * step - 80;
  const legend = `<text class="lab" x="${lx}" y="${H - 18}" text-anchor="end">Less</text>` +
    op.map((o, i) => `<rect x="${lx + 8 + i * step}" y="${H - 28}" width="${cs}" height="${cs}" rx="2" fill="${i ? t.accent : t.ink}" fill-opacity="${o}"/>`).join("") +
    `<text class="lab" x="${lx + 8 + 5 * step + 4}" y="${H - 18}">More</text>`;

  return frame(
    t,
    H,
    `
<text class="lab f" x="${PAD}" y="38" ${delay(0.1)}>Activity</text>
<text class="lab f" x="${W - PAD}" y="38" text-anchor="end" ${delay(0.1)}>Longest streak ${longest} days, peak ${peak} in a day</text>
${labels.join("\n")}
${cells.join("\n")}
<rect class="s" x="${PAD}" y="${y0 - 4}" width="1.5" height="${7 * step + 4}" fill="${t.accent}"/>
${legend}`
  );
}

function languages(t) {
  const H = 168;
  const full = W - PAD * 2;
  const color = (i, last) => {
    if (i === 0) return [t.accent, 1];
    if (last && langs[i].name === "Other") return [t.ink, 0.1];
    return [t.ink, [0.8, 0.58, 0.42, 0.28, 0.18, 0.12][i - 1] ?? 0.12];
  };
  let x = PAD;
  const segs = langs
    .map((l, i) => {
      const w = Math.max(2, l.pct * full - 3);
      const [c, o] = color(i, true);
      const s = `<rect class="g" x="${x.toFixed(1)}" y="64" width="${w.toFixed(1)}" height="8" rx="1.5" fill="${c}" fill-opacity="${o}" ${delay(0.3 + i * 0.12)}/>`;
      x += l.pct * full;
      return s;
    })
    .join("\n");
  const colW = full / 4;
  const legend = langs
    .map((l, i) => {
      const cx = PAD + (i % 4) * colW, cy = 112 + Math.floor(i / 4) * 28;
      const [c, o] = color(i, true);
      return `<g class="f" ${delay(0.8 + i * 0.07)}>
<circle cx="${cx + 4}" cy="${cy - 4}" r="4" fill="${c}" fill-opacity="${o}"/>
<text x="${cx + 16}" y="${cy}" font-size="13">${esc(trunc(l.name, 14))}</text>
<text class="lab" x="${cx + colW - 24}" y="${cy}" text-anchor="end">${(l.pct * 100).toFixed(1)}%</text></g>`;
    })
    .join("\n");
  return frame(
    t,
    H,
    `<text class="lab f" x="${PAD}" y="38" ${delay(0.1)}>Languages, by bytes across ${Math.min(25, repos.length)} recent repositories</text>
${segs}
${legend}`
  );
}

function reposPanel(t) {
  const rowH = 64, top = 64;
  const H = top + featured.length * rowH + 12;
  const maxStars = Math.max(1, ...featured.map((r) => r.stargazers_count));
  const full = W - PAD * 2;
  const rows = featured
    .map((r, i) => {
      const b = top + i * rowH, d = 0.2 + i * 0.1;
      const bar = r.stargazers_count ? Math.max(3, (r.stargazers_count / maxStars) * full) : 0;
      return `
<text class="serif f" x="${PAD}" y="${b + 14}" font-size="20" ${delay(d)}>${esc(trunc(r.name, 36))}</text>
<text class="lab f" x="${W - PAD}" y="${b + 12}" text-anchor="end" ${delay(d)}>${fmt(r.stargazers_count)} star${r.stargazers_count === 1 ? "" : "s"}, ${fmt(r.forks_count)} fork${r.forks_count === 1 ? "" : "s"}</text>
<text class="sub f" x="${PAD}" y="${b + 36}" ${delay(d + 0.05)}>${esc(trunc(r.description || "No description.", 84))}</text>
<text class="lab f" x="${W - PAD}" y="${b + 34}" text-anchor="end" ${delay(d + 0.05)}>${esc([r.language, "pushed " + ago(r.pushed_at)].filter(Boolean).join(", "))}</text>
<rect x="${PAD}" y="${b + 48}" width="${full}" height="1" fill="${t.line}"/>
${bar ? `<rect class="g" x="${PAD}" y="${b + 47.5}" width="${bar.toFixed(1)}" height="2" fill="${t.accent}" ${delay(d + 0.2)}/>` : ""}`;
    })
    .join("\n");
  return frame(t, H, `<text class="lab f" x="${PAD}" y="38" ${delay(0.1)}>Selected repositories</text>\n${rows}`);
}

/* compact three-up cards (280 wide) */
const card = (t, body) => frame(t, 188, body, 280);

function overview(t) {
  const rows = [["Repositories", fmt(repos.length)], ["Stars", fmt(stars)], ["Forks", fmt(forks)], ["Followers", fmt(user.followers)]];
  return card(t, `<text class="lab f" x="24" y="34" ${delay(0.1)}>Overview</text>` +
    rows.map(([l, v], i) => {
      const y = 72 + i * 30;
      return `<g class="f" ${delay(0.2 + i * 0.1)}><text class="sub" x="24" y="${y}">${l}</text><text class="serif" x="256" y="${y}" text-anchor="end" font-size="20">${esc(v)}</text><rect x="24" y="${y + 9}" width="232" height="1" fill="${t.line}"/></g>`;
    }).join("\n"));
}

function langCard(t) {
  const top = langs.filter((l) => l.name !== "Other").slice(0, 5);
  const max = top[0]?.pct || 1;
  return card(t, `<text class="lab f" x="24" y="34" ${delay(0.1)}>Languages</text>` +
    top.map((l, i) => {
      const y = 66 + i * 24, w = Math.max(3, (l.pct / max) * 232);
      return `<g class="f" ${delay(0.2 + i * 0.1)}><text x="24" y="${y}" font-size="13">${esc(trunc(l.name, 16))}</text><text class="lab" x="256" y="${y}" text-anchor="end">${(l.pct * 100).toFixed(1)}%</text></g>
<rect x="24" y="${y + 7}" width="232" height="1" fill="${t.line}"/>
<rect class="g" x="24" y="${y + 6.5}" width="${w.toFixed(1)}" height="2" fill="${i ? t.ink : t.accent}" fill-opacity="${i ? 0.55 - i * 0.07 : 1}" ${delay(0.4 + i * 0.1)}/>`;
    }).join("\n"));
}

function streakCard(t) {
  return card(t, `<text class="lab f" x="24" y="34" ${delay(0.1)}>Streak</text>
<text class="serif f" x="24" y="102" font-size="56" ${delay(0.25)}>${cur}</text>
<text class="sub f" x="24" y="126" ${delay(0.35)}>${cur === 1 ? "day" : "days"} in a row</text>
<rect x="24" y="142" width="232" height="1" fill="${t.line}"/>
<text class="lab f" x="24" y="166" ${delay(0.5)}>Longest ${longest}</text>
<text class="lab f" x="256" y="166" text-anchor="end" ${delay(0.5)}>Peak ${peak} a day</text>`);
}

/* ───────────────────────── write ───────────────────────── */

await mkdir(OUT, { recursive: true });
const panels = { hero, particle, metrics, activity, languages, overview, langcard: langCard, streak: streakCard };
for (const [theme, t] of Object.entries(THEMES)) {
  for (const [name, fn] of Object.entries(panels)) {
    await writeFile(`${OUT}/${name}-${theme}.svg`, fn(t));
  }
}

console.log(`Rendered ${Object.keys(panels).length * 2} panels for ${USER}.`);

