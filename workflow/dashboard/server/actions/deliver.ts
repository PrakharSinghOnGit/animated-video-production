/** Downloads and the Final Cut Pro project (long video and per short). */
import * as sh from "../../../08-shorts/lib";
import { B, args, type Action } from "./base";

export const deliverActions: Record<string, Action> = {
  "deliver.build": {
    step: "deliver", label: "Build downloads", help: "Collects the video, the audio mixes, the stems, the SFX pack and the Final Cut Pro project in 08-deliver, ready to download.", long: "~1 min",
    opts: [{ key: "only", label: "Only these items", help: "comma-separated keys, e.g. video_full,stem_voice (empty = all)", type: "text", flag: "--only" }],
    build: (ws, o) => [B("deliver", "--video", ws, ...args(o, "deliver.build"))],
  },
  "deliver.short": {
    step: "deliver", perShort: true, label: "Build downloads", help: "Collects this short's video, audio mixes, stems, SFX pack and Final Cut Pro project in its 08-deliver folder.", long: "~1 min",
    opts: [{ key: "only", label: "Only these items", help: "comma-separated keys, e.g. video_full,stem_voice (empty = all)", type: "text", flag: "--only" }],
    build: (ws, o, s) => [B("deliver", "--video", sh.shortVideoId(ws, s!), ...args(o, "deliver.short"))],
  },
  "fcp.open": { step: "deliver", label: "Open in Final Cut Pro", help: "Writes the Final Cut Pro project (video, voice, every SFX on its own clip, music) and opens it.", long: "seconds", build: (ws) => [B("fcp", "--video", ws, "--open")] },
  "fcp.short": { step: "deliver", perShort: true, label: "Open in Final Cut Pro", help: "Writes this short's Final Cut Pro project and opens it.", long: "seconds", build: (ws, _o, s) => [B("fcp", "--video", sh.shortVideoId(ws, s!), "--open")] },
};
