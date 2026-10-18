# Step 2: Scripting & Retention Architecture (Manual)

This step produces the complete shooting script with synchronized visual direction and voiceover tone annotations.

> **Note:** There is **no automation code** in this folder. It provides the script templates, retention guidelines, and LLM writing prompts to format scripts correctly for Step 3.

---

## 📂 Workspace Folder Structure

In `workspace/<VIDEO_ID>/02-scripting/`:

```
workspace/<VIDEO_ID>/02-scripting/
├── outline.md          # 7-part retention beat sheet
└── script_raw.md       # Full production script with visual cues and voiceover tags
```

---

## 📜 Script Format Contract for Step 3 (Voiceover)

To ensure the automated TTS parser in **Step 3** can automatically process your script, every spoken line must strictly follow this syntax:

```markdown
**[CLIP X - 0:00–0:05]:** Description of 4K B-roll, motion graphic, or meme overlay.
**VO:** `[VO: Tone, emotion, or pacing instruction]` Spoken line of the script.
```

### Examples:
```markdown
**[CLIP 1 - 0:00–0:03]:** Fast 4K drone zoom into Wall Street, cutting abruptly to a chaotic trading floor.
**VO:** `[VO: Intense, dramatic, hushed movie-trailer tone]` There is a shadow market out there that is bigger than the stock market, bigger than the bond market...

**[REHOOK 1]**
**[CLIP 10]:** Calendar pages flipping rapidly, followed by a red downward arrow smashing cash.
**VO:** `[VO: Sarcastic, dramatic shift]` But here is where the currency market decides to ruin your vacation before you even pack your bags.
```

---

## 🏗️ 7-Part Video Structure

1. **Part 1: The Hook (0:00–0:30)** — Shocking scale, high stakes, movie trailer tone, cliffhanger trap.
2. **Part 2: The Relatable Story (0:30–1:30)** — Everyday analogy (e.g. holiday currency exchange) proving the problem.
3. **Part 3: The Global Scoreboard (1:30–3:00)** — The underlying system (pairs, macroeconomic tension).
4. **Part 4: The Puppet Masters (3:00–5:30)** — Central banks, rate hikes, expectation vs reality.
5. **Part 5: The Empire / History (5:30–8:00)** — Reserve currencies, superpower cycles, trust cracking.
6. **Part 6: The Trap & How Pros Play (8:00–10:30)** — Leverage, wipeouts, institutional hedges.
7. **Part 7: The Bedrock Aha-Moment & CTA (10:30–12:00)** — Mindset transformation + subscribe CTA.
