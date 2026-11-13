/**
 * Accepted check errors: the creator's override for a check that is wrong in this case ("759 is not in the plan, but
 * it is 23 × 33, correct"). One file per workspace, `accepted.json`: { "<scope>": [{ text, at }] }.
 *
 * Checks keep writing their raw errors; readers apply the overrides, so accepting (or undoing) takes effect without
 * re-running the check. Matching is on the exact error text: if the check later says something different (another
 * number, another length), it is a new error and blocks again until accepted.
 *
 * Scopes: "script" (a short's script checks, file in the short's workspace), "meta" and "thumb:A|B|C" (publish).
 */
import fs from "node:fs";
import path from "node:path";

export interface Checks { errors: string[]; warnings: string[]; accepted?: string[] }
type Store = Record<string, { text: string; at: string }[]>;

export const ACCEPTED_FILE = "accepted.json";
export const ACCEPT_SCOPE = /^(script|meta|thumb:[ABC])$/;

export function readAccepted(dir: string): Store {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, ACCEPTED_FILE), "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

/** Accept (on = true) or un-accept one error text in a scope. */
export function setAccepted(dir: string, scope: string, text: string, on: boolean): void {
  if (!ACCEPT_SCOPE.test(scope)) throw new Error(`unknown check scope: ${scope}`);
  const s = readAccepted(dir), list = (s[scope] ?? []).filter((x) => x.text !== text);
  if (on) list.push({ text, at: new Date().toISOString() });
  if (list.length) s[scope] = list; else delete s[scope];
  fs.writeFileSync(path.join(dir, ACCEPTED_FILE), JSON.stringify(s, null, 2), "utf-8");
}

/** The checks as the creator sees them: accepted errors move from `errors` to `accepted` and no longer block. */
export function applyAccepted<T extends Checks>(dir: string, scope: string, c: T): T & { accepted: string[] };
export function applyAccepted<T extends Checks>(dir: string, scope: string, c: T | null | undefined): (T & { accepted: string[] }) | null;
export function applyAccepted<T extends Checks>(dir: string, scope: string, c: T | null | undefined): (T & { accepted: string[] }) | null {
  if (!c) return null;
  const ok = new Set((readAccepted(dir)[scope] ?? []).map((x) => x.text));
  const raw = [...c.errors, ...(c.accepted ?? [])];   // tolerate checks that were already applied once
  return { ...c, errors: raw.filter((e) => !ok.has(e)), accepted: raw.filter((e) => ok.has(e)) };
}
