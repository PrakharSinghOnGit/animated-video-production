/**
 * Packages first: given a topic, five title + thumbnail concepts BEFORE the script is written, so a video is only made
 * when its packaging is strong (the click rate, not retention, is what holds the channel back: AUDIENCE.md).
 *
 *   bun run concepts --topic "Why groceries stay expensive" [--note "..."]   five concepts for a topic
 *   bun run concepts --idea I03                                              ... for an idea in the bank (uses its YouTube research when it has one)
 *   bun run concepts --list                                                  what exists
 *   bun run concepts --viewer I03                                            run only the blind viewer again on an existing set
 *   bun run concepts --pick I03 2 [--to VID07_Name]                          choose concept 2; with --to, write it into the project's
 *                                                                            02-scripting/idea.md ("## Chosen package"): the writer keeps its
 *                                                                            promise, and `bun run meta` later keeps one package faithful to it
 *
 * Two model calls (paid, about $0.1-0.2 together with the defaults):
 *   1. the packaging editor (role `concepts`): five concepts, five different bets (workflow/prompts/CONCEPTS.md)
 *   2. a blind viewer (role `stranger`, cheap): sees only the five packages in shuffled order, says which it would click
 *      and what it does not understand (workflow/prompts/CONCEPTS_VIEWER.md)
 * In code, not by a model: every concept is checked (title length and wording, 3 words on the thumbnail, no repeated
 * words, distinct levers and axes, and NO NUMBER that the creator's topic or note does not state: there are no sources
 * yet, so a figure can only be a {slot} with the claim to prove), and each title is linted (yt-package/title.py).
 *
 * Output: workspace/_ideas/concepts/<key>.json and .md (key = the idea id, or C01.. for a bare topic).
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming } from "../05-video/src/lib/timings";
import { AUDIENCE_FILE, IDEAS_DIR, REPO, readIdeas, type Idea } from "./lib";
import { copiedTitle, readRecipes, swipeExamples, swipeRow } from "./swipe";
import { AXES, AXIS_KEYS, BANNED, EMOJI, LEVERS, THUMB_MAX_WORDS, axisDistance, channelPackages, contentWords, numbersIn, readJson, readText, titleOverlap, usedThumbWords, wsDir, type Axes, type Lever } from "../07-publish/lib";

export const CONCEPTS_DIR = path.join(IDEAS_DIR, "concepts");
export const N_CONCEPTS = 5;
export interface Concept {
  title: string; lever: Lever; axes: Axes; thumbText: string; thumbnail: string;
  gap: string; opens: string; mustProve: string[]; kill: string; why: string;
  /** the proven structure(s) it adapts, from swipe/RECIPES.md (e.g. "number-hero + hidden-hand") */
  recipe?: string;
  /** yt-package/title.py on the title + thumbnail words (absent when python3 or the linter is missing) */
  lint?: { score: number; issues: [string, string][] };
  /** the blind viewer's answer */
  viewer?: { click: string; expect: string; confusing: string; feel: string; rank: number };
}
export interface ConceptSet {
  key: string; topic: string; note: string; at: string; model: string; viewerModel?: string; costUsd: number;
  stake: string; concepts: Concept[]; pick: number; verdict: { strong: boolean; note: string };
  viewerWhy?: string; warnings: string[];
  /** the creator's choice (1-based) and the project it was written into */
  chosen?: number; ws?: string;
}

const validAxes = (a: any): a is Axes => !!a && AXIS_KEYS.every((k) => (AXES[k] as readonly string[]).includes(a[k]));

/**
 * The checks a set of concepts must pass. `given` is the creator's own text (topic + note): the only place a figure may
 * come from before there are sources. A figure the concept wants but cannot source is written as a {slot}.
 */
export function checkConcepts(concepts: any[], given: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!Array.isArray(concepts) || concepts.length !== N_CONCEPTS) return { errors: [`the reply needs exactly ${N_CONCEPTS} concepts`], warnings };
  const allowed = new Set(numbersIn(given));
  concepts.forEach((c, i) => {
    const n = i + 1, title = String(c?.title ?? ""), tt = String(c?.thumbText ?? "");
    if (!title.trim()) { errors.push(`${n}: no title`); return; }
    if (title.length > 70) errors.push(`${n}: title is ${title.length} characters (30-60)`);
    else if (title.length > 60 || title.length < 25) warnings.push(`${n}: title is ${title.length} characters (aim 30-60)`);
    const bad = title.match(BANNED);
    if (bad) errors.push(`${n}: get-rich wording "${bad[0]}" in the title`);
    if (EMOJI.test(title)) errors.push(`${n}: emoji in the title`);
    if (/\bexplained\b|^the art of\b|!!/i.test(title)) errors.push(`${n}: "${title.match(/\bexplained\b|^the art of\b|!!/i)![0]}" is a label, not a promise`);
    if (!LEVERS.includes(c.lever)) errors.push(`${n}: lever must be one of ${LEVERS.join(", ")}`);
    if (!validAxes(c.axes)) errors.push(`${n}: axes must be ${AXIS_KEYS.map((k) => `${k}: ${AXES[k].join("|")}`).join("; ")}`);
    else if (c.axes.text !== (!tt.trim() ? "none" : /\d|\{/.test(tt) ? "number" : "word")) errors.push(`${n}: the text axis says "${c.axes.text}" but thumbText is ${tt.trim() ? `"${tt}"` : "empty"}`);
    const words = tt.trim().split(/\s+/).filter(Boolean);
    if (words.length > THUMB_MAX_WORDS) errors.push(`${n}: ${words.length} words on the thumbnail (max ${THUMB_MAX_WORDS})`);
    const tw = new Set(contentWords(title)), cw = contentWords(tt);
    if (cw.length && cw.every((w) => tw.has(w))) errors.push(`${n}: the thumbnail words ("${tt}") repeat the title`);
    // no sources yet: a figure is only allowed when the creator stated it; years are figures too
    const invented = numbersIn(`${title} ${tt}`.replace(/\{[^}]*\}/g, " ")).filter((v) => !allowed.has(v));
    if (invented.length) errors.push(`${n}: the figure ${invented.join(", ")} is not in the creator's topic or note; there are no sources yet, so write it as a {slot} and put the claim in mustProve, or drop it`);
    if (/\{[^}]*\}/.test(`${title} ${tt}`) && !(Array.isArray(c.mustProve) && c.mustProve.length)) errors.push(`${n}: a {slot} needs the claim that fills it in mustProve`);
    if (!Array.isArray(c.mustProve) || !c.mustProve.length) errors.push(`${n}: mustProve is empty (the claims the script must source)`);
    if (!String(c.kill ?? "").trim()) warnings.push(`${n}: no kill condition`);
    // borrow the structure of a proven package, never its words
    const copied = copiedTitle(title.replace(/[{}]/g, ""));
    if (copied) errors.push(`${n}: the title copies an outlier's words ("${copied}"): keep the structure, write it in this video's own words`);
  });
  const levers = new Set(concepts.map((c) => c?.lever).filter((l) => LEVERS.includes(l)));
  if (levers.size < 4) errors.push(`the five concepts use ${levers.size} different levers (${[...levers].join(", ")}): at least 4, or they are one bet repeated`);
  const subjects = new Set(concepts.filter((c) => validAxes(c?.axes)).map((c) => c.axes.subject));
  if (subjects.size < 3) errors.push(`the five thumbnails use ${subjects.size} different subjects: at least 3`);
  for (let i = 0; i < concepts.length; i++) for (let j = i + 1; j < concepts.length; j++) {
    const a = concepts[i], b = concepts[j], pair = `${i + 1} and ${j + 1}`;
    if (validAxes(a?.axes) && validAxes(b?.axes) && axisDistance(a.axes, b.axes) === 0) errors.push(`${pair}: identical axes: the same picture twice`);
    const o = titleOverlap(String(a?.title ?? ""), String(b?.title ?? ""));
    if (o >= 0.6) errors.push(`${pair}: the titles share ${Math.round(o * 100)}% of their words: one sentence reworded`);
    const ta = String(a?.thumbText ?? "").trim().toLowerCase(), tb = String(b?.thumbText ?? "").trim().toLowerCase();
    if (ta && ta === tb) errors.push(`${pair}: the same words on both thumbnails ("${a.thumbText}")`);
  }
  return { errors, warnings };
}

/** The proven-packages evidence for the editor: the recipes, the outliers closest to the topic, the strongest faceless ones. */
export function swipeSection(topic: string): string {
  const recipes = readRecipes();
  if (!recipes) return "";
  const { related, faceless } = swipeExamples(topic);
  const head = "| title | reach | thumbnail (archetype, layout, devices) | words on it | the reusable idea |\n|---|---|---|---|---|";
  return `
# Proven packages (swipe file)
${recipes.replace(/^# .*\n/, "")}
## Outliers closest to this topic
${related.length ? `${head}\n${related.map(swipeRow).join("\n")}` : "(none share words with the topic)"}

## The strongest faceless outliers
${head}
${faceless.map(swipeRow).join("\n")}
`;
}

export function conceptsMarkdown(s: ConceptSet): string {
  const row = (c: Concept, i: number) => `## ${i + 1}. ${c.title}${s.chosen === i + 1 ? "  ← chosen" : ""}
- Lever: **${c.lever}**${c.recipe ? ` · recipe: ${c.recipe}` : ""} · thumbnail: ${AXIS_KEYS.map((k) => c.axes[k]).join(", ")}${c.lint ? ` · title check ${c.lint.score}/100` : ""}
- Thumbnail: ${c.thumbnail}${c.thumbText ? ` Words: **${c.thumbText}**` : " No words."}
- The gap: ${c.gap}
- Opens with: "${c.opens}"
- Must prove: ${c.mustProve.map((m) => `\n  - ${m}`).join("")}
- Kill it if: ${c.kill}
- Why: ${c.why}${c.viewer ? `\n- Blind viewer: **${c.viewer.click}** (ranked ${c.viewer.rank} of ${s.concepts.length}); expects: ${c.viewer.expect}${c.viewer.confusing ? `; did not understand: ${c.viewer.confusing}` : ""}` : ""}${c.lint?.issues.length ? `\n- Title check: ${c.lint.issues.map(([, m]) => m).join("; ")}` : ""}`;
  return `# Packages first: ${s.topic}

${s.at.slice(0, 10)} · ${s.model}${s.viewerModel ? ` + blind viewer ${s.viewerModel}` : ""} · $${s.costUsd.toFixed(2)}
${s.note ? `\nNote: ${s.note}\n` : ""}
**The stake:** ${s.stake}

**Verdict:** ${s.verdict.strong ? "there is a package here" : "NO strong package yet"}. ${s.verdict.note} The editor would make **${s.pick}**.${s.viewerWhy ? `\n\n**Blind viewer:** ${s.viewerWhy}` : ""}
${s.warnings.length ? `\nWarnings:\n${s.warnings.map((w) => `- ${w}`).join("\n")}\n` : ""}
${s.concepts.map(row).join("\n\n")}
`;
}

/** The section written into a project's idea.md: what the writer must deliver and what meta.ts keeps faith with. */
export function chosenMarkdown(s: ConceptSet, n: number): string {
  const c = s.concepts[n - 1];
  return `## Chosen package (the promise this video must keep; packages first, ${s.at.slice(0, 10)})
- Title: ${c.title}
- Thumbnail: ${c.thumbnail}${c.thumbText ? ` Words on it: "${c.thumbText}".` : " No words."} (${AXIS_KEYS.map((k) => `${k}: ${c.axes[k]}`).join(", ")}; lever: ${c.lever})
- The question it leaves open: ${c.gap}
- Open the video with something like: "${c.opens}" (the click must be paid off in the first 15 seconds)
- The script must source these, or the package changes:
${c.mustProve.map((m) => `  - ${m}`).join("\n")}
- Drop this package if: ${c.kill}
- A {slot} in the title or on the thumbnail is filled only with the sourced figure.
`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const file = (key: string, ext: string) => path.join(CONCEPTS_DIR, `${key}.${ext}`);
  const load = (key: string) => readJson<ConceptSet>(file(key, "json"));
  const save = (s: ConceptSet) => { fs.mkdirSync(CONCEPTS_DIR, { recursive: true }); fs.writeFileSync(file(s.key, "json"), JSON.stringify(s, null, 2) + "\n"); fs.writeFileSync(file(s.key, "md"), conceptsMarkdown(s)); };
  const keys = () => { try { return fs.readdirSync(CONCEPTS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort(); } catch { return []; } };

  if (args.includes("--list")) {
    for (const k of keys()) { const s = load(k)!; console.log(`${k}  ${s.verdict.strong ? "strong" : "weak  "}  ${s.chosen ? `chose ${s.chosen}` : `editor: ${s.pick}`}  ${s.topic}`); }
    if (!keys().length) console.log("(none yet: bun run concepts --topic \"...\")");
    process.exit(0);
  }

  if (args.includes("--pick")) {
    const i = args.indexOf("--pick"), key = (args[i + 1] ?? "").toUpperCase(), n = Number(args[i + 2]), to = flag("--to");
    const s = load(key);
    if (!s || !(n >= 1 && n <= s.concepts.length)) { console.error(`❌ usage: bun run concepts --pick <key> <1-${N_CONCEPTS}> [--to <workspace>]  (keys: ${keys().join(", ") || "none"})`); process.exit(1); }
    s.chosen = n;
    if (to) {
      if (!fs.existsSync(wsDir(to))) { console.error(`❌ no workspace ${to} (bun run new-video ${to})`); process.exit(1); }
      const f = path.join(wsDir(to), "02-scripting/idea.md");
      const cur = readText(f).replace(/\n*^## Chosen package[^\n]*\n[\s\S]*?(?=\n## |(?![\s\S]))/m, "").trimEnd();
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `${cur || `# ${s.topic}\n\n${s.note}`.trim()}\n\n${chosenMarkdown(s, n)}`, "utf-8");
      s.ws = to;
      console.log(`📝 ${path.relative(REPO, f)}: the chosen package is in the idea the writer reads`);
    }
    save(s);
    console.log(`✅ ${key}: chose ${n}. ${s.concepts[n - 1].title}`);
    process.exit(0);
  }

  // ───────────── a run ─────────────
  const again = flag("--viewer") ? load(flag("--viewer")!.toUpperCase()) : null;
  if (flag("--viewer") && !again) { console.error(`❌ no concepts ${flag("--viewer")} (keys: ${keys().join(", ") || "none"})`); process.exit(1); }
  let idea: Idea | undefined;
  if (flag("--idea")) {
    idea = readIdeas().ideas.find((x) => x.id === flag("--idea")!.toUpperCase());
    if (!idea) { console.error(`❌ no idea ${flag("--idea")} (bun run ideas --add "...")`); process.exit(1); }
  }
  const topic = (again?.topic ?? idea?.title ?? flag("--topic") ?? "").trim(), note = (again?.note ?? flag("--note") ?? idea?.note ?? "").trim();
  if (!topic) { console.error("Usage: bun run concepts --topic \"...\" [--note \"...\"] | --idea I03 | --viewer <key> | --pick <key> <n> [--to <workspace>] | --list"); process.exit(1); }
  const key = again?.key ?? idea?.id ?? `C${String(Math.max(0, ...keys().map((k) => Number(k.match(/^C(\d+)$/)?.[1] ?? 0))) + 1).padStart(2, "0")}`;
  const logs = path.join(CONCEPTS_DIR, "logs", key);
  fs.mkdirSync(logs, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let costUsd = again?.costUsd ?? 0;

  async function ask(role: "concepts" | "stranger", prompt: string, name: string, resume?: string): Promise<{ json: any; sessionId?: string; model: string }> {
    const model = roleModel(role, role === "concepts" ? flag("--agent") : undefined), logPath = path.join(logs, `${stamp}_${name}_${specSlug(model)}.log`);
    fs.writeFileSync(logPath.replace(/\.log$/, ".prompt.md"), prompt, "utf-8");
    if (isAgy(model)) return { json: (await runAgyJson({ prompt: `${prompt}\nDo not create or edit any file.`, model: agyModel(model), logPath }).catch(() => ({ json: null }))).json, model };
    const r = await runAgentAsync({ prompt, model, tools: ["Read"], maxTurns: 12, resume, logPath, cwd: REPO });
    recordTiming(IDEAS_DIR, { step: `concepts ${name} (${model})`, ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
    costUsd += r.costUsd;
    let json: any = null;
    try { json = extractJson(r.text); } catch {}
    return { json, sessionId: r.sessionId, model };
  }

  const comps = (idea?.research?.competitors ?? []).slice(0, 15);
  const audience = readText(AUDIENCE_FILE);
  const prompt = `${readText(path.join(REPO, "workflow/prompts/CONCEPTS.md"))}

# Audience file
${audience}

# The channel's earlier packages (what was tried, and how often it was clicked)
${channelPackages("").join("\n") || "(none yet)"}
Words already used on thumbnails (do not reuse): ${[...usedThumbWords("").keys()].map((w) => w.toUpperCase()).join(", ") || "(none)"}

# Competition on this topic
${comps.length ? `From the idea check's YouTube search (${idea!.research!.at.slice(0, 10)}). "reach" is views ÷ the channel's normal views: 3 or more means the package or the topic beat that channel's usual.\n| title | channel | views | reach |\n|---|---|---|---|\n${comps.map((c) => `| ${c.title.replace(/\|/g, "/")} | ${c.channel.replace(/\|/g, "/")} | ${c.views.toLocaleString()} | ${(c as any).multiple ?? c.ratio} |`).join("\n")}` : `(not researched: no YouTube search was run for this topic${idea ? `; bun run ideas --id ${idea.id} adds it` : "; add it as an idea and run the idea check to get it"})`}
${swipeSection(`${topic} ${note}`)}
${idea?.research?.verdict ? `\n# The idea check's angle\n${idea.research.verdict.angle}\n` : ""}
# The topic
${topic}
${note ? `\nThe creator's note (figures stated here are the only ones you may use):\n${note}\n` : "\n(The creator gave no note, so no figure may appear in a title or on a thumbnail except as a {slot}.)\n"}`;

  let concepts: Concept[], warnings: string[], editor: { stake: string; pick: number; verdict: { strong: boolean; note: string }; model: string };
  if (again) {
    concepts = again.concepts; warnings = again.warnings.filter((w) => !/blind viewer/.test(w));
    editor = { stake: again.stake, pick: again.pick, verdict: again.verdict, model: again.model };
  } else {
  console.log(`🎯 Packages first for "${topic}" (${roleModel("concepts", flag("--agent"))})...`);
  let r = await ask("concepts", prompt, "editor");
  let v = r.json ? checkConcepts(r.json.concepts, `${topic} ${note}`) : { errors: ["the reply had no JSON"], warnings: [] as string[] };
  if (v.errors.length && r.sessionId) {
    console.log(`   ${v.errors.length} problem(s), one fix round:\n${v.errors.map((e) => `   - ${e}`).join("\n")}`);
    r = await ask("concepts", `Fix these problems and reply again with the complete JSON object only:\n${v.errors.map((e) => `- ${e}`).join("\n")}`, "editor_fix", r.sessionId);
    v = r.json ? checkConcepts(r.json.concepts, `${topic} ${note}`) : { errors: ["the fix reply had no JSON"], warnings: [] };
  }
  if (!r.json || v.errors.length) { console.error(`❌ no usable concepts (logs: ${path.relative(REPO, logs)})\n${v.errors.map((e) => `   - ${e}`).join("\n")}`); process.exit(1); }

  concepts = r.json.concepts.map((c: any) => ({
    title: String(c.title).trim(), lever: c.lever, axes: c.axes, thumbText: String(c.thumbText ?? "").trim(), thumbnail: String(c.thumbnail ?? ""),
    gap: String(c.gap ?? ""), opens: String(c.opens ?? ""), mustProve: (c.mustProve ?? []).map(String), kill: String(c.kill ?? ""), why: String(c.why ?? ""),
    ...(c.recipe ? { recipe: String(c.recipe) } : {}),
  }));
  warnings = [...v.warnings];
  editor = { stake: String(r.json.stake ?? ""), pick: Number(r.json.pick) >= 1 && Number(r.json.pick) <= concepts.length ? Number(r.json.pick) : 1, verdict: { strong: r.json.verdict?.strong !== false, note: String(r.json.verdict?.note ?? "") }, model: r.model };

  // the title linter (the idea check's yt-package/title.py), when it is there
  try {
    const { lintTitle } = await import("./skills");
    for (const c of concepts) { const l = lintTitle(c.title.replace(/[{}]/g, ""), c.thumbText.replace(/[{}]/g, "")); c.lint = { score: l.score, issues: l.issues }; }
  } catch (e) { warnings.push(`titles not linted: ${(e as Error).message}`); }

  }

  // the blind viewer: the five packages in a fixed shuffle, lettered, with nothing that says which the editor prefers
  const order = [2, 4, 0, 3, 1].filter((i) => i < concepts.length), letters = "PQRST";
  const viewerPrompt = `${readText(path.join(REPO, "workflow/prompts/CONCEPTS_VIEWER.md"))}

# The viewer
${audience.match(/## The viewer in one sentence\n([\s\S]*?)\n## /)?.[1]?.trim() ?? "An adult who earns and spends money, was never taught how the money system works, and is curious but not an expert."}

# The packages
${order.map((ci, k) => `## ${letters[k]}\nTitle: ${concepts[ci].title}\nThumbnail: ${concepts[ci].thumbnail}${concepts[ci].thumbText ? ` Words on it: "${concepts[ci].thumbText}".` : " No words on it."}`).join("\n\n")}
`;
  console.log(`👀 Blind viewer (${roleModel("stranger")})...`);
  const vw = await ask("stranger", viewerPrompt, "viewer");
  const rank: string[] = Array.isArray(vw.json?.rank) ? vw.json.rank.map(String) : [];
  if (vw.json?.packages) order.forEach((ci, k) => {
    const a = vw.json.packages[letters[k]];
    if (a) concepts[ci].viewer = { click: String(a.click ?? ""), expect: String(a.expect ?? ""), confusing: String(a.confusing ?? ""), feel: String(a.feel ?? ""), rank: rank.indexOf(letters[k]) + 1 };
  });
  else warnings.push("the blind viewer returned no usable JSON");

  const set: ConceptSet = {
    key, topic, note, at: again?.at ?? new Date().toISOString(), model: editor.model, viewerModel: vw.json?.packages ? vw.model : undefined, costUsd,
    stake: editor.stake, concepts, pick: editor.pick, verdict: editor.verdict, chosen: again?.chosen, ws: again?.ws, viewerWhy: typeof vw.json?.why === "string" ? vw.json.why : undefined, warnings,
  };
  save(set);
  console.log(`\n${set.verdict.strong ? "✅ there is a package here" : "⚠️  no strong package yet"}: ${set.verdict.note}`);
  console.log(`   stake: ${set.stake}`);
  concepts.forEach((c, i) => console.log(`   ${i + 1}. [${c.lever}] ${c.title}\n      thumbnail (${AXIS_KEYS.map((k) => c.axes[k]).join(", ")}${c.thumbText ? `, "${c.thumbText}"` : ""}): ${c.thumbnail}${c.viewer ? `\n      viewer: ${c.viewer.click}, ranked ${c.viewer.rank}${c.viewer.confusing ? `, did not understand: ${c.viewer.confusing}` : ""}` : ""}${c.lint ? `  · title check ${c.lint.score}/100` : ""}`));
  console.log(`   editor's pick: ${set.pick}${rank.length ? ` · viewer's first: ${order[letters.indexOf(rank[0])] + 1}` : ""}`);
  for (const w of warnings) console.log(`   ⚠ ${w}`);
  console.log(`   ${path.relative(REPO, file(key, "md"))} · $${costUsd.toFixed(2)}\n   Choose one: bun run concepts --pick ${key} <n> --to <workspace>`);
}
