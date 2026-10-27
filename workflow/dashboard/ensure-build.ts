/** Builds workflow/dashboard/web when dist is missing or older than its sources. Used by `bun run dashboard`. */
import fs from "node:fs";
import path from "node:path";

const WEB = path.join(import.meta.dir, "web");
const dist = path.join(WEB, "dist/index.html");

function newest(p: string): number {
  let t = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const f = path.join(p, e.name);
    t = Math.max(t, e.isDirectory() ? newest(f) : fs.statSync(f).mtimeMs);
  }
  return t;
}

const built = fs.existsSync(dist) ? fs.statSync(dist).mtimeMs : 0;
if (!built || newest(WEB) > built) {
  console.log(built ? "dashboard UI is stale, rebuilding…" : "dashboard UI not built yet, building…");
  const r = Bun.spawnSync(["bun", "run", "build"], { cwd: WEB, stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
}
