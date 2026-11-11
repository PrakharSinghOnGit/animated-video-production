# Step 2: Script

The creator's plain-text draft becomes a narration script that is researched, fact-checked by a program and reviewed
for retention before the creator approves it (gate G1a). Full run-book: `VIDEO_PRODUCTION.md`, Step 1.

```
workspace/<ID>/02-scripting/
├── idea.md          your draft: plain text; [square brackets] are instructions to the writer, never narration
├── research.md      optional web research: facts with a link and a quoted sentence (✓ = the program found it on the page)
├── script_raw.md    the script: ### Part / ### CHAPTER n, **VO:** beats with a `[VO: tone]` note, **[ON SCREEN]:** hints
├── script_notes.md  hooks and scores, source gaps, what changed, open-questions map, questions for you
├── claims.json      every factual claim the narration makes, with its source (written by the writer)
├── factcheck.md     the program's check of those claims: what needs YOUR fact-check, what is sourced
├── retention.md     the retention pass: likely drop-off points and suggested cuts (a review, never applied by itself)
├── feedback.md      your notes for a revision
└── approved.json    written by --approve; the voice step refuses an unapproved script
```

| Command | What it does | Cost |
|---|---|---|
| `bun run research --video <ID>` | researches the draft's claims and missing figures on the web; each quote is checked on its page | free (agy) |
| `bun run write --video <ID>` | writes or revises the script, the notes and the claims list, then prints the fact check and the free statistics | 💲 ~$1–2 |
| `bun run write --video <ID> --check` | rebuilds `factcheck.md` and the statistics after you edited the script by hand | free |
| `bun run research --video <ID> --claims` | searches a source for every claim the fact check could not source | free (agy) |
| `bun run retention --video <ID>` | second, cheaper reviewer: marks where viewers will leave and proposes cuts | 💲 small |
| `bun run retention --video <ID> --to-feedback` | puts those suggestions into `feedback.md` for the next `bun run write` | free |
| `bun run write --video <ID> --approve` | shows the fact check once more and locks the script | free |

## How a claim counts as sourced
The writer has no web access, so a URL it remembers is not a source. A claim in `claims.json` is **sourced** only when
its URL is a ✓ fact of `research.md` (the program opened the page and found the quoted sentence) or a link you put in
`idea.md`, and it says what that page says. Everything else is listed under **Needs your fact-check**. The program also
lists every figure the narrator says that the writer did not declare, so nothing is kept silently. Approving with open
items is allowed, is shown, and is recorded in `approved.json`.

## Files here
- `write_script.ts`, `research.ts`, `retention.ts`: the three commands. Prompts: `workflow/prompts/WRITER.md`, `RETENTION.md`.
- `script_lib.ts`: reads a script without a model (spoken words, times at 150 wpm, free retention statistics, the claims check).
- `research_lib.ts`: how other steps read `research.md`.
- `voice.md`: the channel voice (edit it). `yt-script/`: the hook formulas and `hookscore.py`.
