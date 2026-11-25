#!/usr/bin/env node
/**
 * Phase E — packaged desktop application verification harness (Linux focused).
 *
 * What it does
 *  - locates a packaged AppImage/deb (or OPENBENTT_PACKAGED_BINARY override)
 *  - statically inspects the shipped asar: CSP, sql.js WASM, PDF.js, native deps
 *  - launches the packaged app with a *strictly isolated* profile under
 *    /tmp/opencode (HOME/XDG/TMPDIR are redirected there too)
 *  - verifies clean first start, seeded old-profile upgrade + migration,
 *    project/notebook/conversation preservation, graceful shutdown, SIGKILL
 *    crash recovery, corrupt-DB recovery, and reopening after each event
 *  - writes JSON to /tmp/opencode/packaged-app-check.json by default
 *
 * Safety: this harness never points a browser at real user data. It refuses to
 * run when an explicitly supplied profile is outside /tmp/opencode, and all
 * child processes get isolated HOME/XDG/TMPDIR values.
 *
 * Usage:
 *   node scripts/perf/packaged-app-check.mjs [output.json]
 *   OPENBENTT_PACKAGED_BINARY=/path/to/Openbentt-2.5.9.AppImage \
 *     node scripts/perf/packaged-app-check.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import asar from "@electron/asar";
import initSqlJs from "sql.js";
import { buildCspMetaTag } from "../csp-policy.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/packaged-app-check.json");
const isolationRoot = "/tmp/opencode";
const releaseDir = path.join(appRoot, "release");
const startedAtMs = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Set once mkdtemp succeeds so the finalizer can release large extracted
 *  AppImage/deb payloads before writing the JSON report. */
let activeWorkDir = null;

const report = {
  schema: 1,
  startedAt: new Date(startedAtMs).toISOString(),
  finishedAt: null,
  appRoot,
  output,
  isolation: {},
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    display: process.env.DISPLAY ?? null,
    waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
    sessionType: process.env.XDG_SESSION_TYPE ?? null,
    requestedBinary: process.env.OPENBENTT_PACKAGED_BINARY ?? null,
    requestedProfile: process.env.OPENBENTT_PACKAGED_PROFILE ?? null,
    osLimits:
      "Linux only in this environment. Windows/macOS artifacts were not executed here; " +
      "their installers, user-data locations and update flows require separate machines.",
  },
  artifacts: { candidates: [], selected: null, static: null },
  launch: { attempts: [], runtimeBinary: null, mode: null, snapshotRepair: null },
  checks: [],
  phases: {},
  files: { logs: [], backups: [], profiles: [] },
  summary: { ok: false, passed: 0, failed: 0, warned: 0, skipped: 0 },
};

function log(message) {
  console.log(`[packaged-check] ${message}`);
}

function addCheck(id, status, details) {
  report.checks.push({ id, status, details });
  log(`${status.toUpperCase()} ${id}`);
  return status !== "fail";
}

function tail(file, limit = 8000) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.length > limit ? text.slice(-limit) : text;
  } catch {
    return "";
  }
}

function hasFatalLog(text) {
  return /(FATAL:|Unhandled|uncaught exception|Error mapping V8 startup snapshot|error while loading shared libraries|Trace\/breakpoint trap)/i.test(
    text ?? ""
  );
}

/** This Electron build logs a harmless service-worker registration error. */
function hasRealPageError(events) {
  return (events ?? []).some(
    (e) =>
      e.kind === "page-error" &&
      !/Failed to get ServiceWorkerRegistration objects/i.test(e.message ?? "")
  );
}

function freeBytes(dir) {
  try {
    const st = fs.statfsSync(dir);
    return st.bavail * st.bsize;
  } catch {
    return 0;
  }
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* file vanished */
        }
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function validateIsolation() {
  if (process.platform !== "linux") {
    throw new Error("This harness is Linux-focused; refusing to guess other OS user-data locations");
  }
  const rootReal = fs.realpathSync(isolationRoot);
  const requested = process.env.OPENBENTT_PACKAGED_PROFILE;
  fs.mkdirSync(rootReal, { recursive: true });
  let profile;
  if (requested) {
    profile = path.resolve(requested);
    if (!isUnder(profile, rootReal)) {
      throw new Error(`Refusing to run: OPENBENTT_PACKAGED_PROFILE=${profile} is outside ${rootReal}`);
    }
    fs.mkdirSync(profile, { recursive: true });
    const profileReal = fs.realpathSync(profile);
    if (!isUnder(profileReal, rootReal)) {
      throw new Error(`Refusing to run: profile symlink resolves outside ${rootReal}: ${profileReal}`);
    }
    const home = fs.realpathSync(os.homedir());
    if (isUnder(profileReal, home) || isUnder(home, profileReal)) {
      throw new Error("Refusing to run: isolated profile overlaps the real home directory");
    }
  }
  report.isolation = {
    root: rootReal,
    profile: requested ?? "(created per run)",
    realUserDataTouched: false,
    guard: "HOME, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME, XDG_STATE_HOME, TMPDIR and XDG_RUNTIME_DIR are redirected into the run workdir; --user-data-dir points inside /tmp/opencode",
  };
  return { rootReal, requested };
}

function classifyBinary(p) {
  if (/\.AppImage$/i.test(p)) return "appimage";
  if (/\.deb$/i.test(p)) return "deb";
  return "unpacked";
}

function candidateInfo(p, source) {
  const stat = fs.statSync(p);
  return {
    path: p,
    kind: classifyBinary(p),
    source,
    size: stat.size,
    mtime: fs.statSync(p).mtime.toISOString(),
    executable: Boolean(stat.mode & 0o111),
  };
}

function findCandidates() {
  const requested = process.env.OPENBENTT_PACKAGED_BINARY;
  if (requested) {
    const p = path.resolve(requested);
    if (!fs.existsSync(p)) throw new Error(`OPENBENTT_PACKAGED_BINARY does not exist: ${p}`);
    return [candidateInfo(p, "env-override")];
  }
  const entries = fs.existsSync(releaseDir) ? fs.readdirSync(releaseDir) : [];
  const find = (re) =>
    entries
      .filter((n) => re.test(n))
      .map((n) => candidateInfo(path.join(releaseDir, n), "release-dir"))
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  const candidates = [...find(/\.AppImage$/i), ...find(/\.deb$/i)];
  const unpacked = path.join(releaseDir, "linux-unpacked", "openbentt");
  if (fs.existsSync(unpacked)) candidates.push(candidateInfo(unpacked, "release-dir/unpacked"));
  return candidates;
}

function baseElectronArgs(port, profile) {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-dev-shm-usage",
    "--ozone-platform=x11",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--enable-software-rasterizer",
  ];
}

async function pickDebugPort() {
  for (let i = 0; i < 80; i += 1) {
    const port = 9500 + ((process.pid + i) % 300);
    try {
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: controller.signal,
      });
      if (res.ok) continue;
    } catch {
      return port;
    }
  }
  throw new Error("No free CDP debug port found");
}

function isolatedEnv(run, extra = {}) {
  return {
    ...process.env,
    HOME: run.home,
    XDG_CONFIG_HOME: run.xdgConfig,
    XDG_DATA_HOME: run.xdgData,
    XDG_CACHE_HOME: run.xdgCache,
    XDG_STATE_HOME: run.xdgState,
    XDG_RUNTIME_DIR: run.runtime,
    TMPDIR: run.tmp,
    ELECTRON_ENABLE_LOGGING: "1",
    // Never let the built app inherit an external profile/override.
    OPENBENTT_ELECTRON_DEV: "",
    ...extra,
  };
}

async function launchSession(run, config) {
  const port = await pickDebugPort();
  // Callers pass a 0 placeholder; the actual port is chosen here to avoid
  // collisions between sessions.
  const args = config.args.map((a) =>
    a === "--remote-debugging-port=0" ? `--remote-debugging-port=${port}` : a
  );
  const logFile = path.join(run.logsDir, `${config.label}.log`);
  const fd = fs.openSync(logFile, "w");
  const started = Date.now();
  const child = spawn(config.cmd, args, {
    cwd: config.cwd,
    env: isolatedEnv(run, config.env ?? {}),
    stdio: ["ignore", fd, fd],
  });
  const session = {
    label: config.label,
    cmd: config.cmd,
    args,
    cwd: config.cwd,
    env: config.env ?? {},
    port,
    pid: child.pid,
    logFile,
    startedAt: new Date().toISOString(),
    exit: null,
    events: [],
    browser: null,
    page: null,
    child,
  };
  child.on("exit", (code, signal) => {
    session.exit = { code, signal, atMs: Date.now() - started };
  });

  const cleanupOnFailure = async (err) => {
    if (!session.exit) {
      child.kill("SIGKILL");
      await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
    }
    if (session.browser) await session.browser.close().catch(() => {});
    fs.closeSync(fd);
    session.logTail = tail(logFile);
    throw err;
  };

  let endpoint = null;
  for (let i = 0; i < 600; i += 1) {
    if (session.exit) break;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        endpoint = (await res.json()).webSocketDebuggerUrl;
        if (endpoint) break;
      }
    } catch {
      /* not listening yet */
    }
    await sleep(100);
  }
  if (!endpoint) {
    return cleanupOnFailure(
      new Error(`CDP never became available for ${config.label}: ${tail(logFile, 1500)}`)
    );
  }
  session.cdpReadyMs = Date.now() - started;

  try {
    session.browser = await chromium.connectOverCDP(endpoint);
    const context = session.browser.contexts()[0] ?? (await session.browser.newContext());
    if (config.initScript) {
      // Installed before the reload below so React hydrates from the seeded
      // conversation instead of overwriting it with an empty in-memory array.
      await context.addInitScript(config.initScript.fn, config.initScript.arg);
    }
    let page = context.pages().find((p) => /^(app|file|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 20000 });
    if (config.initScript) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    page.on("crash", () => session.events.push({ kind: "page-crash", atMs: Date.now() - started }));
    page.on("close", () => session.events.push({ kind: "page-close", atMs: Date.now() - started }));
    page.on("pageerror", (e) =>
      session.events.push({ kind: "page-error", message: String(e).slice(0, 400) })
    );
    page.on("console", (m) => {
      if (m.type() === "error") {
        session.events.push({ kind: "console-error", message: m.text().slice(0, 300) });
      }
    });
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 60000 });
    session.page = page;
    session.pageReadyMs = Date.now() - started;
    session.state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      cspMeta:
        document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
      bridges: Object.keys(window).filter((k) => k.startsWith("openbentt")).sort(),
      navItems: document.querySelectorAll("button.sidebar-nav-item").length,
    }));
    session.alive = () => !session.exit && fs.existsSync(`/proc/${child.pid}`);
    session.evaluate = (fn, arg) => page.evaluate(fn, arg);
    session.stop = async (signal = "SIGTERM", timeoutMs = 20000) => {
      if (!session.exit) {
        child.kill(signal);
        await Promise.race([new Promise((r) => child.once("exit", r)), sleep(timeoutMs)]);
      }
      if (!session.exit) {
        child.kill("SIGKILL");
        await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
      }
      if (session.browser) await session.browser.close().catch(() => {});
      fs.closeSync(fd);
      session.logTail = tail(logFile);
      return session.exit;
    };
    return session;
  } catch (err) {
    return cleanupOnFailure(err);
  }
}

function sessionSummary(session) {
  return {
    label: session.label,
    cmd: session.cmd,
    args: session.args,
    pid: session.pid,
    port: session.port,
    cdpReadyMs: session.cdpReadyMs ?? null,
    pageReadyMs: session.pageReadyMs ?? null,
    state: session.state ?? null,
    events: session.events,
    exit: session.exit,
    logFile: session.logFile,
    logTail: session.logTail ?? tail(session.logFile),
  };
}

function runCmd(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", timeout: options.timeout ?? 180000, ...options });
}

function appImageSnapshotProbe(candidate, workDir) {
  const probeDir = path.join(workDir, "snapshot-probe");
  fs.mkdirSync(probeDir, { recursive: true });
  try {
    const res = runCmd(candidate.path, ["--appimage-extract", "snapshot_blob.bin"], {
      cwd: probeDir,
    });
    const file = path.join(probeDir, "squashfs-root", "snapshot_blob.bin");
    return {
      status: res.status,
      bytes: fs.existsSync(file) ? fs.statSync(file).size : null,
      error: (res.stderr ?? "").slice(0, 300),
    };
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function findAsarInDeb(workDir, candidate) {
  const debDir = path.join(workDir, "deb");
  fs.mkdirSync(debDir, { recursive: true });
  const unpack = runCmd("ar", ["x", candidate.path], { cwd: debDir });
  if (unpack.status !== 0) throw new Error(`ar x failed: ${unpack.stderr?.slice(0, 400)}`);
  const dataTar = fs.readdirSync(debDir).find((f) => /^data\.tar/.test(f));
  if (!dataTar) throw new Error("deb has no data.tar member");
  const list = runCmd("tar", ["-tf", path.join(debDir, dataTar)], { timeout: 180000 });
  const member = list.stdout
    .split("\n")
    .find((p) => /resources\/app\.asar$/.test(p.trim()));
  if (!member) throw new Error("deb payload has no resources/app.asar");
  const asarPath = path.join(workDir, "static", "app.asar");
  fs.mkdirSync(path.dirname(asarPath), { recursive: true });
  const fd = fs.openSync(asarPath, "w");
  const extract = runCmd("tar", ["-xOf", path.join(debDir, dataTar), member.trim()], {
    stdio: ["ignore", fd, "pipe"],
  });
  fs.closeSync(fd);
  if (extract.status !== 0) throw new Error(`tar extract app.asar failed: ${extract.stderr}`);
  return { asarPath, source: `${candidate.kind}:${member.trim()}` };
}

function locateAsar(workDir, candidate) {
  const staticDir = path.join(workDir, "static");
  if (candidate.kind === "appimage") {
    const available = freeBytes(workDir);
    if (available < 1.5 * 1024 ** 3) {
      return {
        asarPath: null,
        source: null,
        note: `AppImage static extraction skipped: only ${Math.round(available / 1024 ** 3)} GiB free`,
      };
    }
    fs.mkdirSync(staticDir, { recursive: true });
    const res = runCmd(candidate.path, ["--appimage-extract", "resources/app.asar"], {
      cwd: staticDir,
    });
    const extracted = path.join(staticDir, "squashfs-root", "resources", "app.asar");
    if (res.status === 0 && fs.existsSync(extracted) && fs.statSync(extracted).size > 0) {
      return { asarPath: extracted, source: "appimage:extracted-app.asar" };
    }
    return {
      asarPath: null,
      source: null,
      note: `AppImage app.asar extraction failed: ${(res.stderr ?? "").slice(0, 300)}`,
    };
  }
  if (candidate.kind === "deb") {
    try {
      return findAsarInDeb(workDir, candidate);
    } catch (err) {
      return { asarPath: null, source: null, note: String(err.message ?? err) };
    }
  }
  const sibling = path.join(path.dirname(candidate.path), "resources", "app.asar");
  if (fs.existsSync(sibling)) return { asarPath: sibling, source: "unpacked:sibling-app.asar" };
  return { asarPath: null, source: null, note: "no sibling resources/app.asar" };
}

function inspectPackage(asarPath, source) {
  if (!asarPath) return { available: false, source, note: "no asar inspected" };
  const files = asar.listPackage(asarPath).map((p) => p.replace(/^[/\\]+/, ""));
  const set = new Set(files);
  const stat = (p) => {
    try {
      return asar.statFile(asarPath, p);
    } catch {
      return { size: 0, unpacked: false };
    }
  };
  const wasm = stat("node_modules/sql.js/dist/sql-wasm.wasm");
  const pdfSource = files.find((p) => /^node_modules\/pdfjs-dist\/build\/pdf\.worker[^/]*\.mjs$/.test(p));
  const pdfBuilt = files.find((p) => /^dist\/assets\/pdf\.worker[^/]*\.mjs$/.test(p));
  const cmaps = files.filter((p) => p.startsWith("node_modules/pdfjs-dist/cmaps/")).length;
  const native = files
    .filter((p) => p.endsWith(".node"))
    .map((p) => ({ path: p, ...stat(p) }));
  const unpackedNative = native.filter((n) => n.unpacked && n.size > 0);
  const groups = [...new Set(unpackedNative.map((n) => n.path.split("/").slice(0, 3).join("/")))];
  const indexHtml = set.has("dist/index.html")
    ? asar.extractFile(asarPath, "dist/index.html").toString("utf8")
    : "";
  const expectedTag = buildCspMetaTag();
  return {
    available: true,
    source,
    asarPath,
    asarBytes: fs.statSync(asarPath).size,
    fileCount: files.length,
    mainPresent: set.has("electron/main.mjs"),
    indexHtmlPresent: Boolean(indexHtml),
    csp: {
      present: indexHtml.includes('http-equiv="Content-Security-Policy"'),
      exactCanonicalTag: indexHtml.includes(expectedTag),
      expectedTag,
    },
    sqlJsWasm: {
      path: "node_modules/sql.js/dist/sql-wasm.wasm",
      present: set.has("node_modules/sql.js/dist/sql-wasm.wasm"),
      bytes: wasm.size,
    },
    pdfjs: {
      sourceWorker: pdfSource ?? null,
      builtWorker: pdfBuilt ?? null,
      cmapFiles: cmaps,
      present: Boolean(pdfSource && pdfBuilt && cmaps > 0),
    },
    nativeDeps: {
      totalNodeFiles: native.length,
      unpackedNonEmpty: unpackedNative.length,
      groups: groups.slice(0, 20),
      representative: unpackedNative.slice(0, 8),
      present: unpackedNative.length >= 3 && groups.length >= 3,
    },
  };
}

const SQL = await initSqlJs({
  wasmBinary: fs.readFileSync(path.join(appRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm")),
});

function readRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbSummary(file) {
  if (!fs.existsSync(file)) return { exists: false, valid: false };
  const buf = fs.readFileSync(file);
  const header = buf.subarray(0, 16).toString("latin1");
  if (header !== "SQLite format 3\0") {
    return { exists: true, valid: false, header: header.replace(/[^\x20-\x7e]/g, "?"), bytes: buf.length };
  }
  const db = new SQL.Database(new Uint8Array(buf));
  try {
    const versionRows = readRows(db, "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1");
    // The seeded v5 DB predates the `knowledge` column (added in v6), so do
    // not assume post-migration columns here.
    const projects = readRows(db, "SELECT id, title FROM projects ORDER BY id");
    const drafts = readRows(db, "SELECT project_id, content FROM drafts");
    const papers = readRows(db, "SELECT id, project_id, file_name, extracted_text FROM papers");
    const files = readRows(db, "SELECT id, project_id, path, content FROM project_files");
    const chunks = readRows(db, "SELECT id, project_id, text FROM corpus_chunks");
    const logs = readRows(
      db,
      "SELECT id, thread_id, role, content FROM chat_logs ORDER BY created_at ASC"
    );
    const snapshots = readRows(db, "SELECT id, project_id, reason FROM project_snapshots");
    return {
      exists: true,
      valid: true,
      bytes: buf.length,
      schemaVersion: versionRows[0]?.version ?? null,
      projects,
      drafts,
      papers,
      files,
      chunks,
      chatLogs: logs,
      snapshots,
    };
  } catch (err) {
    return { exists: true, valid: false, error: String(err?.message ?? err), bytes: buf.length };
  } finally {
    db.close();
  }
}

function writeLegacyDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) VALUES (5);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      target_venue TEXT NOT NULL DEFAULT 'generic', linked_thread_ids TEXT NOT NULL DEFAULT '[]',
      revision_suggestions TEXT NOT NULL DEFAULT '[]', model_attributions TEXT NOT NULL DEFAULT '[]',
      abstract_variants TEXT NOT NULL DEFAULT '[]', keyword_suggestions TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE drafts (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE bibliography (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE papers (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL, added_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
      extracted_text TEXT NOT NULL DEFAULT '', page_count INTEGER);
    CREATE TABLE corpus_chunks (
      id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL, text TEXT NOT NULL, page_hint INTEGER,
      PRIMARY KEY (id, project_id));
    CREATE TABLE embeddings (chunk_id TEXT NOT NULL, project_id TEXT NOT NULL, dim INTEGER NOT NULL,
      vector BLOB NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (chunk_id, project_id));
    CREATE TABLE draft_history (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content TEXT NOT NULL,
      label TEXT, created_at TEXT NOT NULL);
    CREATE TABLE project_snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
      payload_json TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'auto', created_at TEXT NOT NULL);
    CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE research_jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', progress REAL NOT NULL DEFAULT 0, message TEXT,
      payload_json TEXT, result_json TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE chat_links (project_id TEXT NOT NULL, thread_id TEXT NOT NULL,
      PRIMARY KEY (project_id, thread_id));
    CREATE TABLE project_files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
      path TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'tex', content TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, path));
    CREATE TABLE chat_logs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, model TEXT,
      created_at TEXT NOT NULL);
  `);
  const old = "2024-01-02T03:04:05.000Z";
  db.run(
    "INSERT INTO projects (id,title,created_at,updated_at,target_venue,linked_thread_ids,revision_suggestions,model_attributions,abstract_variants,keyword_suggestions) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      "upgrade-demo-1",
      "Upgrade Demo Project",
      old,
      old,
      "generic",
      "[]",
      "[]",
      "[]",
      "[]",
      "[]",
    ]
  );
  db.run("INSERT INTO drafts (project_id,content,updated_at) VALUES (?,?,?)", [
    "upgrade-demo-1",
    "Legacy notebook draft: preserve me across upgrade.",
    old,
  ]);
  db.run("INSERT INTO bibliography (project_id,content,updated_at) VALUES (?,?,?)", [
    "upgrade-demo-1",
    "@article{legacy2024,title={Legacy bibliography marker}}",
    old,
  ]);
  db.run(
    "INSERT INTO papers (id,project_id,file_name,added_at,metadata_json,extracted_text,page_count) VALUES (?,?,?,?,?,?,?)",
    ["upgrade-paper-1", "upgrade-demo-1", "legacy.pdf", old, "{}", "legacy extracted text marker", 1]
  );
  db.run(
    "INSERT INTO project_files (id,project_id,path,kind,content,added_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    [
      "upgrade-file-1",
      "upgrade-demo-1",
      "main.tex",
      "tex",
      "\\documentclass{article}\n% legacy notebook project file marker\n",
      old,
      old,
    ]
  );
  db.run(
    "INSERT INTO corpus_chunks (id,project_id,paper_id,text,page_hint) VALUES (?,?,?,?,?)",
    ["upgrade-chunk-1", "upgrade-demo-1", "upgrade-paper-1", "legacy corpus chunk marker", 1]
  );
  db.run(
    "INSERT INTO chat_logs (id,project_id,thread_id,role,content,model,created_at) VALUES (?,?,?,?,?,?,?)",
    ["legacy-chat-1", "upgrade-demo-1", "legacy-thread-1", "user", "Legacy conversation marker: user", null, old]
  );
  db.run(
    "INSERT INTO chat_logs (id,project_id,thread_id,role,content,model,created_at) VALUES (?,?,?,?,?,?,?)",
    [
      "legacy-chat-2",
      "upgrade-demo-1",
      "legacy-thread-1",
      "assistant",
      "Legacy conversation marker: assistant",
      null,
      old,
    ]
  );
  db.run("INSERT INTO app_state (key,value) VALUES (?,?)", ["activeProjectId", "upgrade-demo-1"]);
  fs.writeFileSync(file, Buffer.from(db.export()));
  db.close();
}

const seedChats = [
  {
    id: "packaged-check-chat-1",
    title: "Packaged conversation marker",
    projectId: null,
    messages: [
      {
        id: "packaged-check-msg-1",
        role: "user",
        content: "packaged conversation marker user",
        timestamp: new Date(startedAtMs).toISOString(),
      },
      {
        id: "packaged-check-msg-2",
        role: "assistant",
        content: "packaged conversation marker assistant",
        timestamp: new Date(startedAtMs).toISOString(),
      },
    ],
    createdAt: new Date(startedAtMs).toISOString(),
    updatedAt: new Date(startedAtMs).toISOString(),
    taskIds: [],
    titleLocked: true,
  },
];

async function readChatMarker(session) {
  return session.evaluate(() => {
    try {
      const chats = JSON.parse(localStorage.getItem("openbentt-chats") ?? "[]");
      return {
        count: chats.length,
        ids: chats.map((c) => c.id),
        hasMarker: JSON.stringify(chats).includes("packaged conversation marker user"),
      };
    } catch (err) {
      return { error: String(err) };
    }
  });
}

/**
 * Init-script variant: seed before React hydrates so the chat context keeps
 * the conversation in memory and does not overwrite it with an empty array.
 */
const conversationSeedScript = {
  fn: ({ chats, currentId }) => {
    try {
      localStorage.setItem(
        "openbentt-onboarding-v1",
        JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
      );
      localStorage.setItem("openbentt-chats", JSON.stringify(chats));
      localStorage.setItem("openbentt-current-chat-id", currentId);
    } catch {
      /* storage unavailable */
    }
  },
  arg: { chats: seedChats, currentId: "packaged-check-chat-1" },
};

/** Fallback/diagnostic seed used only after a page is already live. */
async function seedConversation(session) {
  await session.evaluate(
    ({ chats, currentId }) => {
      try {
        if (!localStorage.getItem("openbentt-onboarding-v1")) {
          localStorage.setItem(
            "openbentt-onboarding-v1",
            JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
          );
        }
        localStorage.setItem("openbentt-chats", JSON.stringify(chats));
        localStorage.setItem("openbentt-current-chat-id", currentId);
      } catch {
        /* storage unavailable */
      }
    },
    { chats: seedChats, currentId: "packaged-check-chat-1" }
  );
  return readChatMarker(session);
}

async function callResearch(session, method, args = []) {
  return session.evaluate(
    async ({ method, args }) => {
      const api = window.openbenttResearch;
      if (!api || typeof api[method] !== "function") return { error: `missing bridge method ${method}` };
      try {
        return { ok: true, value: await api[method](...args) };
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
      }
    },
    { method, args }
  );
}

function markerSummary(summary, { afterInterruptedWrites = false } = {}) {
  const project = summary.projects?.find((p) => p.id === "upgrade-demo-1");
  const draft = summary.drafts?.find((d) => d.project_id === "upgrade-demo-1");
  const draftContent = String(draft?.content ?? "");
  const legacyDraft = draftContent.includes("Legacy notebook draft");
  const interruptedDraft = draftContent.includes("interrupted write");
  return {
    schema14: summary.schemaVersion === 14,
    upgradedDbProject: Boolean(project),
    legacyJsonProject: Boolean(summary.projects?.find((p) => p.id === "legacy-import-1")),
    // After the intentional SIGKILL, the draft may legitimately contain one of
    // the in-flight writes instead of the seeded legacy text.
    draftPreserved: afterInterruptedWrites ? legacyDraft || interruptedDraft : legacyDraft,
    paperPreserved: summary.papers?.some((p) => p.extracted_text === "legacy extracted text marker"),
    projectFilePreserved: summary.files?.some((f) =>
      String(f.content).includes("legacy notebook project file marker")
    ),
    chunkPreserved: summary.chunks?.some((c) => c.text === "legacy corpus chunk marker"),
    chatPreserved: summary.chatLogs?.some((c) => c.content === "Legacy conversation marker: user"),
    preMigrationSnapshot: summary.snapshots?.some((s) => s.reason === "pre-migration"),
  };
}

function allMarkers(summary, options = {}) {
  const m = markerSummary(summary, options);
  return Object.values(m).every(Boolean);
}

async function main() {
  const { rootReal } = validateIsolation();
  const workDir = fs.mkdtempSync(path.join(rootReal, "packaged-check-"));
  activeWorkDir = workDir;
  const run = {
    workDir,
    profile: process.env.OPENBENTT_PACKAGED_PROFILE
      ? path.resolve(process.env.OPENBENTT_PACKAGED_PROFILE)
      : path.join(workDir, "profile"),
    home: path.join(workDir, "home"),
    xdgConfig: path.join(workDir, "xdg-config"),
    xdgData: path.join(workDir, "xdg-data"),
    xdgCache: path.join(workDir, "xdg-cache"),
    xdgState: path.join(workDir, "xdg-state"),
    runtime: path.join(workDir, "runtime"),
    tmp: path.join(workDir, "tmp"),
    logsDir: path.join(workDir, "logs"),
    backupsDir: path.join(workDir, "backups"),
  };
  for (const dir of [
    run.profile,
    run.home,
    run.xdgConfig,
    run.xdgData,
    run.xdgCache,
    run.xdgState,
    run.runtime,
    run.tmp,
    run.logsDir,
    run.backupsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.chmodSync(run.runtime, 0o700);
  report.isolation.workDir = workDir;
  report.isolation.profile = run.profile;
  report.files.profiles.push(run.profile);
  report.files.logs.push(run.logsDir);
  addCheck(
    "isolated-profile",
    "pass",
    `profile=${run.profile}; HOME/XDG/TMPDIR redirected into ${workDir}; no real user data used`
  );

  let selected = null;
  try {
    const candidates = findCandidates();
    report.artifacts.candidates = candidates;
    selected = candidates[0] ?? null;
    if (!selected) {
      addCheck("artifact-found", "fail", "no AppImage/deb/unpacked build found in release/");
      return;
    }
    report.artifacts.selected = selected;
    addCheck(
      "artifact-found",
      "pass",
      `${selected.kind}: ${selected.path} (${Math.round(selected.size / 1024 ** 2)} MiB)`
    );
  } catch (err) {
    addCheck("artifact-found", "fail", String(err?.message ?? err));
    return;
  }

  // Static package inspection. Remove large extracted asar immediately after.
  const located = locateAsar(workDir, selected);
  const inspected = inspectPackage(located.asarPath, located.source);
  inspected.extractionNote = located.note ?? null;
  report.artifacts.static = inspected;
  const staticChecks = [
    ["package-native-deps", inspected.nativeDeps?.present, inspected.nativeDeps],
    ["package-sqljs-wasm", (inspected.sqlJsWasm?.bytes ?? 0) > 0, inspected.sqlJsWasm],
    ["package-pdfjs-resources", inspected.pdfjs?.present, inspected.pdfjs],
    ["csp-in-built-files", inspected.csp?.exactCanonicalTag, inspected.csp],
  ];
  for (const [id, ok, details] of staticChecks) addCheck(id, ok ? "pass" : "fail", details);
  if (located.asarPath && located.source?.startsWith("appimage") || located.source?.startsWith("deb")) {
    fs.rmSync(path.join(workDir, "static"), { recursive: true, force: true });
  }

  // Launch: try the selected artifact, then fall back to the unpacked sibling.
  const attemptLaunch = async (candidate) => {
    const attempts = [];
    // The debug-port placeholder is replaced inside launchSession().
    const argsFor = () => baseElectronArgs(0, run.profile);

    if (candidate.kind === "appimage") {
      try {
        const session = await launchSession(run, {
          label: "appimage-direct",
          cmd: candidate.path,
          args: ["--appimage-extract-and-run", ...argsFor(0)],
          cwd: workDir,
          initScript: conversationSeedScript,
        });
        return { session, mode: "appimage-direct", attempts };
      } catch (err) {
        attempts.push({ mode: "appimage-direct", error: String(err?.message ?? err).slice(0, 800) });
      }
      // Full extraction is opt-in: this host has no libfuse, and the extracted
      // AppImage V8 snapshot is invalid, so extraction cannot yield a faithful
      // run. It also costs ~1.8 GiB on a shared tmpfs. The unpacked packaged
      // build is used for runtime instead; the AppImage is still inspected.
      if (process.env.OPENBENTT_APPIMAGE_EXTRACT !== "1") {
        attempts.push({
          mode: "appimage-extracted",
          skipped:
            "full AppImage extraction disabled by default (no libfuse, invalid extracted V8 snapshot, shared /tmp quota); set OPENBENTT_APPIMAGE_EXTRACT=1 to force",
        });
      } else if (freeBytes(workDir) < 3.2 * 1024 ** 3) {
        attempts.push({
          mode: "appimage-extracted",
          skipped: `insufficient free space (${Math.round(freeBytes(workDir) / 1024 ** 3)} GiB)`,
        });
      } else {
        const extractDir = path.join(workDir, "appimage-extract");
        fs.mkdirSync(extractDir, { recursive: true });
        const res = runCmd(candidate.path, ["--appimage-extract"], { cwd: extractDir });
        const appDir = path.join(extractDir, "squashfs-root");
        if (res.status !== 0 || !fs.existsSync(path.join(appDir, "AppRun"))) {
          attempts.push({
            mode: "appimage-extracted",
            error: `extract failed: ${(res.stderr ?? "").slice(0, 400)}`,
          });
        } else {
          let repaired = false;
          const sibling = path.join(releaseDir, "linux-unpacked");
          try {
            for (const name of ["snapshot_blob.bin", "v8_context_snapshot.bin"]) {
              const inPackage = path.join(appDir, name);
              const source = path.join(sibling, name);
              if (
                (!fs.existsSync(inPackage) || fs.statSync(inPackage).size === 0) &&
                fs.existsSync(source) &&
                fs.statSync(source).size > 0
              ) {
                fs.copyFileSync(source, inPackage);
                repaired = true;
              }
            }
          } catch (err) {
            attempts.push({
              mode: "appimage-extracted",
              error: `snapshot repair failed: ${String(err?.message ?? err).slice(0, 300)}`,
            });
          }
          report.launch.snapshotRepair = repaired
            ? "V8 snapshot files were empty in the extracted AppImage; copied from release/linux-unpacked for this run (artifact itself not modified)"
            : null;
          try {
            if (attempts.at(-1)?.error?.startsWith("snapshot repair failed")) {
              throw new Error("cannot launch: snapshot repair failed");
            }
            const session = await launchSession(run, {
              label: "appimage-extracted",
              cmd: path.join(appDir, "AppRun"),
              args: argsFor(0),
              cwd: appDir,
              initScript: conversationSeedScript,
              env: {
                APPDIR: appDir,
                LD_LIBRARY_PATH: `${appDir}:${appDir}/usr/lib`,
              },
            });
            return { session, mode: "appimage-extracted", attempts };
          } catch (err) {
            attempts.push({
              mode: "appimage-extracted",
              error: String(err?.message ?? err).slice(0, 800),
            });
          }
        }
      }
    } else if (candidate.kind === "deb") {
      const available = freeBytes(workDir);
      if (available < 2.5 * 1024 ** 3) {
        attempts.push({
          mode: "deb-extracted",
          skipped: `insufficient free space (${Math.round(available / 1024 ** 3)} GiB)`,
        });
      } else {
        const debDir = path.join(workDir, "deb");
        fs.mkdirSync(debDir, { recursive: true });
        const ar = runCmd("ar", ["x", candidate.path], { cwd: debDir });
        const dataTar = fs.readdirSync(debDir).find((f) => /^data\.tar/.test(f));
        if (ar.status !== 0 || !dataTar) {
          attempts.push({ mode: "deb-extracted", error: "failed to unpack deb members" });
        } else {
          const tar = runCmd("tar", ["-xf", path.join(debDir, dataTar), "-C", debDir], {
            timeout: 300000,
          });
          const match = runCmd("find", [debDir, "-maxdepth", "4", "-type", "f", "-name", "openbentt"], {
            timeout: 60000,
          });
          const binary = match.stdout.split("\n").find((p) => p.trim() && fs.statSync(p).mode & 0o111);
          if (tar.status !== 0 || !binary) {
            attempts.push({ mode: "deb-extracted", error: "failed to extract deb payload or find binary" });
          } else {
            const dir = path.dirname(binary);
            try {
              const session = await launchSession(run, {
                label: "deb-extracted",
                cmd: binary,
                args: argsFor(0),
                cwd: dir,
                initScript: conversationSeedScript,
                env: { LD_LIBRARY_PATH: `${dir}:${dir}/usr/lib` },
              });
              return { session, mode: "deb-extracted", attempts };
            } catch (err) {
              attempts.push({ mode: "deb-extracted", error: String(err?.message ?? err).slice(0, 800) });
            }
          }
        }
      }
    } else {
      try {
        const session = await launchSession(run, {
          label: "unpacked-sibling",
          cmd: candidate.path,
          args: argsFor(0),
          cwd: path.dirname(candidate.path),
          initScript: conversationSeedScript,
        });
        return { session, mode: "unpacked-sibling", attempts };
      } catch (err) {
        attempts.push({ mode: "unpacked-sibling", error: String(err?.message ?? err).slice(0, 800) });
      }
    }
    return { session: null, mode: null, attempts };
  };

  let launched = await attemptLaunch(selected);
  report.launch.attempts.push(...launched.attempts);
  if (!launched.session && !process.env.OPENBENTT_PACKAGED_BINARY) {
    const fallback = report.artifacts.candidates.find(
      (c) => c.kind === "unpacked" && c.path !== selected.path
    );
    if (fallback) {
      report.launch.fallbackTo = fallback.path;
      launched = await attemptLaunch(fallback);
      report.launch.attempts.push(...launched.attempts);
    }
  }
  if (!launched.session) {
    addCheck("packaged-first-start", "fail", `all launch attempts failed: ${JSON.stringify(report.launch.attempts)}`);
    return;
  }
  report.launch.mode = launched.mode;
  report.launch.runtimeBinary = launched.session.cmd;
  report.launch.note =
    launched.mode === "unpacked-sibling"
      ? "AppImage/deb was located and statically inspected; runtime used the packaged linux-unpacked companion because the AppImage cannot start here (no libfuse / empty V8 snapshots; see launch attempts)."
      : null;

  const clean = launched.session;
  report.phases.cleanInstall = sessionSummary(clean);
  const cleanDbPath = path.join(run.profile, "research-projects", "research.db");
  const cleanInit = await callResearch(clean, "init");
  const cleanChat = await readChatMarker(clean);
  report.phases.cleanInstall.conversationSeeded = cleanChat;
  const liveClean = clean.alive();
  const cleanInitOk = cleanInit.ok && cleanInit.value?.schemaVersion === 14 && !cleanInit.value?.persistenceError;
  const cleanPass =
    cleanInitOk &&
    liveClean &&
    cleanChat.hasMarker &&
    clean.state?.url?.startsWith("app://") &&
    clean.state?.bridges?.includes("openbenttResearch") &&
    !hasRealPageError(clean.events) &&
    clean.events.every((e) => e.kind !== "page-crash");
  addCheck("clean-install-first-start", cleanPass ? "pass" : "fail", {
    state: clean.state,
    init: cleanInit,
    conversation: cleanChat,
    processAlive: liveClean,
    events: clean.events,
  });
  addCheck(
    "runtime-csp",
    clean.state?.cspMeta && clean.state.cspMeta === inspected.csp?.expectedTag?.match(/content="([^"]+)"/)?.[1]
      ? "pass"
      : "fail",
    { domCsp: clean.state?.cspMeta, expected: inspected.csp?.expectedTag }
  );

  const cleanExit = await clean.stop("SIGTERM");
  report.phases.cleanInstall.exit = cleanExit;
  report.phases.cleanInstall.logTail = clean.logTail;
  addCheck(
    "graceful-shutdown",
    cleanExit?.code === 0 && !hasFatalLog(clean.logTail) ? "pass" : "fail",
    { exit: cleanExit, fatalInLog: hasFatalLog(clean.logTail) }
  );

  // Backup before any migration test, then seed a synthetic v5 profile.
  const backupBeforeUpgrade = path.join(run.backupsDir, "before-upgrade");
  fs.cpSync(run.profile, backupBeforeUpgrade, { recursive: true });
  report.files.backups.push({ path: backupBeforeUpgrade, ...dirStats(backupBeforeUpgrade) });
  addCheck("backup-before-migration", "pass", {
    path: backupBeforeUpgrade,
    ...dirStats(backupBeforeUpgrade),
  });

  writeLegacyDb(cleanDbPath);
  fs.rmSync(`${cleanDbPath}.bak`, { force: true });
  const legacyDir = path.join(run.profile, "research-projects", "legacy-upgrade");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(
    path.join(legacyDir, "project.json"),
    JSON.stringify(
      {
        id: "legacy-import-1",
        title: "Legacy JSON Project",
        createdAt: "2024-01-02T03:04:05.000Z",
        updatedAt: "2024-01-02T03:04:05.000Z",
        targetVenue: "generic",
        linkedThreadIds: [],
        draftTex: "Legacy JSON notebook draft marker",
        bibliography: "",
        papers: [],
        chunks: [],
        revisionSuggestions: [],
        modelAttributions: [],
        abstractVariants: [],
        keywordSuggestions: [],
      },
      null,
      2
    )
  );
  const seededSummary = dbSummary(cleanDbPath);
  report.phases.seededOldProfile = {
    dbPath: cleanDbPath,
    summary: seededSummary,
    legacyJson: path.join(legacyDir, "project.json"),
    note: "Synthetic v5 database + legacy project.json; no real user data was copied.",
  };
  addCheck(
    "old-profile-seeded",
    seededSummary.valid && seededSummary.schemaVersion === 5 ? "pass" : "fail",
    { schemaVersion: seededSummary.schemaVersion, valid: seededSummary.valid }
  );

  let upgrade;
  try {
    upgrade = await launchSession(run, {
      label: "upgrade",
      cmd: launched.session.cmd,
      args: baseElectronArgs(0, run.profile),
      cwd: launched.session.cwd,
      env: launched.session.env,
    });
  } catch (err) {
    addCheck("upgrade-migration", "fail", String(err?.message ?? err));
    return;
  }
  report.phases.upgrade = sessionSummary(upgrade);
  const upgradeInit = await callResearch(upgrade, "init");
  const upgradeProjects = await callResearch(upgrade, "listProjects");
  const upgradeLoaded = await callResearch(upgrade, "loadProject", ["upgrade-demo-1"]);
  const upgradeLogs = await callResearch(upgrade, "listChatLogs", ["upgrade-demo-1", { limit: 50 }]);
  const upgradeChat = await readChatMarker(upgrade);
  report.phases.upgrade.ipc = {
    init: upgradeInit,
    projects: upgradeProjects,
    loaded: upgradeLoaded,
    chatLogs: upgradeLogs,
    localStorage: upgradeChat,
  };
  const ipcMarkers = {
    schema14: upgradeInit.value?.schemaVersion === 14,
    // The packaged build imports legacy project.json during startup, before the
    // explicit init call, so the reported count is often 0 here. Verify the
    // observable outcome: the project exists and the source file was consumed.
    migratedLegacyJson:
      upgradeProjects.value?.some((p) => p.id === "legacy-import-1") &&
      (upgradeInit.value?.migrated >= 1 ||
        !fs.existsSync(path.join(run.profile, "research-projects", "legacy-upgrade", "project.json"))),
    noPersistenceError: !upgradeInit.value?.persistenceError,
    projectPreserved: upgradeProjects.value?.some((p) => p.id === "upgrade-demo-1"),
    legacyProjectImported: upgradeProjects.value?.some((p) => p.id === "legacy-import-1"),
    draftPreserved: String(upgradeLoaded.value?.draftTex ?? "").includes("Legacy notebook draft"),
    paperPreserved: upgradeLoaded.value?.papers?.some((p) => p.extractedText === "legacy extracted text marker"),
    projectFilePreserved: upgradeLoaded.value?.projectFiles?.some((f) =>
      String(f.content).includes("legacy notebook project file marker")
    ),
    chatPreserved: upgradeLogs.value?.some((l) => l.content === "Legacy conversation marker: user"),
    localStorageConversationPreserved: upgradeChat.hasMarker,
    appAlive: upgrade.alive(),
    noPageCrash: upgrade.events.every((e) => e.kind !== "page-crash"),
  };
  addCheck("upgrade-migration", Object.values(ipcMarkers).every(Boolean) ? "pass" : "fail", ipcMarkers);

  // Interrupted persistence: fire writes, kill -9 before a graceful flush.
  await upgrade.evaluate(() => {
    const api = window.openbenttResearch;
    if (!api) return;
    for (let i = 0; i < 5; i += 1) {
      void api.patchDraft("upgrade-demo-1", `interrupted write ${i} ${"x".repeat(4096)}`).catch(() => {});
    }
  });
  await sleep(50);
  const killed = await upgrade.stop("SIGKILL");
  report.phases.upgrade.exitAfterKill = killed;
  report.phases.upgrade.logTail = upgrade.logTail;
  addCheck(
    "abnormal-termination",
    killed?.signal === "SIGKILL" ? "pass" : "fail",
    { exit: killed, note: "SIGKILL issued immediately after fire-and-forget draft writes" }
  );

  // Reopen after abnormal termination.
  let reopened;
  try {
    reopened = await launchSession(run, {
      label: "reopen-after-crash",
      cmd: launched.session.cmd,
      args: baseElectronArgs(0, run.profile),
      cwd: launched.session.cwd,
      env: launched.session.env,
    });
  } catch (err) {
    addCheck("reopen-after-crash", "fail", String(err?.message ?? err));
    return;
  }
  report.phases.reopenAfterCrash = sessionSummary(reopened);
  const reopenInit = await callResearch(reopened, "init");
  const reopenProjects = await callResearch(reopened, "listProjects");
  const reopenChat = await readChatMarker(reopened);
  const reopenedDb = dbSummary(cleanDbPath);
  report.phases.reopenAfterCrash.db = reopenedDb;
  report.phases.reopenAfterCrash.ipc = { init: reopenInit, projects: reopenProjects, localStorage: reopenChat };
  addCheck(
    "reopen-after-crash",
    reopenedDb.valid &&
      allMarkers(reopenedDb, { afterInterruptedWrites: true }) &&
      reopenInit.value?.schemaVersion === 14 &&
      !reopenInit.value?.persistenceError &&
      reopened.alive() &&
      reopenChat.hasMarker
      ? "pass"
      : "fail",
    {
      db: markerSummary(reopenedDb, { afterInterruptedWrites: true }),
      init: reopenInit,
      localStorage: reopenChat,
      processAlive: reopened.alive(),
      pageEvents: reopened.events,
    }
  );
  const reopenExit = await reopened.stop("SIGTERM");
  report.phases.reopenAfterCrash.exit = reopenExit;
  report.phases.reopenAfterCrash.logTail = reopened.logTail;

  // Corrupt on-disk DB recovery from the app's backup (isolated profile only).
  const backupBeforeCorruption = path.join(run.backupsDir, "before-corruption");
  fs.cpSync(run.profile, backupBeforeCorruption, { recursive: true });
  report.files.backups.push({ path: backupBeforeCorruption, ...dirStats(backupBeforeCorruption) });
  fs.copyFileSync(cleanDbPath, `${cleanDbPath}.bak`);
  fs.writeFileSync(cleanDbPath, Buffer.from("NOT-A-SQLITE-DATABASE\n".repeat(20)));
  const corruptedSummary = dbSummary(cleanDbPath);
  addCheck("corrupt-db-injected", !corruptedSummary.valid ? "pass" : "fail", {
    path: cleanDbPath,
    summary: corruptedSummary,
    backup: backupBeforeCorruption,
  });

  let recovered;
  try {
    recovered = await launchSession(run, {
      label: "recovery-from-backup",
      cmd: launched.session.cmd,
      args: baseElectronArgs(0, run.profile),
      cwd: launched.session.cwd,
      env: launched.session.env,
    });
  } catch (err) {
    addCheck("corrupt-db-recovery", "fail", String(err?.message ?? err));
    return;
  }
  report.phases.recoveryFromBackup = sessionSummary(recovered);
  const recoveryInit = await callResearch(recovered, "init");
  const recoveryDb = dbSummary(cleanDbPath);
  report.phases.recoveryFromBackup.db = recoveryDb;
  report.phases.recoveryFromBackup.ipc = { init: recoveryInit };
  addCheck(
    "corrupt-db-recovery",
    recoveryDb.valid &&
      allMarkers(recoveryDb, { afterInterruptedWrites: true }) &&
      recoveryInit.value?.schemaVersion === 14 &&
      !recoveryInit.value?.persistenceError &&
      recovered.alive()
      ? "pass"
      : "fail",
    {
      db: markerSummary(recoveryDb, { afterInterruptedWrites: true }),
      init: recoveryInit,
      processAlive: recovered.alive(),
      pageEvents: recovered.events,
      note: "openDb() restored research.db from research.db.bak",
    }
  );
  const recoveryExit = await recovered.stop("SIGTERM");
  report.phases.recoveryFromBackup.exit = recoveryExit;
  report.phases.recoveryFromBackup.logTail = recovered.logTail;
  addCheck(
    "graceful-shutdown-after-recovery",
    recoveryExit?.code === 0 && !hasFatalLog(recovered.logTail) ? "pass" : "fail",
    { exit: recoveryExit, fatalInLog: hasFatalLog(recovered.logTail) }
  );

  addCheck(
    "app-process-stayed-alive-during-checks",
    report.phases.cleanInstall.events.every((e) => e.kind !== "page-crash") &&
      report.phases.upgrade.events.every((e) => e.kind !== "page-crash") &&
      report.phases.reopenAfterCrash.events.every((e) => e.kind !== "page-crash") &&
      report.phases.recoveryFromBackup.events.every((e) => e.kind !== "page-crash")
      ? "pass"
      : "fail",
    {
      phases: ["cleanInstall", "upgrade", "reopenAfterCrash", "recoveryFromBackup"],
      note: "No renderer crash observed; the one SIGKILL was intentional.",
    }
  );
  addCheck(
    "logs-collected",
    report.files.logs.length > 0 && report.phases.cleanInstall.logFile ? "pass" : "fail",
    {
      logs: report.files.logs,
      perPhase: Object.fromEntries(
        Object.entries(report.phases)
          .filter(([, v]) => v && typeof v === "object" && v.logFile)
          .map(([k, v]) => [k, v.logFile])
      ),
    }
  );
}

try {
  await main();
} catch (err) {
  addCheck("harness-fatal", "fail", String(err?.stack ?? err).slice(0, 2000));
} finally {
  // Quota on /tmp is shared with other work. Release the large extracted
  // package payloads (never profiles/logs/backups) before writing the report.
  if (activeWorkDir) {
    report.cleanup = {};
    for (const name of ["static", "appimage-extract", "snapshot-probe", "deb"]) {
      const dir = path.join(activeWorkDir, name);
      if (!fs.existsSync(dir)) continue;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        report.cleanup[name] = "removed";
      } catch (err) {
        report.cleanup[name] = `cleanup failed: ${String(err?.message ?? err).slice(0, 200)}`;
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  for (const c of report.checks) {
    if (c.status === "pass") report.summary.passed += 1;
    else if (c.status === "fail") report.summary.failed += 1;
    else if (c.status === "warn") report.summary.warned += 1;
    else report.summary.skipped += 1;
  }
  report.summary.ok = report.summary.failed === 0 && report.summary.passed > 0;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  } catch (err) {
    // Last resort under a shared /tmp quota: keep the verdict and check list.
    const compact = {
      summary: report.summary,
      checks: report.checks,
      artifacts: { selected: report.artifacts.selected, static: report.artifacts.static },
      launch: report.launch,
      writeError: String(err?.message ?? err),
      outputWasTruncated: true,
    };
    fs.writeFileSync(output, `${JSON.stringify(compact, null, 2)}\n`);
  }
  log(`report: ${output}`);
  log(
    `summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warned} warned, ${report.summary.skipped} skipped`
  );
}
process.exitCode = report.summary.ok ? 0 : 1;
