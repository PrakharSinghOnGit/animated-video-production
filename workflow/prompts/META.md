# Publish: three packages (title + thumbnail idea), description and tags for a Wealth Gap video

You package one finished finance explainer for YouTube. First read the guide: `workflow/07-publish/GUIDE.md`. Its rules (sections 3, 4.2, 5, 6, 7, 10 and the title/description/metadata checklist in section 8) are binding; where this brief and the guide differ, the guide wins. Then read `workflow/01-ideation/AUDIENCE.md`: "The viewer in one sentence" is the stranger you are writing for.

## The job
The channel is small: almost everyone who sees a package has never heard of it. A package (a thumbnail and its title, read together in about two seconds) has to make that stranger stop. A package that describes the video (its topic's name, a diagram of its mechanism) gives a stranger no reason to care; one about the viewer's own problem does. The task lists the channel's earlier packages with their click rates: learn from which ones were clicked.

YouTube's Test & Compare tests up to three packages. You write **three packages, A, B and C, that are three different bets** on why a stranger clicks. A separate agent draws each thumbnail from your brief, so the brief and the axes you give are what it will draw.

### 1. Find the promise first
Before writing a title, find in the script the **one sentence** a stranger would repeat to a friend. Then find three different reasons to care about it. Each package uses a different **lever**:
- `stake`: what it costs the viewer. Their rent, their savings, their trade. "You" or "your" is in the title or plainly implied.
- `villain`: who is on the other side or who gains. Only someone or something the video names and sources; never an unnamed "they".
- `myth`: something the viewer was told that the video shows is wrong.
- `number`: one sourced figure that is hard to believe, with what it measures.
- `question`: the plain question a searcher types, in their words, which the video answers.

Three packages, **three different levers**. If the video has no named counterparty, do not force `villain`; if it has no startling sourced figure, do not force `number`.

### 2. Titles (GUIDE.md section 3)
- At most 100 characters, the whole promise inside the first 60, aim 35-55. Key words first. One honest sentence. No emoji, at most one ALL-CAPS word, no "!!!".
- **Plain words.** A term the viewer would have to look up (the video's own jargon, a trading term, an acronym) may appear in at most one title, the `searchable` one, and only if people really search for it. "X Explained" and "The Art of X" are labels, not promises: do not use them.
- `type`: at least one package is `searchable` (names the subject plainly, the topic words in the first 40 characters) and at least one is `curiosity` (a tension the video really answers). The third may be `number` (led by a sourced figure) or either.
- The three titles are three sentences, not one sentence reworded: the code rejects two titles that share most of their words.
- No get-rich wording (guaranteed, secret, overnight, never lose, get rich, "they don't want you to know"), no false urgency, nothing the video does not deliver.
- **Numbers**: only figures in the sourced-figures list below (410 thousand may be written $410K, 2190 as $2,190, never rounded into a different figure). Figures marked "narration only, unverified" are allowed but flagged for the creator.
- **Proof**: for each title, copy into `proof` the sentence of the script (word for word, 8 words or more) that pays the title off. It must be in the first two minutes; the code looks it up. If no such sentence exists that early, the title promises something the opening does not deliver: write a different title.

### 3. The thumbnail of each package (GUIDE.md 2, 3.7, 4.2)
The thumbnail and the title are two halves: the image carries the feeling or the stake, the title the why. Neither repeats the other, and together they leave a question open that the video answers.

Give each package its place on **four axes**. Every pair of packages must differ on at least two axes, and the three should use three different subjects:
- `subject`: `character` (the channel's character, as the viewer's stand-in, big in the frame) | `object` (one object from the viewer's life) | `data` (one shape made of numbers: a gap, a line, two bars) | `type` (the words are the image)
- `emotion`: `threat` (something is being taken) | `curiosity` (something is hidden or does not add up) | `payoff` (a way out, a fix)
- `text`: `none` | `word` (1-3 words) | `number` (a sourced figure plus at most 2 words)
- `composition`: `close` (one thing, cropped tight) | `scene` (a small actor in a big space) | `split` (two sides against each other)

`thumbText` is exactly the words on the image ("" for none): at most 3, never the title's words, never jargon, never a label for the picture. They are the stake or the feeling in the viewer's words. Do not reuse a word the channel's earlier thumbnails used (listed in the task).

`thumbnail` is the brief the designer draws from, one or two sentences: the one thing that fills the frame, what it is doing, the one supporting element if any. Things from the viewer's life, not the video's diagrams (no candlesticks, chart patterns or labelled mechanisms). It must be something the video shows or states.

`hypothesis`: one line, "if this wins, the audience clicks for ...". It is what the test teaches.

### 4. Description, tags, hashtags
- **Description body** (GUIDE.md 5.1, 5.2): only the opening. Two lines (about 150 characters) holding the promise and the main keyword, no link, no hashtag, not a copy of a title; then 2-4 sentences on what the video covers and which data it uses (the date range of the data when the plan gives it). Mark any illustrative or modelled figure as an example. **Do not write** chapters, sources, credits, the disclaimer or hashtags: the code adds them.
- **Tags** (GUIDE.md 5.5): at most 10, short: the channel name, the topic, common misspellings of tricky terms. No competitor names. Together under 400 characters.
- **Hashtags**: exactly 3, relevant, in the form `#PersonalFinance`.

## Inputs (read them; do not guess)
Paths, the figures list, the channel's earlier packages with their click rates, and the package the video was planned around (when there is one) are in the task below. Read the script (the narration is what the video says), the plan's treatment and acts, and the sources.

## Reply
Reply with ONLY this JSON object (no prose around it):
```json
{"promise": "the one sentence a stranger would repeat",
 "packages": {
  "A": {"title": "...", "type": "searchable", "lever": "question", "proof": "a sentence copied from the script",
        "axes": {"subject": "object", "emotion": "threat", "text": "word", "composition": "close"}, "thumbText": "...",
        "thumbnail": "the brief for the designer", "rationale": "one line: why a stranger clicks this", "hypothesis": "if this wins, the audience clicks for ..."},
  "B": {"title": "...", "type": "curiosity", "lever": "myth", "proof": "...", "axes": {"subject": "character", "emotion": "curiosity", "text": "none", "composition": "scene"}, "thumbText": "", "thumbnail": "...", "rationale": "...", "hypothesis": "..."},
  "C": {"title": "...", "type": "number", "lever": "number", "proof": "...", "axes": {"subject": "data", "emotion": "threat", "text": "number", "composition": "split"}, "thumbText": "...", "thumbnail": "...", "rationale": "...", "hypothesis": "..."}},
 "order": ["B", "A", "C"],
 "descriptionBody": "...", "tags": ["..."], "hashtags": ["#...", "#...", "#..."]}
```
`order` is the upload order, strongest first: when a test ends "Inconclusive" (likely on a small channel), YouTube keeps the first one uploaded.
