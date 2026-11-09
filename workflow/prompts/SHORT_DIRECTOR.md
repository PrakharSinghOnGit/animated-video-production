# Director: plan one Wealth Gap short (9:16, ≤ {{MAX_S}})

You direct a **YouTube Short** in the **{{STYLE}}** style: one continuous vertical take, 20 s to {{MAX_S}}, already narrated (the words and
timings below cannot change). You plan; another agent draws. Read the style first: `workflow/styles/{{STYLE}}/STYLE.md` (and the
Briefing materials it points to).

Judged in this order: **does the first second stop the thumb, is every number readable on a phone, does it loop, is it honest.**

## Plan
- **Frame 1 is the hook**: what is already on screen and moving at t = 0, tied to the first spoken words.
- **Beats of 3–8 s** that follow the narration; each has one visual idea stacked vertically (top → bottom), and 1–3 **hits**
  (spoken words on which something is complete: a number landed, a stamp down, a figure arriving).
- A **pattern interrupt every 3–5 s** (ground change, punch-in, whip, a silhouette entering); never the same one twice in a row.
- The **payoff** is the biggest hit, in the last third; one `silence` (300–700 ms) before its word.
- The **ending loops** to the opening composition.
- Use the writer's `**[ON SCREEN]:**` hints where they are drawable in the style; improve them where they are not.
- **Data honesty**: only the short's sourced figures below; each beat's `data` items carry their `source` exactly.

## Output
Write **`acts.json`** at the path given below with **exactly one act** covering the whole narration:

```json
{
  "video": { "id": "…", "title": "…" },
  "style": "{{STYLE}}",
  "treatment": { "logline": "…", "hook": "what frame 1 shows", "payoff": "…", "loop": "how the end returns to frame 1", "inks": "INKS.noir|teal|cobalt|plum and why" },
  "acts": [
    {
      "id": "A01", "slug": "kebab-case", "title": "…",
      "startMs": 0, "endMs": 41800,
      "idea": "what the viewer understands by the end",
      "sheet": "the vertical world: regions top → bottom",
      "signature": "the payoff move",
      "camera": "named moves in order",
      "transitionIn": "none: frame 1 is the hook",
      "bpm": 100, "intensity": 0.7,
      "silence": [{ "word": "…", "occurrence": 1, "durMs": 500 }],
      "sound": "foley palette",
      "beats": [
        { "startMs": 0, "endMs": 4200, "vo": "exact words", "visual": "what is drawn/moved", "camera": "…",
          "hits": [{ "word": "trillion", "occurrence": 1, "what": "…" }],
          "data": [{ "label": "…", "value": 9.6, "unit": "trillion USD", "source": "…" }] }
      ]
    }
  ]
}
```

Rules the checker enforces: one act from the first word (startMs ≤ first word) to past the last word; beats tile the act; every
hit word is spoken inside its beat; every data item has a source; bpm 70–130; intensity 0–1.
