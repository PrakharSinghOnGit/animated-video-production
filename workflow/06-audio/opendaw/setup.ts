/**
 * One-time setup of the local openDAW (the editor the dashboard's "openDAW" button opens).
 * Usage: bun run daw:setup [--force]
 *
 * Clones openDAW at a pinned commit into tools/opendaw (gitignored), runs `npm install`, drops the prebuilt wasm
 * engine from npm in place of the Rust build (so no Rust toolchain is needed), builds the workspace packages, and
 * applies workflow/06-audio/opendaw/opendaw.patch (auto-open `?bundle=`, "Export to video" via `?export=`).
 * Idempotent: a finished setup is detected through tools/opendaw/.wg-setup.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
export const OPENDAW_DIR = path.join(REPO_ROOT, "tools", "opendaw");
export const OPENDAW_REPO = "https://github.com/andremichelle/openDAW.git";
export const OPENDAW_COMMIT = "dde73478661dba89fd974b97e16fead359920d1d";
export const WASM_PKG = "@opendaw/studio-core-wasm@0.0.22";
const PATCH = path.join(import.meta.dir, "opendaw.patch");
const MARK = path.join(OPENDAW_DIR, ".wg-setup.json");

function run(cmd: string, args: string[], cwd: string) {
  console.log(`[daw:setup] $ ${cmd} ${args.join(" ")}   (in ${path.relative(REPO_ROOT, cwd) || "."})`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[daw:setup] ERROR: '${cmd} ${args.join(" ")}' failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function patchHash(): string {
  return fs.existsSync(PATCH) ? new Bun.CryptoHasher("sha1").update(fs.readFileSync(PATCH)).digest("hex") : "none";
}

/** True when tools/opendaw was set up from this commit and this patch (the dashboard uses it to enable the button). */
export function isSetUp(): boolean {
  try {
    const m = JSON.parse(fs.readFileSync(MARK, "utf8"));
    return m.commit === OPENDAW_COMMIT && m.patch === patchHash();
  } catch {
    return false;
  }
}

/** Maintainer helper: write the current edits in tools/opendaw (incl. new files) to opendaw.patch. */
function makePatch() {
  spawnSync("git", ["add", "-N", "packages"], { cwd: OPENDAW_DIR });
  const r = spawnSync("git", ["diff", "--no-color", "--", "packages", ":!packages/studio/scripting/src/test/Wealthgap*"], { cwd: OPENDAW_DIR, encoding: "utf8", maxBuffer: 1 << 26 });
  fs.writeFileSync(PATCH, r.stdout);
  console.log(`[daw:setup] wrote ${path.relative(REPO_ROOT, PATCH)} (${r.stdout.split("\n").length} lines)`);
}

/** Build every workspace package the studio and the bundle builder need, except the wasm one (already in place). */
function buildPackages() {
  run(
    "npx",
    ["turbo", "run", "build", "--filter=@opendaw/app-studio^...", "--filter=@opendaw/studio-scripting...", "--filter=!@opendaw/studio-core-wasm"],
    OPENDAW_DIR,
  );
}

function main() {
  if (process.argv.includes("--build-only")) return buildPackages();
  if (process.argv.includes("--make-patch")) return makePatch();
  const force = process.argv.includes("--force");
  if (!force && isSetUp()) {
    console.log(`[daw:setup] already set up in ${path.relative(REPO_ROOT, OPENDAW_DIR)} (use --force to redo)`);
    return;
  }
  const nodeV = spawnSync("node", ["-v"], { encoding: "utf8" });
  if (nodeV.status !== 0) {
    console.error("[daw:setup] ERROR: node is required (openDAW needs Node >= 23)");
    process.exit(1);
  }
  const nodeMajor = Number(nodeV.stdout.trim().replace("v", "").split(".")[0]);
  if (nodeMajor < 23) {
    console.error(`[daw:setup] ERROR: openDAW needs Node >= 23, found ${nodeV.stdout.trim()}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OPENDAW_DIR), { recursive: true });
  if (force && fs.existsSync(OPENDAW_DIR)) fs.rmSync(OPENDAW_DIR, { recursive: true, force: true });
  if (!fs.existsSync(path.join(OPENDAW_DIR, "package.json"))) {
    // only the pinned commit (GitHub serves a fetch by sha): a lot faster than the full history
    fs.mkdirSync(OPENDAW_DIR, { recursive: true });
    run("git", ["init", "-q"], OPENDAW_DIR);
    run("git", ["remote", "add", "origin", OPENDAW_REPO], OPENDAW_DIR);
    run("git", ["fetch", "--depth", "1", "origin", OPENDAW_COMMIT], OPENDAW_DIR);
  }
  run("git", ["checkout", "--force", OPENDAW_COMMIT], OPENDAW_DIR);
  run("git", ["reset", "--hard", OPENDAW_COMMIT], OPENDAW_DIR); // drop an earlier patch before re-applying
  if (fs.existsSync(PATCH) && fs.statSync(PATCH).size > 0) run("git", ["apply", "--whitespace=nowarn", PATCH], OPENDAW_DIR);
  else console.warn("[daw:setup] WARNING: no opendaw.patch: openDAW will not auto-open bundles or export to the video");

  run("npm", ["install", "--no-audit", "--no-fund"], OPENDAW_DIR);

  // The wasm engine normally needs a Rust toolchain; the npm package ships the same build prebuilt.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wg-opendaw-wasm-"));
  run("npm", ["pack", WASM_PKG, "--silent"], tmp);
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"))!;
  run("tar", ["-xzf", tgz], tmp);
  const dest = path.join(OPENDAW_DIR, "packages/studio/core-wasm/dist");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(tmp, "package/dist"), dest, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  buildPackages();

  // The bundle builder (WealthgapBundle.test.ts) runs inside the scripting package, where createFixture() lives.
  for (const f of ["WealthgapBundle.test.ts", "WealthgapVerify.test.ts"]) {
    fs.copyFileSync(path.join(import.meta.dir, f), path.join(OPENDAW_DIR, "packages/studio/scripting/src/test", f));
  }
  // vite writes public/build-info.json at start-up, after it has scanned public/: on a fresh clone the first start would not
  // serve it and the studio would stop at the loading spinner. Having the file before the first start avoids that.
  fs.writeFileSync(
    path.join(OPENDAW_DIR, "packages/app/studio/public/build-info.json"),
    JSON.stringify({ date: Date.now(), uuid: "00000000-0000-4000-8000-000000000000", env: "development" }),
  );
  fs.writeFileSync(MARK, JSON.stringify({ commit: OPENDAW_COMMIT, patch: patchHash(), at: new Date().toISOString() }));
  console.log("[daw:setup] done. Start it from the dashboard (openDAW button).");
}

if (import.meta.main) main();
