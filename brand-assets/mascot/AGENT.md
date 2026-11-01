# The Agent — the Briefing style's recurring hero

The man in the hat from the Briefing style, made into the channel's recurring character (2026-11-02). He is the viewer's stand-in: the saver, the trader, "you". He stays a faceless cut-paper silhouette (Briefing never draws faces); what makes him *him* is a small signature no one else in the story wears.

**The drawing code is the source of truth:** `figureSide(g, x, y, s, pose, { hero: true, col, accent, paper, warm })` in `packages/kit/src/spy/chars.ts`. Never draw the signature by hand. Sheet: `agent_sheet.png` (re-render: `bunx remotion still packages/kit/src/spy/preview/Root.tsx AgentSheet brand-assets/mascot/agent_sheet.png --gl=angle`; re-render it in the same commit as any change to `chars.ts`).

## Look

| Part | Spec |
|---|---|
| Body | the Briefing silhouette, ~7 heads tall, profile, hat and coat, cut slits at the joints; `s = 1` is ~540 px tall, 0.6 the usual scene scale |
| Signature 1 | three slanted cuts in his hatband (the three bars of the channel logo) instead of the extras' single straight slit |
| Signature 2 | a gold coin tie clip on his streamer: the warm (money) ink on a black keyline, so it follows the style's rule that money is warm on black |
| Streamer (tie) | the chapter's one accent, as for any figure |
| Face | none, ever; an eye slit (`eye: "open" / "peek"`) is the only expression |

## Rules

- `hero: true` on the figure who is "you" / the protagonist; every other person is an extra without it. At most one Agent on screen.
- Inks follow the chapter's set (`INKS.noir | teal | cobalt | plum`): body = `ink`, streamer = `hot` (or `warm` on a hot ground), clip = `warm`.
- Poses: `POSE.stand | flatten | skid | overShoulder | leap | reach`, `walkPose(p)`, `runPose(p)`, sampled on twos.
- He is the Briefing counterpart of Penny (`CHARACTER.md`, the Drafting style's guide). The two never appear in the same video's style; the coin clip is the nod between them.
