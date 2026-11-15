/**
 * Keep the Mac awake while long work runs, so a render, an act batch or a paid agent run isn't paused by sleep
 * (a paused agent session can time out and be paid for twice; a paused render just loses the night).
 *
 * macOS `caffeinate` holds the assertion: -i idle sleep, -m disk sleep, -s system sleep while on power. The display
 * may still turn off (that does not slow anything). It cannot stop sleep when the lid is closed on battery.
 *
 *   keepAwake()        for a CLI script: awake until this process exits (caffeinate -w <pid> watches it)
 *   awakeWhile(busy)   for the dashboard: awake while busy() is true, re-checked by the caller with sync()
 *
 * Set WG_NO_CAFFEINATE=1 to turn it off. No-op off macOS. No side effects at import.
 */
import type { Subprocess } from "bun";

const FLAGS = ["-ims"];
const off = () => process.platform !== "darwin" || process.env.WG_NO_CAFFEINATE === "1";

function spawn(pid: number): Subprocess | null {
  try { return Bun.spawn(["caffeinate", ...FLAGS, "-w", String(pid)], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }); }
  catch { return null; }
}

let mine: Subprocess | null = null;
/** Hold the Mac awake until this process exits. Safe to call more than once. */
export function keepAwake(): void {
  if (off() || mine) return;
  mine = spawn(process.pid);
  mine?.unref();
}

/** A switch the dashboard flips from its job list: on while any job runs, off when the last one ends. */
export function awakeWhile(busy: () => boolean): { sync: () => void; active: () => boolean } {
  let proc: Subprocess | null = null;
  const sync = () => {
    if (off()) return;
    const want = busy();
    if (want && (!proc || proc.exitCode !== null || proc.killed)) {
      // -w on the dashboard's own pid: if the server dies, caffeinate exits with it
      proc = spawn(process.pid);
      proc?.unref();
    } else if (!want && proc) {
      try { proc.kill(); } catch {}
      proc = null;
    }
  };
  return { sync, active: () => !!proc && proc.exitCode === null && !proc.killed };
}
