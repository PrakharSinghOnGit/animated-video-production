/** What the page shows for one project (GET /api/ws/<id>/status) and the project list: every step's artifacts, read from disk. */
import fs from "node:fs";
import path from "node:path";
import { publishedSummaries, shortLinkMap } from "../../09-analytics/lib";
import * as pub from "../../07-publish/lib";
import * as sh from "../../08-shorts/lib";
import { applyAccepted } from "../../lib/accepted";
import { REPO, SHORT_BAR, WS_ID, WS_ROOT, briefTitle, exists, fileInfo, kindOf, ls, mtime, notesRel, readJson, readText, voiceReviewPath, wsDir } from "./core";
import { jobSummary, jobs, jobsByWs, runningJob, runningJobs } from "./jobs";
import { studioState } from "./studio";
import { readAutopilot, STAGES } from "./autopilot";
import { type St, actApproval, approvalState, lastRuns, planApproval, publishApproval, publishStaleReasons, renderStates, sceneFiles, sceneStatus, stepStatuses } from "./status";

// ───────────────────────────── artifacts per step ─────────────────────────────

export function timingsFor(ws: string) {
  return (readJson<any[]>(path.join(wsDir(ws), "timings.json")) ?? []).filter((r) => r && typeof r.step === "string");
}
/** The video's own rows plus each short's (each short's own timings.json), the short's rows labelled "S1 · step". For totals, the usage view and the history table. */
export function timingsAll(ws: string) {
  const own = timingsFor(ws);
  const extra = sh.listShorts(ws).flatMap((sid) =>
    (readJson<any[]>(path.join(sh.shortWs(ws, sid), "timings.json")) ?? []).filter((r) => r && typeof r.step === "string").map((r) => ({ ...r, step: `${sid} · ${r.step}` })));
  return extra.length ? [...own, ...extra].sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? ""))) : own;
}

export const TIMING_MATCH: Record<string, RegExp> = {
  voice: /^voice\b/i,
  align: /^(post|transcribe|master|captions)\b/i,
  plan: /^direct\b/i,
  script: /^write script/i,
  acts: /^(act|critic|frames|review|preview) A\d+/i,
  sound: /^(cues|music|mix|sound)\b/i,
  render: /^(render|qc)\b/i,
  publish: /^(meta|thumbs)\b/i,
  shorts: /^(shorts\b|S\d+ · )/i,
};

export function stepMeta(rows: any[], re: RegExp) {
  const hit = rows.filter((r) => re.test(r.step));
  if (!hit.length) return null;
  const last = hit[hit.length - 1];
  return { runs: hit.length, totalMs: hit.reduce((s, r) => s + (r.ms ?? 0), 0), totalCost: hit.reduce((s, r) => s + (r.costUsd ?? 0), 0), last: { step: last.step, ms: last.ms, costUsd: last.costUsd, model: last.model, at: last.at } };
}

export function spokenWords(script: string): number {
  return script.split("\n").filter((l) => /^\*\*VO:\*\*/i.test(l)).join(" ").replace(/`\[[^\]]*\]`/g, "").replace(/\*\*VO:\*\*/gi, "").split(/\s+/).filter(Boolean).length;
}

export function publishDetails(ws: string) {
  const d = wsDir(ws);
  const meta = readJson<any>(pub.pubFile(ws, "metadata.json"));
  const info = readJson<Record<string, any>>(pub.pubFile(ws, "thumbnails.json")) ?? {};
  const checks = readJson<Record<string, any>>(pub.pubFile(ws, "thumbnails.checks.json")) ?? {};
  const rev = ls(pub.pubFile(ws, "reviews"), /\.json$/).reverse().slice(0, 8).map((f) => {
    const r = readJson<any>(pub.pubFile(ws, `reviews/${f}`));
    return r ? { file: `07-publish/reviews/${f}`, agent: r.agent, at: r.at, overall: r.overall, summary: r.summary, all: r.all ?? [], variants: r.variants ?? {}, costUsd: r.costUsd ?? 0, ms: r.ms ?? 0 } : null;
  }).filter(Boolean);
  return {
    metadata: meta ? { ...meta, checks: applyAccepted(d, "meta", meta.checks) } : meta, metaFile: fileInfo(ws, "07-publish/metadata.json"),
    metaNotes: pub.readText(pub.pubFile(ws, "notes/meta.md")), metaNotesMtime: mtime(pub.pubFile(ws, "notes/meta.md")),
    thumbs: pub.VARIANTS.map((v) => {
      const p = pub.thumbPath(ws, v), notes = pub.pubFile(ws, `notes/${v}.md`);
      return { id: v, file: p ? fileInfo(ws, path.relative(d, p)) : null, source: fileInfo(ws, `07-publish/remotion/thumbs/${v}.tsx`), info: info[v] ?? null, checks: applyAccepted(d, `thumb:${v}`, checks[v] ?? null), notes: pub.readText(notes), notesMtime: mtime(notes) };
    }),
    preview: fileInfo(ws, "07-publish/preview.png"), previewSmall: fileInfo(ws, "07-publish/preview_small.png"),
    reviews: rev, review: exists(pub.pubFile(ws, "review.md")) ? { ...fileInfo(ws, "07-publish/review.md"), text: pub.readText(pub.pubFile(ws, "review.md")).slice(0, 20000) } : null,
    approval: publishApproval(ws), stale: publishStaleReasons(ws),
    exported: ls(pub.pubFile(ws, "export")).map((f) => fileInfo(ws, `07-publish/export/${f}`)).filter(Boolean),
    badge: pub.badgeTime(meta?.durationS ?? 0),
  };
}

export const SHORT_NOTES = "05-video/review/A01/director_notes.md";
/** One folder of shorts: the index merged with each short's short.json (+ checks), progress, approval, texts, files, the export folder and compact history. */
export function shortsDetails(ws: string) {
  const d = wsDir(ws), index = readJson<any>(sh.indexPath(ws));
  const items = sh.listShorts(ws).map((id) => {
    const sw = sh.shortWs(ws, id), rel = (r: string) => `shorts/${id}/${r}`;
    const entry = { ...(index?.shorts ?? []).find((e: any) => e.id === id), ...(readJson<any>(path.join(sw, "02-scripting/short.json")) ?? {}) };
    const script = readText(path.join(sw, "02-scripting/script_raw.md"));
    const rdir = rel("05-video/review/A01"), abs = path.join(d, rdir);
    const qcP = path.join(sw, "05-video/review/qc-report.md");
    const feedbackP = path.join(sw, "02-scripting/feedback.md"), notesP = path.join(sw, SHORT_NOTES);
    const timings = (readJson<any[]>(path.join(sw, "timings.json")) ?? []).filter((r) => r && typeof r.step === "string");
    return {
      id, entry, checks: applyAccepted(sw, "script", entry.checks ?? null), progress: sh.shortProgress(ws, id), maxS: sh.lengthOf(ws, id),
      rhythm: (() => {
        const r = readJson<any>(path.join(sw, "06-audio/rhythm.json"));
        return r ? { track: r.track, title: r.title, license: r.license ?? null, bpm: r.bpm, start: r.start, dur: r.dur, confidence: r.confidence, beats: r.beats, downbeats: r.downbeats, accents: r.accents, energy: r.energy, at: r.at } : null;
      })(),
      approval: sh.approvalState(sw), approvedAt: readJson<any>(path.join(sw, "02-scripting/approved.json"))?.at ?? null,
      script, scriptMtime: mtime(path.join(sw, "02-scripting/script_raw.md")), words: sh.spokenWords(script),
      feedback: readText(feedbackP), feedbackMtime: mtime(feedbackP),
      notes: readText(notesP), notesMtime: mtime(notesP),
      files: {
        draft: fileInfo(ws, rel("05-video/draft.mp4")), final: fileInfo(ws, rel("05-video/final.mp4")),
        sheet: fileInfo(ws, `${rdir}/sheet.jpg`), preview: fileInfo(ws, `${rdir}/preview.mp4`),
        mix: fileInfo(ws, rel("06-audio/mix.wav")), voice: fileInfo(ws, rel("03-voiceover/audio/combined/full_voiceover.wav")),
        srt: ls(path.join(sw, "07-assembly/export"), /\.srt$/).map((f) => fileInfo(ws, rel(`07-assembly/export/${f}`))).filter(Boolean)[0] ?? null,
      },
      thumbs: ls(abs, /^t_.*\.jpg$/).map((f) => fileInfo(ws, `${rdir}/${f}`)).filter(Boolean),
      qc: exists(qcP) ? { ...fileInfo(ws, rel("05-video/review/qc-report.md")), text: readText(qcP).slice(0, 20000) } : null,
      timings: { runs: timings.length, ms: timings.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: timings.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
    };
  });
  return {
    items, notes: index?.notes ?? null, indexFile: fileInfo(ws, "shorts/shorts.json"),
    feedback: readText(path.join(sh.shortsDir(ws), "feedback.md")), feedbackMtime: mtime(path.join(sh.shortsDir(ws), "feedback.md")),
    exported: ls(path.join(sh.shortsDir(ws), "export")).map((f) => fileInfo(ws, `shorts/export/${f}`)).filter(Boolean),
    compact: readJson<any[]>(path.join(d, "compact.json")) ?? [],
  };
}

/** Align → Pauses: the holds, how the last merge applied them, requests not collected yet, and the plan shift state. */
export function holdsSummary(ws: string) {
  const d = wsDir(ws);
  const file = readJson<{ holds: any[] }>(path.join(d, "03-voiceover/holds.json"))?.holds ?? [];
  const post = readJson<any>(path.join(d, "03-voiceover/audio/post.json"));
  const applied: any[] = post?.holds ?? [];
  const retime = readJson<any>(path.join(d, "03-voiceover/audio/retime.json"));
  const pts = readJson<any>(path.join(d, "03-voiceover/audio/hold_points.json"));
  const plan = readJson<any>(path.join(d, "05-video/acts.json"));
  const keys = new Set(file.map((h) => h.key).filter(Boolean));
  const norm = (x: string) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  let pending = 0;
  for (const a of plan?.acts ?? []) {
    const author = readJson<any>(path.join(d, "05-video/review", a.id, "holds.json"));
    const reqs: [string, any[]][] = [["director", a.holds ?? []], [`author ${a.id}`, author?.holds ?? (Array.isArray(author) ? author : [])]];
    for (const [by, list] of reqs) for (const r of list) if (r?.word && !keys.has(`${by}|${a.id}|${norm(r.word)}|${r.occurrence ?? 1}`)) pending++;
  }
  const holds = file.map((h) => {
    const ap = applied.find((x) => x.id === h.id);
    const live = !!ap && ap.ok && ap.ms === h.ms && h.on;
    return { ...h, status: !h.on ? "off" : live ? "applied" : ap && !ap.ok && ap.ms === h.ms ? "failed" : "waiting", failWhy: ap && !ap.ok ? ap.why : undefined, mergedAt: ap?.mergedAt ?? null };
  });
  const appliedGone = applied.filter((x) => x.ok && !file.some((h) => h.id === x.id && h.on)).length;
  return {
    holds, pending, scannedAt: pts?.at ?? null,
    cleanPoints: pts ? Object.values<any>(pts.sections).reduce((n, x) => n + (x.points ?? []).filter((p: any) => p.clean).length, 0) : 0,
    addedMs: applied.filter((x) => x.ok).reduce((n, x) => n + x.ms, 0),
    dirty: holds.some((h) => h.status === "waiting") || appliedGone > 0,
    planShift: retime ? { changed: !!retime.changed, shifted: !!retime.shifted, baseSame: !!retime.baseSame } : null,
  };
}

export function details(ws: string) {
  const d = wsDir(ws);
  const rows = timingsFor(ws), allRows = timingsAll(ws);
  const meta: Record<string, any> = {};
  for (const [k, re] of Object.entries(TIMING_MATCH)) meta[k] = stepMeta(k === "shorts" ? allRows : rows, re);

  // script
  const scriptInfo = fileInfo(ws, "02-scripting/script_raw.md");
  const sections = ls(path.join(d, "03-voiceover/sections"), /^part\d+\.ts$/);
  let sectionCount = 0;
  for (const f of sections) sectionCount += (fs.readFileSync(path.join(d, "03-voiceover/sections", f), "utf-8").match(/^\s*id:\s*"/gm) ?? []).length;

  // voice
  const audioDir = path.join(d, "03-voiceover/audio");
  const parts = ls(audioDir, /^part-\d+$/).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const voiceParts = parts.map((p) => ({ part: p, files: ls(path.join(audioDir, p), /\.wav$/).map((f) => fileInfo(ws, `03-voiceover/audio/${p}/${f}`)).filter(Boolean) }));
  const combined = ls(path.join(audioDir, "combined"), /\.wav$/).map((f) => fileInfo(ws, `03-voiceover/audio/combined/${f}`)).filter(Boolean);
  const run = runningJob(ws);
  const voiceSince = run?.step === "voice" ? run.startedAt : 0;
  const freshWavs = voiceParts.reduce((s, p) => s + p.files.filter((f: any) => f.mtime >= voiceSince).length, 0);

  // voice sections for Listen / Review: text, the exact direction, long pauses, your review, the previous take
  const voiceManifest = readJson<any>(path.join(audioDir, "sections.json"));
  const pauses = readJson<any>(path.join(audioDir, "pauses.json"))?.files ?? {};
  const reviews = readJson<Record<string, any>>(voiceReviewPath(ws)) ?? {};
  const voiceSections = (voiceManifest?.sections ?? []).map((x: any) => {
    const base = path.basename(x.file, ".wav"), rep = readJson<any>(path.join(audioDir, "reports", `${base}.json`));
    const wer = rep?.chunks?.length ? rep.chunks.reduce((n: number, c: any) => n + (c.chosenWer ?? 0), 0) / rep.chunks.length : null;
    const f = fileInfo(ws, `03-voiceover/audio/${x.file}`);
    return { id: x.id, part: x.part, partTitle: x.partTitle ?? "", chapterTitle: x.chapterTitle ?? null, file: f, text: x.text, instruction: x.instruction, direction: x.direction,
      pauses: f && pauses[x.file]?.mtime === f.mtime ? pauses[x.file].pauses : [], pausesStale: !!f && !!pauses[x.file] && pauses[x.file].mtime !== f.mtime,
      wer, review: reviews[x.id] ?? null, prev: fileInfo(ws, `03-voiceover/audio/prev/${x.file}`) };
  });

  // align
  const captions = readJson<any[]>(path.join(d, "05-video/captions.json"));
  const chapters = readJson<any[]>(path.join(d, "05-video/chapters.json"));
  const transcript = readJson<any>(path.join(d, "04-transcription/full_transcript.json"));
  let tOff = 0;
  const trClips = (transcript?.clips ?? []).map((c: any) => { const r = { id: c.sectionId, startMs: Math.round(tOff * 1000), durationMs: Math.round(c.duration * 1000), matchedPct: c.matchedPct ?? null, text: c.text ?? "", words: (c.words ?? []).length }; tOff += c.duration; return r; });
  const masterReport = readJson<any>(path.join(d, "06-audio/master.json"));

  // plan
  const plan = readJson<any>(path.join(d, "05-video/acts.json"));
  const unverified: string[] = [];
  const acts = (plan?.acts ?? []).map((a: any) => {
    for (const b of a.beats ?? []) for (const x of b.data ?? []) if (/unverified|narration/i.test(String(x.source ?? ""))) unverified.push(`${a.id}: ${x.label} = ${x.value}${x.unit ? " " + x.unit : ""}`);
    const beats = (a.beats ?? []).map((b: any) => ({ startMs: b.startMs, endMs: b.endMs, vo: b.vo ?? "", visual: b.visual ?? "", camera: b.camera ?? "",
      hits: (b.hits ?? []).map((h: any) => ({ word: h.word, occurrence: h.occurrence ?? 1, what: h.what ?? "" })),
      data: (b.data ?? []).map((x: any) => ({ label: x.label, value: x.value, unit: x.unit ?? "", source: x.source ?? "" })) }));
    return { id: a.id, slug: a.slug, title: a.title, startMs: a.startMs, endMs: a.endMs, bpm: a.bpm, chapter: a.chapter ?? null, idea: a.idea ?? "", beats: beats.length,
      detail: { sheet: a.sheet ?? "", signature: a.signature ?? "", camera: a.camera ?? "", transitionIn: a.transitionIn ?? "", sound: a.sound ?? "", intensity: a.intensity ?? null, beats } };
  });

  // acts
  const scenes = sceneFiles(ws);
  const last = lastRuns(ws);
  const actRows = acts.map((a: any) => {
    const rdir = `05-video/review/${a.id}`;
    const abs = path.join(d, rdir);
    const critics = ls(abs, /^critic_\d+\.json$/).sort((x, y) => fs.statSync(path.join(abs, x)).mtimeMs - fs.statSync(path.join(abs, y)).mtimeMs);   // newest last (numbers restart per author run)
    const critic = critics.length ? readJson(path.join(abs, critics[critics.length - 1])) : null;
    const notesPath = path.join(d, notesRel(a.id));
    const scene = scenes[a.id] ? fileInfo(ws, scenes[a.id]) : null;
    let status: St = sceneStatus(ws, a.id, scenes[a.id]);
    if (runningJobs(ws).some((j) => j.locks.includes(`act:${a.id}`) && /^(acts|act:|fix:)/.test(j.step))) status = "running";
    else for (const k of [`act:${a.id}`, `fix:${a.id}`]) if (last[k] && last[k].exit !== "0" && last[k].end >= (scene?.mtime ?? 0)) status = "failed";
    return {
      id: a.id, title: a.title, status, scene,
      thumbs: ls(abs, /^t_.*\.jpg$/).map((f) => fileInfo(ws, `${rdir}/${f}`)),
      sheet: fileInfo(ws, `${rdir}/sheet.jpg`),
      // motion grids (12 consecutive frames per image) and the measured findings, from bun run frames
      grids: ls(abs, /^grid_\d+\.jpg$/).map((f) => fileInfo(ws, `${rdir}/${f}`)).filter(Boolean),
      checks: (() => {
        const c = readJson<any>(path.join(abs, "checks.json"));
        return c ? { findings: (c.findings ?? []).filter((f: any) => f.severity !== "low").map((f: any) => ({ id: f.id, kind: f.kind, severity: f.severity, t: f.t, msg: f.msg })), low: (c.findings ?? []).filter((f: any) => f.severity === "low").length } : null;
      })(),
      critic: critic ? { file: critics[critics.length - 1], score: critic.score, pass: critic.pass, issues: critic.issues ?? [] } : null,
      notes: exists(notesPath) ? fs.readFileSync(notesPath, "utf-8") : "",
      preview: fileInfo(ws, `${rdir}/preview.mp4`),
      reviews: ls(path.join(abs, "reviews"), /\.json$/).reverse().slice(0, 12).map((f) => {
        const r = readJson<any>(path.join(abs, "reviews", f));
        return r ? { file: `${rdir}/reviews/${f}`, agent: r.agent, at: r.at, sync: r.sync_score, overall: r.overall, summary: r.summary, issues: r.issues ?? [], costUsd: r.costUsd ?? 0, ms: r.ms ?? 0, give: r.give ?? [] } : null;
      }).filter(Boolean),
      start: a.startMs, end: a.endMs, idea: a.idea,
      notesMtime: mtime(notesPath),
      approval: scene ? actApproval(ws, a.id, scene.mtime) : null,
      // author_act.ts leaves this when a first authoring run was cut off (usage limit, error): the file is partial
      unfinished: scene && exists(path.join(abs, "unfinished")) ? fs.readFileSync(path.join(abs, "unfinished"), "utf-8").trim() : null,
      meta: stepMeta(rows, new RegExp(`\\b${a.id}\\b`)),
    };
  });

  // sound
  const soundFiles = ["06-audio/music.wav", "06-audio/mix.wav"].map((r) => fileInfo(ws, r)).filter(Boolean);
  const stems = [...ls(path.join(d, "06-audio/stems"), /\.wav$/).map((f) => fileInfo(ws, `06-audio/stems/${f}`)), ...ls(path.join(d, "06-audio/audition"), /\.wav$/).map((f) => fileInfo(ws, `06-audio/audition/${f}`))].filter(Boolean);
  const events = readJson<any[]>(path.join(d, "05-video/events.json"));
  const credits = exists(path.join(d, "06-audio/credits.txt")) ? fs.readFileSync(path.join(d, "06-audio/credits.txt"), "utf-8").slice(0, 4000) : "";

  // render
  const videos = ["05-video/final.mp4", "05-video/draft.mp4"].map((r) => fileInfo(ws, r)).filter(Boolean);
  const qcPath = path.join(d, "05-video/review/qc-report.md");
  const qc = exists(qcPath) ? { ...fileInfo(ws, "05-video/review/qc-report.md"), text: fs.readFileSync(qcPath, "utf-8").slice(0, 20000) } : null;
  const manifest = readJson(path.join(d, "05-video/draft.manifest.json"));

  return {
    id: ws,
    kind: kindOf(ws),
    style: plan?.style ?? null,
    title: sh.isShortsProject(ws) ? briefTitle(ws) : plan?.video?.title ?? null,
    statuses: stepStatuses(ws),
    meta,
    script: {
      file: scriptInfo, sections: sectionCount, sectionsInfo: fileInfo(ws, "03-voiceover/sections/index.ts"),
      idea: readText(path.join(d, "02-scripting/idea.md")), ideaInfo: fileInfo(ws, "02-scripting/idea.md"),
      research: readText(path.join(d, "02-scripting/research.md")), researchInfo: fileInfo(ws, "02-scripting/research.md"),
      feedback: readText(path.join(d, "02-scripting/feedback.md")), notes: readText(path.join(d, "02-scripting/script_notes.md")),
      approval: approvalState(ws), approvedAt: readJson<any>(path.join(d, "02-scripting/approved.json"))?.at ?? null,
      words: spokenWords(readText(path.join(d, "02-scripting/script_raw.md"))),
    },
    runs: (readJson<any[]>(path.join(d, "dashboard_runs.json")) ?? []).slice(-80),
    totals: { ms: allRows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: allRows.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
    voice: { parts: voiceParts, combined, sectionCount, freshWavs, running: !!voiceSince, sections: voiceSections, scanned: !!voiceManifest, baseStyle: voiceManifest?.baseStyle ?? null, engine: readJson<any>(path.join(audioDir, "voice.json"))?.engine ?? null },
    align: { holds: holdsSummary(ws), voice: fileInfo(ws, "03-voiceover/audio/combined/full_voiceover.wav"), post: readJson(path.join(audioDir, "post.json")) ? (({ speed, gap, chapterGap, maxPause }) => ({ speed, gap, chapterGap, maxPause: maxPause ?? 0 }))(readJson(path.join(audioDir, "post.json"))) : null, master: fileInfo(ws, "06-audio/voiceover_master.wav"), masterReport, rawVoice: fileInfo(ws, "03-voiceover/audio/combined/full_voiceover.wav"),
      transcript: transcript ? { model: transcript.model ?? null, at: transcript.generatedAt ?? null, clips: trClips } : null,
      srt: fileInfo(ws, `07-assembly/export/${ws}.srt`), words: captions?.length ?? null, durationMs: captions?.length ? captions[captions.length - 1].endMs : null, chapters: chapters ?? [] },
    plan: { file: fileInfo(ws, "05-video/acts.json"), logline: plan?.treatment?.logline ?? null, style: plan?.style ?? null,
      treatment: plan?.treatment ? Object.fromEntries(Object.entries(plan.treatment).filter(([k, v]) => k !== "logline" && (typeof v === "string" || Array.isArray(v))).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ") : v])) : {},
      acts, unverified, approval: planApproval(ws),
      // acts whose narration a script change rewrote (replan), until Update changed acts redraws them
      changed: readJson<any>(path.join(d, "05-video/changed_acts.json"))?.acts ?? {} },
    acts: actRows,
    sound: { files: soundFiles, stems, events: events?.length ?? null, musicPlan: fileInfo(ws, "06-audio/music_plan.json"), credits,
      // what Cues / Music stem made: events per sound and per act, and the music sections (with where each came from)
      eventTypes: Object.entries((events ?? []).reduce((m: Record<string, number>, e: any) => { m[e.type] = (m[e.type] ?? 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]),
      eventActs: Object.entries((events ?? []).reduce((m: Record<string, number>, e: any) => { m[e.act] = (m[e.act] ?? 0) + 1; return m; }, {})),
      // the shared music library (assets/music/index.json, `music:lib`) and the prompts for generating beds by hand
      library: { tracks: readJson<any>(path.join(REPO, "assets/music/index.json"))?.tracks ?? [], prompts: readJson<any>(path.join(REPO, "workflow/06-audio/music_prompts.json")) },
      music: (() => {
        const m = readJson<any>(path.join(d, "06-audio/music.json")), plan = readJson<any>(path.join(d, "06-audio/music_plan.json"));
        if (!m) return null;
        return { duration: m.duration, crossfadeSec: m.crossfadeSec ?? null, planDuration: plan?.duration ?? null,
          sections: (m.sections ?? []).map((x: any) => ({ label: x.label, title: x.title ?? null, t0: x.t0, t1: x.t1, intro: x.intro ?? null,
            source: x.source?.type === "file" ? `file: ${path.basename(String(x.source.path ?? x.source.file ?? ""))}` : x.source?.type === "synth" ? `synth (${x.source.palette ?? "default"})` : String(x.source?.type ?? "?"),
            bpm: x.source?.bpm ?? null, key: x.source?.key ? `${x.source.key} ${x.source.mode ?? ""}`.trim() : null, intensity: x.source?.intensity ?? null })) };
      })() },
    render: { videos, qc, manifest, ...renderStates(ws), seams: (() => {
      const f = path.join(wsDir(ws), "05-video/review/seams/report.json"), r = readJson<{ at: string; seams: any[] }>(f);
      if (!r) return null;
      const marks = readJson<Record<string, any>>(path.join(path.dirname(f), "marks.json")) ?? {};
      return { at: r.at, mtime: mtime(f), seams: r.seams.map((s) => { const m = marks[`${s.a}-${s.b}`]; return m ? { ...s, mark: { ok: !!m.ok, note: m.note ?? "", side: m.side ?? "both", at: m.at, stale: m.key !== s.key } } : s; }) };
    })() },
    timings: allRows,
    // autopilot (server/autopilot.ts) and, while the act batch sleeps through a usage reset, until when (author_act.ts --wait)
    autopilot: readAutopilot(ws), autopilotSteps: STAGES.map(({ key, label, needs, def, actions, approval }) => ({ key, label, needs, def, actions, approval: !!approval })), usageWait: readJson<any>(path.join(d, "05-video/.autopilot_wait.json")),
    jobs: (jobsByWs.get(ws) ?? []).map((j) => jobs.get(j)).filter(Boolean).map((j) => jobSummary(j!)),
    lastRuns: last,
    publish: publishDetails(ws),
    shorts: shortsDetails(ws),
    studio: studioState(),
  };
}

export function listWorkspaces() {
  const pub = publishedSummaries();
  return ls(WS_ROOT)
    .filter((f) => WS_ID.test(f) && fs.statSync(path.join(WS_ROOT, f)).isDirectory())
    .map((id) => {
      const rows = timingsAll(id);
      return { id, kind: kindOf(id), statuses: stepStatuses(id), running: runningJob(id) ? jobSummary(runningJob(id)!) : null,
        title: sh.isShortsProject(id) ? briefTitle(id) : readJson(path.join(wsDir(id), "05-video/acts.json"))?.video?.title ?? null,
        // a shorts project's progress, like a video's steps: per stage, how many of its shorts have done it
        shorts: (() => {
          const ps = sh.listShorts(id).map((s) => sh.shortProgress(id, s));
          return SHORT_BAR.map(([k, label]) => ({ key: k, label, done: ps.filter((p) => p[k]).length, total: ps.length }));
        })(),
        totals: { ms: rows.reduce((a, r) => a + (r.ms ?? 0), 0), costUsd: rows.reduce((a, r) => a + (r.costUsd ?? 0), 0) },
        // linked to its YouTube upload: the sidebar and overview show the upload's numbers instead of the pipeline
        published: pub[id] ?? null,
        // a shorts project: each short's upload (S1 → id or null); it is published once all are linked
        ...(sh.isShortsProject(id) ? { shortLinks: shortLinkMap(id) } : {}) };
    });
}
