// Clones every public, non-fork repo and measures the code in it.
// Writes data/corpus.json, which scripts/build.mjs turns into artwork.
//   GH_USER=dhruva137 CORPUS_DIR=/tmp/corpus node scripts/scan.mjs

import { execFileSync } from "node:child_process";
import { readdir, readFile, lstat, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import path from "node:path";
import os from "node:os";

const USER = process.env.GH_USER || "dhruva137";
const TOKEN = process.env.GH_TOKEN;
const DIR = process.env.CORPUS_DIR || path.join(os.tmpdir(), "corpus");
const SKIP_REPOS = new Set([USER.toLowerCase()]); // the profile repo would hash itself
const MAX_FILE = 512 * 1024;

const LANG = {
  py: "Python", ipynb: "Python", pyi: "Python",
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  c: "C", h: "C", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++", cu: "CUDA",
  dart: "Dart", rs: "Rust", go: "Go", java: "Java", kt: "Kotlin", swift: "Swift",
  sh: "Shell", bash: "Shell", sql: "SQL", r: "R", jl: "Julia", lua: "Lua",
  rb: "Ruby", php: "PHP", cs: "C#", scala: "Scala", hs: "Haskell", sol: "Solidity",
  zig: "Zig", ex: "Elixir", vue: "Vue", svelte: "Svelte",
};
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "vendor", "venv", ".venv", "env",
  "__pycache__", ".next", ".nuxt", "site-packages", "third_party", "coverage", ".cache",
]);

const headers = { "User-Agent": "corpus-scan", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

async function listRepos() {
  const all = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner&page=${page}`, { headers });
    if (!r.ok) throw new Error(`repo list -> ${r.status}`);
    const j = await r.json();
    all.push(...j);
    if (j.length < 100) break;
  }
  return all
    .filter((r) => !r.fork && !r.archived && r.size > 0 && !SKIP_REPOS.has(r.name.toLowerCase()))
    .map((r) => r.name)
    .sort();
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p);
    } else if (e.isFile()) yield p;
  }
}

function notebookCode(buf) {
  try {
    const nb = JSON.parse(buf.toString("utf8"));
    return (nb.cells || [])
      .filter((c) => c.cell_type === "code")
      .map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source || ""))
      .join("\n\n");
  } catch {
    return null;
  }
}

await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });

const repos = await listRepos();
const entries = [];
let cloned = 0;

for (const name of repos) {
  const dest = path.join(DIR, name);
  try {
    execFileSync("git", ["-c", "core.longpaths=true", "clone", "--depth", "1", "--quiet",
      `https://github.com/${USER}/${name}.git`, dest], { stdio: "ignore", timeout: 300_000, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
    cloned++;
  } catch {
    console.warn(`skip ${name}: clone failed`);
    continue;
  }
  for await (const file of walk(dest)) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const lang = LANG[ext];
    if (!lang || /\.min\.js$/i.test(file)) continue;
    const st = await lstat(file);
    if (st.size > MAX_FILE * (ext === "ipynb" ? 8 : 1)) continue;
    let buf = await readFile(file);
    let text;
    if (ext === "ipynb") {
      text = notebookCode(buf);
      if (text == null) continue;
    } else {
      if (buf.includes(0)) continue; // binary
      text = buf.toString("utf8");
    }
    text = text.replace(/\r\n?/g, "\n");
    if (!text.trim()) continue;
    const key = `${name}/${path.relative(dest, file).split(path.sep).join("/")}`;
    entries.push({ key, lang, buf: Buffer.from(text, "utf8"), text });
  }
}

entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

const hash = createHash("sha256");
const hist = new Array(256).fill(0);
const langs = {};
const tokens = new Map();
let bytes = 0, lines = 0, asserts = 0, todos = 0;

for (const e of entries) {
  hash.update(e.key + "\0");
  hash.update(e.buf);
  hash.update("\0");
  bytes += e.buf.length;
  for (const b of e.buf) hist[b]++;
  langs[e.lang] = (langs[e.lang] || 0) + e.buf.length;
  lines += (e.text.match(/\n/g) || []).length + (e.text.endsWith("\n") ? 0 : 1);
  asserts += (e.text.match(/\bassert\b/g) || []).length;
  todos += (e.text.match(/\b(TODO|FIXME|XXX|HACK)\b/g) || []).length;
  for (const t of e.text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []) tokens.set(t, (tokens.get(t) || 0) + 1);
}

const blob = Buffer.concat(entries.map((e) => e.buf));
const compressed = zlib.brotliCompressSync(blob, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 },
}).length;

// English filler from comments and docstrings doesn't count as "typed code".
const STOP = new Set("the and for that with this from are not you your but all can has have was were will what when which who how its into than then them they there these those our out any one two use used using also only more most such each other some here just like should would could been being does did".split(" "));
let top = ["", 0];
for (const [t, n] of tokens) if (n > top[1] && !STOP.has(t.toLowerCase())) top = [t, n];

const out = {
  generated: new Date().toISOString(),
  repos: cloned,
  files: entries.length,
  bytes,
  bits: bytes * 8,
  compressedBytes: compressed,
  lines,
  asserts,
  todos,
  topToken: { token: top[0], count: top[1] },
  sha256: hash.digest("hex"),
  langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([name, b]) => ({ name, bytes: b })),
  hist,
};

await mkdir("data", { recursive: true });
await writeFile("data/corpus.json", JSON.stringify(out, null, 1) + "\n");
console.log(`${cloned} repos · ${entries.length} files · ${bytes} bytes · sha256 ${out.sha256.slice(0, 16)}…`);
