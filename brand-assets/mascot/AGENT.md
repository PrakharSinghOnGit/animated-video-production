# The Agent — the Briefing style's recurring hero

The man in the hat from the Briefing style, made into the channel's recurring character (2026-11-02). He is the viewer's stand-in: the saver, the trader, "you". A cut-paper figure in a dark suit; since 2026-11-20 he has a **face** (a paper face plate with ink brows, eyes and mouth) and a **front view**, so viewers see what he feels (the creator's AI-made thumbnails showed how much an expression carries). What makes him *him* is a small signature no one else in the story wears.

**The drawing code is the source of truth:** `figureSide(g, x, y, s, pose, { hero: true, col, accent, paper, warm, expr })` (profile, `packages/kit/src/spy/chars.ts`) and `figureFront(g, x, y, s, FRONT.<pose>, { hero: true, ... })` (facing the viewer, `front.ts`); the face is `face.ts`. Never draw the signature by hand. Sheet: `agent_sheet.png` (re-render: `bunx remotion still packages/kit/src/spy/preview/Root.tsx AgentSheet brand-assets/mascot/agent_sheet.png --gl=angle`; re-render it in the same commit as any change to `chars.ts`).

## Look

| Part | Spec |
|---|---|
| Body | the Briefing cut-paper figure, ~7 heads tall, fedora and suit, cut slits at the joints, lapels, pockets and buttons as cuts; `s = 1` is ~540 px tall, 0.6 the usual scene scale. Profile (`figureSide`) and front (`figureFront`, head drawn 1.25× so the face reads) |
| Signature 1 | three slanted cuts in his hatband (the three bars of the channel logo) instead of the extras' single straight slit |
| Signature 2 | a gold coin tie clip on his necktie: the warm (money) ink on a black keyline, so it follows the style's rule that money is warm on black; front view adds a pocket square in the accent |
| Necktie | the chapter's one accent: a knot and a blade that widens to a point (it flies behind him when he runs) |
| Face and hands | skin = the set's paper warmed toward its money colour (`skinOf`); ink features. `expr`: `neutral, happy, smile, smug, worried, scared, shocked, sad, angry, thinking, doubt` (`EXPR`, or your own `{brow, browY, eye, mouth, quirk}`); `look: [x, y]` moves the eyes; `blink: blinkAt(t)` keeps a hold alive; `mixExpr(a, b, k)` eases a reaction |

## Rules

- `hero: true` on the figure who is "you" / the protagonist; every other person is an extra without it. At most one Agent on screen.
- Inks follow the chapter's set (`INKS.noir | teal | cobalt | plum`): body = `ink`, streamer = `hot` (or `warm` on a hot ground), clip = `warm`.
- Profile poses: `POSE.stand | flatten | skid | overShoulder | leap | reach`, `walkPose(p)`, `runPose(p)`, sampled on twos; any pose can carry `expr` / `look`.
- Front poses (`FRONT`): `stand | shrug | handsUp | point | offer | cheer | chin | clutch | slump`; `mixFront(a, b, k)` blends two. Fields: `shL/elL/shR/elR` (arms), `fsL/fsR` (upper arm toward the camera), `handL/handR` (`open | palm | fist | point`), `lean, bob, head, nod, hunch, stance, knee`. Returns `{ wristL, wristR, head }` for props (`clutch`: the prop sits between the wrists).
- Use the front view for the beats that face the viewer: a reaction to a reveal, a question to the camera, the payoff. Profile for action (walking, running, reaching). Extras stay faceless silhouettes unless one is a featured person (`face: true` or an `expr`).
- He is the Briefing counterpart of Penny (`CHARACTER.md`, the Drafting style's guide). The two never appear in the same video's style; the coin clip is the nod between them.
