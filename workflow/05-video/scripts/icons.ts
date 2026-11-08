/**
 * Find icons and company logos for acts (spy.logo / draft.logo). Brand logos: Simple Icons (CC0); generic icons:
 * Material Design Icons (Apache-2.0, names start with "mdi:").
 *
 * Usage: bun run icons <words...>            search names/titles (every word must match)
 *        bun run icons --check <name...>     exit 1 if any name is missing (e.g. tesla mdi:bank)
 *        bun run icons --brand|--mdi <words> search one set only
 */
import { findIcons, hasIcon, type IconSet } from "../../../packages/kit/src/paper/icons";

const args = process.argv.slice(2);
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log("bun run icons <words...> | --check <name...> | --brand|--mdi <words...>\nExamples: bun run icons bank   bun run icons hdfc   bun run icons --mdi piggy");
  process.exit(0);
}
if (args[0] === "--check") {
  let ok = true;
  for (const n of args.slice(1)) {
    const has = hasIcon(n); ok &&= has;
    console.log(`${has ? "✓" : "✗"} ${n}${has ? "" : `  (close: ${findIcons(n.replace(/^mdi:/, "").replace(/-/g, " "), 5).map((r) => r.name).join(", ") || "none"}; no logo → use a wordmark)`}`);
  }
  process.exit(ok ? 0 : 1);
}
const set: IconSet | undefined = args.includes("--brand") ? "brand" : args.includes("--mdi") ? "mdi" : undefined;
const q = args.filter((a) => !a.startsWith("--")).join(" ");
const hits = findIcons(q, 40, set);
if (!hits.length) { console.log(`no icon matches "${q}". A missing company logo → draw its name as type instead (never a made-up logo).`); process.exit(1); }
const pad = Math.max(...hits.map((h) => h.name.length));
for (const h of hits) console.log(`${h.name.padEnd(pad)}  ${h.set === "brand" ? "logo" : "icon"}  ${h.title}${h.hex ? `  ${h.hex}` : ""}`);
