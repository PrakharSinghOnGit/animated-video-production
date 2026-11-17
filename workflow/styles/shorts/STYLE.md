# Shorts — Briefing, vertical and loud

> The Wealth Gap's 9:16 shorts (60 s by default; a short may be given up to 3 min): the same cut-paper spy world as the long-form **Briefing** style (read
> `workflow/styles/briefing/STYLE.md` §1–3 for materials, inks and colour logic; they all still apply), re-staged for a phone
> held in one hand, a thumb ready to swipe, and the sound often off. Same paper, same inks, same honesty; double the tempo.

## 1. What changes from Briefing (and what doesn't)

| | Briefing (long-form) | Shorts |
|---|---|---|
| Frame | 1920×1080 | **1080×1920**, safe area `SAFE` = x 64..930, y 220..1440 (YouTube's buttons cover the right ~12%, the title/channel overlay the bottom ~22%, the top bar ~11%) |
| Length | 8–10 min, acts of 45–120 s | **one act, 20 s up to the short's limit** (60 s default, up to 180 s), one continuous take; past a minute, a new visual idea or reveal every ~15–20 s keeps it moving |
| First second | hook within 10 s | **the hook is on screen in frame 1**: the biggest number or the question already cut and landing; no whip-in, no empty ground |
| Tempo | calm, one idea at a time | **fast but readable**: a new visual hit every 1.5–3 s, impact text held ≥ (characters ÷ 15 + 0.8) s |
| Camera | calm focus moves 1.1–2.8 s | `focusCam(…, { pace: 0.45, hold: 0.3, snap: true })`: 0.5–1.3 s moves, punch-ins, whips **allowed every ~5 s**; still never leaves unfinished work |
| Text | impact text only, no subtitles | impact text **plus kinetic captions** (`shortCaption`): 1–3 spoken words at a time, the spoken word in the hot ink |
| End | brand end card | **a loop**: the last frame matches the first (same ground, same shape) so the replay is seamless; no logo, no end card, no "subscribe" card |
| Chapters | iris/strip wipes, chapter cards | none (one take) |
| Unchanged | flat inks, scissor-cut pieces, cut gaps, paper shadow, League Gothic numbers, silhouettes on twos, money = warm on a black keyline, **only sourced numbers**, no gradients/fades/dissolves | |

## 2. Vertical composition

- **Stack, don't spread.** Build the world in tall columns: a number above a figure above a floor; a bar chart is a tower; a timeline runs top → bottom. The camera pans **vertically** more than sideways.
- **One subject per frame**, filling 50–80% of the safe width. Headline numbers ≥ 160 px cap height on screen (League Gothic size ≥ 210), set labels ≥ 40 px.
- **Captions own the band at ~74% height** (y ≈ 1330–1450). Keep impact text and key action **above y 1250**; the ground can run under the captions.
- Nothing important right of x 930 or below y 1440 (YouTube's overlays). Grounds and floors bleed off every edge.

## 3. Hook, retention, loop

- **Frame 1 is a hook**: the act opens mid-motion (`open: "none"`), the first impact text landing on the first spoken word. A swipe decision takes under a second.
- **Pattern interrupt every 3–5 s**: a ground change (paper → hot → ink), a punch-in, a whip, a stop-time, a silhouette entering. Never two of the same in a row.
- **Payoff late**: the number or answer the hook promised lands in the last third, as the act's biggest hit (stop-time or spotlight freeze allowed once).
- **Loop**: the last 0.5 s returns to the opening composition (same ground and the same shape where the hook started) and the script's last line runs into its first; end with `close: "none"`.
- **Bridge to the long video** is spoken in the script if at all ("full breakdown on the channel"); never a card, never a logo.

## 4. Kinetic captions

`shortCaption(h, ctx, { inks: K })` in `drawAct`'s overlay draws 1–3 words at a time in cut League Gothic on a scissor-cut paper strip, stamping in on each chunk's first word, the spoken word in the hot ink. Rules: one caption call per act; hide it (`hideAt`) while a giant impact number is saying the same word; never put impact text in the caption band; the strip colour comes from the act's ink set (paper strip, ink letters), so on a paper ground switch to `{ inks: { ...K, paper: K.ink, ink: K.paper } }` for contrast.

## 5. Motion

- Anticipation 0.15–0.35 s (shorter than long-form), hits complete on the word's start.
- Puppets on twos, camera and type on ones (as Briefing).
- Snap zoom: a `focusCam` action with a tight rect right after a wide one (moves 0.5–1.3 s at `pace: 0.45`). For a true snap, use one `whip(a, b, u)` over 0.35–0.5 s through `drawAct`'s `cam` (it blurs).
- **Stop-time** once at most, on the payoff.

## 6. Sound

Foley is denser than long-form (a slap, slide or click on every visual hit) and slightly louder; a `whip` on each whip; a `riser` into the payoff and an `impact` on it. A music bed is mixed in (procedural spy palette, ~14 LU under the voice; `bun run shorts --no-music` drops it); leave silence before the payoff word (one `silence` in the plan).

## 7. Pitfalls

- A short that starts on an empty ground or a slow whip-in loses the swipe: the hook must already be moving at t = 0.
- Horizontal layouts squeezed into 9:16 leave tiny subjects: stack the world vertically and push in.
- Captions over impact text read twice: hide one.
- Content under the right-hand buttons or the bottom overlay is invisible on a phone (the frames report flags it).
- Numbers: only the plan's `data` (copied from the long video's sourced plan). A short is clipped and re-shared more than a long video: a wrong number travels further.

## 8. Engine

Same `spy` kit (`packages/kit/src/spy/`, API in its `README.md`); the canvas is 1080×1920 automatically (the composition size). Read `ctx.W` / `ctx.H` and `SAFE` inside `draw`, never module-level constants. Shorts helpers: `shortCaption`, `shortChunks`, `capText`, `vertical()` (`packages/kit/src/spy/shorts.ts`).
