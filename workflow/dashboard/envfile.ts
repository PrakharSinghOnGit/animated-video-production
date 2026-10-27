/**
 * Line-based .env reader/writer for the Settings page. Keeps comments, blank lines and key order exactly as they are;
 * only the lines of edited keys change. Writes are atomic (temp file + rename).
 */
import fs from "node:fs";
import path from "node:path";

export interface EnvLine { raw: string; key?: string; value?: string; prefix?: string; quoted?: boolean }

const ENTRY = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function unquote(v: string): { value: string; quoted: boolean } {
  const t = v.trim();
  const q = t[0];
  if ((q === '"' || q === "'") && t.length >= 2) {
    const end = t.lastIndexOf(q);
    if (end > 0) {
      const inner = t.slice(1, end);
      return { value: q === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner, quoted: true };
    }
  }
  return { value: t.replace(/\s+#.*$/, ""), quoted: false };
}

export function parseEnv(text: string): EnvLine[] {
  return text.split("\n").map((raw) => {
    const m = raw.match(ENTRY);
    if (!m) return { raw };
    const { value, quoted } = unquote(m[3]);
    return { raw, key: m[2], value, prefix: m[1], quoted };
  });
}

export const serializeEnv = (lines: EnvLine[]) => lines.map((l) => l.raw).join("\n");

function format(value: string, forceQuote: boolean): string {
  if (/[\r\n\0]/.test(value)) throw new Error("value cannot contain a newline");
  return forceQuote || /[\s#"'\\]/.test(value) || value === "" ? `"${value.replace(/(["\\])/g, "\\$1")}"` : value;
}

/** Set a key: replaces its line in place, or appends a new line. Returns new lines. */
export function setEnv(lines: EnvLine[], key: string, value: string): EnvLine[] {
  if (!KEY_RE.test(key)) throw new Error(`bad key: ${key}`);
  const out = lines.slice();
  const i = out.findIndex((l) => l.key === key);
  if (i >= 0) {
    const old = out[i], v = format(value, !!old.quoted);
    out[i] = { raw: `${old.prefix ?? ""}${key}=${v}`, key, value, prefix: old.prefix, quoted: old.quoted };
    return out;
  }
  const v = format(value, false);
  const entry = { raw: `${key}=${v}`, key, value, prefix: "" };
  // keep the final newline at the very end of the file
  if (out.length && out[out.length - 1].raw === "") out.splice(out.length - 1, 0, entry);
  else out.push(entry);
  return out;
}

export const removeEnv = (lines: EnvLine[], key: string): EnvLine[] => lines.filter((l) => l.key !== key);

/** The comment block directly above an entry (what the file says about the key). */
export function helpFor(lines: EnvLine[], index: number): string {
  const out: string[] = [];
  for (let i = index - 1; i >= 0 && /^\s*#/.test(lines[i].raw); i--) out.unshift(lines[i].raw.replace(/^\s*#\s?/, ""));
  return out.join("\n").trim();
}

export function atomicWrite(file: string, text: string) {
  let mode = 0o600;
  try { mode = fs.statSync(file).mode & 0o777; } catch { /* new file */ }
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, file);
}
