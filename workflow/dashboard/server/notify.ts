/** Job-end notifications: a macOS banner and a phone push through ntfy.sh, each switched in Settings → Notifications. */
import type { Job } from "./jobs";
import { readEnvLines } from "./settings";

/** Notification switches, read from .env each time (Settings → Notifications edits it), falling back to the process env. */
export function notifyCfg() {
  const env = new Map(readEnvLines().map((l) => [l.key, l.value ?? ""]));
  const get = (k: string) => env.get(k) ?? process.env[k] ?? "";
  const topic = get("NTFY_TOPIC");
  return { macAvailable: process.platform === "darwin", mac: process.platform === "darwin" && get("MAC_NOTIFY") !== "0", phone: !!topic && get("PHONE_NOTIFY") !== "0", topic };
}

/** Send to the enabled channels (or only `only`). Best effort, never throws. */
export function notify(title: string, body: string, ok: boolean, icon: string, only?: "mac" | "phone") {
  const c = notifyCfg();
  if (c.mac && only !== "phone") {
    // title/body go in as argv, so no AppleScript quoting is needed
    try {
      Bun.spawn(["osascript", "-e", "on run argv", "-e", `display notification (item 2 of argv) with title (item 1 of argv) sound name "${ok ? "Glass" : "Basso"}"`, "-e", "end run", title, body],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    } catch {}
  }
  if (c.phone && only !== "mac") fetch(`https://ntfy.sh/${encodeURIComponent(c.topic)}`, { method: "POST", headers: { Title: title, Tags: icon }, body }).catch(() => {});
}

/** When a job ends: a macOS notification and a phone one through ntfy.sh, each if switched on. */
export function notifyEnd(j: Job) {
  const min = Math.round(((j.endedAt ?? Date.now()) - j.startedAt) / 60000);
  const icon = j.status === "done" ? "white_check_mark" : j.status === "stopped" ? "stop_sign" : "x";
  notify(`${j.ws}: ${j.label} ${j.status}`, `${j.step} ${j.status} after ${min} min${j.status === "failed" ? ` (exit ${j.exitCode})` : ""}`, j.status === "done", icon);
}
