/**
 * Acts: the director's plan (acts.json). An act is one continuous 45–120 s piece of
 * picture on one sheet; its beats follow the narration and carry the word hits.
 * checkActs() enforces the rules DIRECTOR.md promises; actsToStoryboard() lets the
 * existing timeline/assemble/render stages treat each act as one long scene.
 */

export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Hit {
  word: string;
  occurrence?: number;
  what: string;
}

export interface DataItem {
  label: string;
  value: number | string;
  unit?: string;
  source: string;
}

export interface Beat {
  startMs: number;
  endMs: number;
  vo: string;
  visual: string;
  camera?: string;
  hits?: Hit[];
  data?: DataItem[];
}

export interface Act {
  id: string;
  slug: string;
  title: string;
  startMs: number;
  endMs: number;
  idea: string;
  sheet: string;
  signature: string;
  camera: string;
  transitionIn: string;
  bpm: number;
  intensity: number;
  silence?: { word: string; occurrence?: number; durMs: number }[];
  /** pauses for the picture: the voice waits `ms` after this word (applied in Align by voice:holds + tts:post) */
  holds?: { word: string; occurrence?: number; ms: number; why?: string }[];
  sound?: string;
  /** set on the act that opens a chapter: it starts on the narration pause with the chapter card */
  chapter?: { n: number; title: string };
  beats: Beat[];
}

export interface Chapter {
  n: number;
  title: string;
  pauseStartMs: number;
  startMs: number;
}

export interface ActsPlan {
  video: { id: string; title?: string };
  style: string;
  treatment: Record<string, unknown>;
  acts: Act[];
}

export const ACT_MIN_MS = 40_000;
export const ACT_MAX_MS = 150_000;
/** The cold open (first act) is the hook: it may be shorter than a body act. */
export const COLD_OPEN_MIN_MS = 20_000;
const SLACK_MS = 400;

export const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Start time of the nth occurrence of `word` among captions inside [startMs, endMs]. */
export function findWord(captions: Caption[], word: string, occurrence: number, startMs: number, endMs: number): Caption | undefined {
  const target = normWord(word);
  let n = 0;
  for (const c of captions) {
    const mid = (c.startMs + c.endMs) / 2;
    if (mid < startMs - SLACK_MS || mid > endMs + SLACK_MS) continue;
    if (normWord(c.text) === target && ++n === occurrence) return c;
  }
  return undefined;
}

/** opts.short: a 9:16 short is exactly one act of 10 s to its length limit (opts.maxS, default 60) plus a 15 s tail, at 70–130 BPM. */
export function checkActs(plan: ActsPlan, captions: Caption[], chapters: Chapter[] = [], opts: { short?: boolean; maxS?: number } = {}): string[] {
  const errors: string[] = [];
  const acts = plan.acts ?? [];
  if (acts.length === 0) return ["acts: no acts"];
  if (opts.short && acts.length !== 1) errors.push(`a short is one act; got ${acts.length}`);
  // Every chapter opens an act exactly at its narration pause (the act begins with the chapter card)
  for (const ch of chapters) {
    const act = acts.find((a) => Math.abs(a.startMs - ch.pauseStartMs) <= 800);
    if (!act) errors.push(`chapter ${ch.n} "${ch.title}": no act starts at its pause (${ch.pauseStartMs} ms)`);
    else if (!act.chapter || act.chapter.n !== ch.n) errors.push(`${act.id}: opens chapter ${ch.n}, set "chapter": {"n": ${ch.n}, "title": ${JSON.stringify(ch.title)}}`);
  }
  const voiceStart = captions[0]?.startMs ?? 0;
  const voiceEnd = captions[captions.length - 1]?.endMs ?? 0;

  if (acts[0].startMs > voiceStart + SLACK_MS) errors.push(`${acts[0].id}: starts at ${acts[0].startMs} ms but narration starts at ${voiceStart} ms`);
  if (acts[acts.length - 1].endMs < voiceEnd - SLACK_MS) errors.push(`${acts[acts.length - 1].id}: ends at ${acts[acts.length - 1].endMs} ms but narration ends at ${voiceEnd} ms`);

  const ids = new Set<string>();
  acts.forEach((act, i) => {
    const where = act.id || `acts[${i}]`;
    if (!/^A\d{2}$/.test(act.id ?? "")) errors.push(`${where}: id must look like A01`);
    if (ids.has(act.id)) errors.push(`${where}: duplicate id`);
    ids.add(act.id);
    for (const k of ["slug", "title", "idea", "sheet", "signature", "camera", "transitionIn"] as const) {
      if (!act[k] || String(act[k]).trim() === "") errors.push(`${where}: missing "${k}"`);
    }
    const len = act.endMs - act.startMs;
    const min = opts.short ? 10_000 : i === 0 ? COLD_OPEN_MIN_MS : ACT_MIN_MS, max = opts.short ? ((opts.maxS ?? 60) + 15) * 1000 : ACT_MAX_MS;
    if (len < min || len > max) errors.push(`${where}: ${Math.round(len / 1000)} s long; ${opts.short ? "a short's act" : i === 0 ? "the cold open" : "acts"} must be ${min / 1000}-${max / 1000} s`);
    if (i > 0 && Math.abs(act.startMs - acts[i - 1].endMs) > SLACK_MS) {
      errors.push(`${where}: starts at ${act.startMs} ms but ${acts[i - 1].id} ends at ${acts[i - 1].endMs} ms (acts must be contiguous)`);
    }
    const bpmMax = opts.short ? 130 : 110;
    if (!(act.bpm >= 70 && act.bpm <= bpmMax)) errors.push(`${where}: bpm ${act.bpm} outside 70-${bpmMax}`);
    if (!(act.intensity >= 0 && act.intensity <= 1)) errors.push(`${where}: intensity must be 0-1`);

    for (const h of act.holds ?? []) {
      if (!findWord(captions, h.word, h.occurrence ?? 1, act.startMs, act.endMs)) errors.push(`${where}: hold word "${h.word}" is not spoken in this act`);
      if (!(h.ms >= 100 && h.ms <= 4000)) errors.push(`${where}: hold after "${h.word}" is ${h.ms} ms (100-4000)`);
    }
    for (const s of act.silence ?? []) {
      if (!findWord(captions, s.word, s.occurrence ?? 1, act.startMs, act.endMs)) errors.push(`${where}: silence word "${s.word}" is not spoken in this act`);
    }

    const beats = act.beats ?? [];
    if (beats.length === 0) errors.push(`${where}: no beats`);
    beats.forEach((b, j) => {
      const bw = `${where}.beats[${j}]`;
      if (j === 0 && Math.abs(b.startMs - act.startMs) > SLACK_MS) errors.push(`${bw}: first beat must start at the act start`);
      if (j > 0 && Math.abs(b.startMs - beats[j - 1].endMs) > SLACK_MS) errors.push(`${bw}: beats must tile the act (gap/overlap at ${b.startMs} ms)`);
      if (j === beats.length - 1 && Math.abs(b.endMs - act.endMs) > SLACK_MS) errors.push(`${bw}: last beat must end at the act end`);
      if (!b.visual || b.visual.trim() === "") errors.push(`${bw}: missing "visual"`);
      for (const h of b.hits ?? []) {
        if (!findWord(captions, h.word, h.occurrence ?? 1, b.startMs, b.endMs)) {
          errors.push(`${bw}: hit word "${h.word}"${h.occurrence && h.occurrence > 1 ? ` #${h.occurrence}` : ""} is not spoken between ${b.startMs} and ${b.endMs} ms`);
        }
      }
      for (const d of b.data ?? []) {
        if (!d.source || d.source.trim() === "") errors.push(`${bw}: data "${d.label}" has no source`);
      }
    });
  });
  return errors;
}

/** Data items whose only source is the narration: shown to the user for fact-checking. */
export function unverifiedData(plan: ActsPlan): string[] {
  const out: string[] = [];
  for (const a of plan.acts) for (const b of a.beats) for (const d of b.data ?? []) {
    if (/unverified|narration/i.test(d.source)) out.push(`${a.id}: ${d.label} = ${d.value}${d.unit ? " " + d.unit : ""}`);
  }
  return out;
}

/** Storyboard view of the plan: one scene per act, so timeline/assemble/render work unchanged. */
export function actsToStoryboard(plan: ActsPlan) {
  return {
    video: plan.video,
    style: plan.style,
    scenes: plan.acts.map((a) => ({
      id: a.id,
      slug: a.slug,
      kind: "act",
      startMs: a.startMs,
      endMs: a.endMs,
      title: a.title,
      vo: a.beats.map((b) => b.vo).join(" "),
    })),
  };
}
