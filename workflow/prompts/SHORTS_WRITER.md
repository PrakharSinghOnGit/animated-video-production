# Shorts writer

{{INTRO}}

## Read first
{{SOURCES}}
4. The channel voice: `workflow/02-scripting/voice.md`. Hook method: `workflow/02-scripting/yt-script/SKILL.md` (formulas in `hooks.json`).
5. The visual style the shorts are drawn in (so your on-screen hints are drawable): `workflow/styles/shorts/STYLE.md`.
{{PREVIOUS}}
{{SERIES}}
## What a good short is here
- **Standalone.** One idea, one payoff, no "as I said", no setup the viewer missed. A stranger gets it in one watch.
{{KINDS}}
- **Hook in the first sentence** (≤ 12 words, under 3 s): a number, a contradiction or a direct question. No "In this video",
  no greeting, no channel name.
- **Payoff in the last third**, said plainly. Then **a loop line**: the last sentence runs naturally into the first when the
  short replays (the hook reads as the answer to the last line, or the last line re-asks the hook).
{{BRIDGE}}

## Hard rules
{{FIGURE_RULE}}
- **Length: {{MIN_WORDS}}–{{MAX_WORDS}} spoken words** per short (≤ {{MAX_S}} at the voice's pace, with pauses). Count them.
- Spoken English only in `**VO:**` lines: no parentheses, lists or markdown inside narration.
- No get-rich wording (guaranteed, secret, overnight, never lose, get rich), no financial advice phrasing ("you should buy").

## Output 1: one script per short → `{{SHORTS_DIR}}/S<n>/02-scripting/script_raw.md` (Write tool; write: {{IDS}})
Exactly this format (the voice pipeline parses it). One part, 4–9 beats; a beat is 1–2 short sentences:

```md
### Part 1: <the short's title>
**VO:** `[VO: punchy, fast, a little incredulous]` First line: the hook.
**[ON SCREEN]:** one concrete, drawable visual for this beat (vertical frame: stack things top to bottom)

**VO:** `[VO: quick, matter-of-fact]` Next beat.
**[ON SCREEN]:** ...
```
`[VO: tone]` is a delivery note: shorts are quicker and punchier than the long video, but never shouted. The last beat's
`**[ON SCREEN]:**` describes the loop back to the opening image.

## Output 2: the index → `{{INDEX}}` (Write tool), exactly this JSON:
```json
{
  "shorts": [
    {
      "id": "S1",
      "kind": "fact",
      "title": "≤ 60 characters, the short's YouTube title, honest, no clickbait wording",
      "hook": "the first sentence, verbatim",
      "payoff": "the line that pays it off, verbatim",
      "loop": "how the last line runs into the first",
      "why": "one line: why this makes a strong short",
      "from": "{{FROM}}",
      "words": 128,
      "data": [{ "label": "…", "value": 149, "unit": "%", "source": "{{DATA_SOURCE}}" }],
      "description": "2 short lines for the YouTube description (no hashtags, no links)",
      "hashtags": ["#Shorts", "#PersonalFinance", "#…"]
    }
  ],
  "notes": "fact-checks needed (unverified figures used), anything the creator should decide"
}
```
`data` lists every figure the short says, copied from the figures list with its source. `hashtags`: exactly 3, `#Shorts` first.

Reply with one line when done.
