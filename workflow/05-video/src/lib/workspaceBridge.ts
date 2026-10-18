import fs from "node:fs";
import path from "node:path";

export interface ResolvedJobPaths {
  jobId: string;
  isWorkspace: boolean;
  inputDir: string;
  outputDir: string;
  planDir: string;
  audioFile?: string;
  transcriptFile?: string;
  briefFile?: string;
  configFile?: string;
  styleFile?: string;
  dataDir?: string;
  assetsDir?: string;
}

function findStudioRoot(startDir: string = process.cwd()): string {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(cur, "workspace"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}

/**
 * Resolves job input/output paths given a jobId, path, or workspace ID.
 */
export function resolveJobPaths(targetId: string, baseDir: string = process.cwd()): ResolvedJobPaths {
  const cleanId = targetId.replace(/^[/\\]+|[/\\]+$/g, "");
  const rootStudioDir = findStudioRoot(baseDir);

  // Option A: Studio workspace directory (e.g. workspace/VID01_Currency_Market or VID01_Currency_Market)
  const candidateWorkspace = path.resolve(rootStudioDir, "workspace", cleanId.replace(/^workspace[/\\]/, ""));

  // Option B: Direct path to a directory (e.g. fixtures/sample-job)
  const candidateDirect = path.resolve(baseDir, cleanId);
  const candidateFixturesLocal = path.resolve(baseDir, "fixtures", cleanId);
  const candidateFixturesRoot = path.resolve(rootStudioDir, "workflow", "05-video", "fixtures", cleanId.replace(/^(workflow[/\\]05-video[/\\])?fixtures[/\\]/, ""));
  const candidateJobs = path.resolve(rootStudioDir, "workflow", "05-video", "jobs", cleanId);

  let baseJobDir = "";
  let isWorkspace = false;

  if (fs.existsSync(candidateWorkspace) && fs.statSync(candidateWorkspace).isDirectory()) {
    baseJobDir = candidateWorkspace;
    isWorkspace = true;
  } else if (fs.existsSync(candidateDirect) && fs.statSync(candidateDirect).isDirectory()) {
    baseJobDir = candidateDirect;
  } else if (fs.existsSync(candidateFixturesLocal) && fs.statSync(candidateFixturesLocal).isDirectory()) {
    baseJobDir = candidateFixturesLocal;
  } else if (fs.existsSync(candidateFixturesRoot) && fs.statSync(candidateFixturesRoot).isDirectory()) {
    baseJobDir = candidateFixturesRoot;
  } else if (fs.existsSync(candidateJobs) && fs.statSync(candidateJobs).isDirectory()) {
    baseJobDir = candidateJobs;
  } else {
    baseJobDir = candidateJobs;
  }

  const inputDir = isWorkspace ? baseJobDir : path.join(baseJobDir, "input");
  const outputDir = isWorkspace ? path.join(baseJobDir, "05-video") : path.join(baseJobDir, "output");
  const planDir = path.join(baseJobDir, "plan");

  // Locate audio file
  let audioFile: string | undefined;
  const audioExtensions = [".mp3", ".wav", ".m4a", ".aac", ".flac"];

  if (isWorkspace) {
    const combinedAudio = path.join(baseJobDir, "03-voiceover", "audio", "combined", "full_voiceover.wav");
    if (fs.existsSync(combinedAudio)) {
      audioFile = combinedAudio;
    } else {
      // Look under 03-voiceover/audio for any audio file
      const voDir = path.join(baseJobDir, "03-voiceover", "audio");
      if (fs.existsSync(voDir)) {
        const found = findAudioRecursive(voDir);
        if (found) audioFile = found;
      }
    }
  } else {
    for (const ext of audioExtensions) {
      const candidate = path.join(inputDir, `audio${ext}`);
      if (fs.existsSync(candidate)) {
        audioFile = candidate;
        break;
      }
    }
  }

  // Locate transcript
  let transcriptFile: string | undefined;
  if (isWorkspace) {
    const wsTranscript = path.join(baseJobDir, "04-transcription", "full_transcript.json");
    if (fs.existsSync(wsTranscript)) {
      transcriptFile = wsTranscript;
    }
  } else {
    const candidateT = path.join(inputDir, "transcript.json");
    if (fs.existsSync(candidateT)) transcriptFile = candidateT;
  }

  // Locate brief
  let briefFile: string | undefined;
  const candidateBrief = isWorkspace ? path.join(baseJobDir, "05-video", "brief.md") : path.join(inputDir, "brief.md");
  if (fs.existsSync(candidateBrief)) {
    briefFile = candidateBrief;
  } else if (isWorkspace) {
    const rawScript = path.join(baseJobDir, "02-scripting", "script_raw.md");
    if (fs.existsSync(rawScript)) briefFile = rawScript;
  }

  const candidateConfig = path.join(inputDir, "config.json");
  const configFile = fs.existsSync(candidateConfig) ? candidateConfig : undefined;

  const candidateStyle = path.join(inputDir, "style.json");
  const styleFile = fs.existsSync(candidateStyle) ? candidateStyle : undefined;

  const dataDir = path.join(inputDir, "data");
  const assetsDir = path.join(inputDir, "assets");

  return {
    jobId: path.basename(baseJobDir),
    isWorkspace,
    inputDir,
    outputDir,
    planDir,
    audioFile,
    transcriptFile,
    briefFile,
    configFile,
    styleFile,
    dataDir: fs.existsSync(dataDir) ? dataDir : undefined,
    assetsDir: fs.existsSync(assetsDir) ? assetsDir : undefined,
  };
}

function findAudioRecursive(dir: string): string | undefined {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      const sub = findAudioRecursive(full);
      if (sub) return sub;
    } else if (/\.(mp3|wav|m4a|aac|flac)$/i.test(f)) {
      return full;
    }
  }
  return undefined;
}
