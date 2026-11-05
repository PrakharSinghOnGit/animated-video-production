/**
 * Seams between acts, owned by the pipeline instead of by each act.
 *
 * Every act wrapper (spy/draft drawAct) used to run its own transition at both ends: the outgoing act panned or wiped into
 * the next act's colour and the incoming act did the same from the previous colour, so at the cut the picture jumped
 * A -> B -> A (flicker), and a wipe on one side never matched a whip on the other. Now `bun run seams` reads what each act
 * asks for (open/close), decides ONE owner per seam, renders the neighbours' real first/last frames, and writes the plan
 * into timeline.json (scene.seams). CanvasHost loads the images and calls setSeams() before every draw; drawAct follows it:
 *
 *   kind "none"   this side does nothing (the other act owns the seam, or it is a hard cut)
 *   kind "whip"   pan with the neighbour's frame beside this one; share 0.5 = half the pan (the other act does the rest),
 *                 1 = the whole pan (the other side can't whip)
 *   kind <wipe>   iris / strips / pixels / scan / scanUp / flood from (in) or to (out) the neighbour's frame
 *
 * Without a plan (single-act previews, studio) drawAct does what the act asked, as before.
 */
export interface SeamSide {
  kind: string;
  /** whip: fraction of the pan this act does (0.5 shared, 1 alone) */
  share?: number;
  /** the neighbour's frame: previous act's last frame (in) or next act's first frame (out) */
  img?: CanvasImageSource | null;
  /** the neighbour's ground colour, if the image is missing */
  ground?: string;
}
export interface SeamPlan { in?: SeamSide; out?: SeamSide; probe?: boolean }

let current: SeamPlan | null = null;
/** CanvasHost sets this before each draw (null = no plan: acts behave as written). */
export function setSeams(p: SeamPlan | null): void { current = p; }
export function getSeams(): SeamPlan | null { return current; }

/**
 * Probe mode (seams step): the wrapper draws the act plain (no transitions) and reports what it asked for, once per frame,
 * as a console line the seams script reads.
 */
export function reportSeamAsk(ask: { style: string; open: string; close: string; ground: string }): void {
  if (!current?.probe) return;
  console.log(`WGSEAM ${JSON.stringify(ask)}`);
}
