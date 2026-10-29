# PUBLISH_GUIDE: YouTube packaging for "The Wealth Gap"

Scope: thumbnail, title, description, tags, chapters, A/B testing for a faceless 8-10 min personal-finance explainer channel in the hand-drawn "Briefing" style (dossier, inked drawings, paper texture).
Readers: AI agents that generate 3 thumbnails + 3 titles + 1 description per video, and a vision critic that reviews thumbnails.
Limits checked: 2026-10-29 (YouTube Help pages fetched that day). Platform limits change; every limit below is "as of 2026-10-29".

Tagging used in this guide:
- [YT] = stated on a YouTube Help Center page (primary).
- [3P] = third-party source (blog, study, secondhand summary). Weaker.
- [REC] = this guide's recommendation or inference. Not a platform rule, not sourced.
- [UNVERIFIED] = could not confirm from a primary source. Treat as a working assumption and re-check.
Source numbers like [S3] point to the Sources list at the end.

---------------------------------------------------------------------
## 0. The ten rules that matter most

1. The title and thumbnail are one package. The thumbnail makes one visual claim, the title adds the missing half; neither repeats the other. [REC; supported by S12]
2. The video must deliver exactly what the package promises. Misleading titles/thumbnails/descriptions are a policy violation ("maliciously misleading", S5) and viewers leave, which hurts discovery (S12).
3. Thumbnail: one focal object, at most 3 words of text, readable at about 168x94 px. [REC; S12 says keep it simple and readable]
4. Keep text and key objects out of the bottom-right corner (duration badge) and the bottom edge (progress bar). [3P, S15]
5. Upload 16:9, 1920x1080 or larger (YouTube recommends 3840x2160; minimum width 640 px), JPG or PNG, under 2 MB to be safe on mobile uploads. [YT, S2]
6. Title: key words first, aim for about 30-50 characters, hard cap 100. Anything past about 60-70 characters may be cut off in feeds. [YT for 100 and "key words first" S3,S12; 30-50 and 60-70 are 3P S10]
7. Finance titles: a specific, sourced number beats a vague promise. Never state a number the video does not source. [3P S10 for the effect; the sourcing rule is house policy]
8. Test & Compare takes up to 3 variants (thumbnails, titles, or both). The winner is chosen by watch-time share, not click rate. Make the 3 variants three different concepts. [YT S1]
9. Description: put the hook and the promise in the first two lines; chapters start at 00:00, at least 3, each at least 10 s; at most 3 hashtags are shown near the title. [YT S4,S6; the "first two lines" length is UNVERIFIED]
10. Tags barely matter. Do not spend time on them (YouTube says so, S3, S7). Spend it on the thumbnail and title.

---------------------------------------------------------------------
## 1. Technical specs (as of 2026-10-29)

| Item | Limit | Source |
|---|---|---|
| Thumbnail resolution | 3840x2160 recommended, minimum width 640 px | [YT] S2 |
| Thumbnail aspect ratio | 16:9 | [YT] S2 |
| Thumbnail formats | JPG or PNG | [YT] S2 |
| Thumbnail file size | 2 MB on mobile upload, 50 MB on desktop | [YT] S2 |
| Custom thumbnails need | a verified account | [YT] S2 |
| Title | 100 characters max, no "invalid characters" (not defined) | [YT] S3 |
| Description | 5,000 characters max | [YT] S3 |
| Tags | No limit stated on the Help page. "500 characters combined" appears on third-party sites only | [UNVERIFIED] S3 |
| Hashtags | Up to 3 shown near the title; if more than 60 hashtags, all are ignored | [YT] S6 |
| Chapters | First timestamp 00:00; at least 3 timestamps; ascending order; each chapter at least 10 s | [YT] S4 |

Notes:
- Working default for this channel [REC]: export 1920x1080 PNG or high-quality JPG, check file size under 2 MB, and keep a 3840x2160 master if the canvas render allows it. The Remotion canvas render should be a still of the thumbnail composition, not a video frame screenshot at 720p.
- A conflicting 2018 secondary source says hashtags are ignored above 15. The current YouTube Help page says 60. Use 3 anyway. (S6, S16)

---------------------------------------------------------------------
## 2. Thumbnail rules

### 2.1 What YouTube itself says (short list)
From the Help page "Thumbnail & title tips" (S12):
- Match the image to the audience: subscribers respond to familiar faces, casual viewers to universal emotions and actions.
- Use the rule of thirds, then add branding and text.
- Use an easy-to-read font.
- Keep the design simple; too much color and composition "can overwhelm it".
- Thumbnails display differently on different devices; use the largest image size possible.
- Audience taste changes; test updating older thumbnails.
- To check a thumbnail: look at CTR on Home and Suggested in the first 24 hours (general audience) and Subscriptions feed (subscribers).
The page gives no numeric text-size, word-count or safe-zone rules. Everything numeric below is [REC] or [3P].

### 2.2 Small-size legibility (the main test)
- Display sizes vary. Third-party sources give about 168x94 (suggested/sidebar), about 116x65 (small mobile contexts), about 320x180 (home feed), about 360x202 (search). [3P, S15] These are [UNVERIFIED] as exact numbers.
- Test: downscale the final image to 168x94 and look at it. If the main object or the words cannot be identified in 1 second, fail. [REC]
- Also test at 120 px wide (squint test). The object silhouette should still be recognisable. [REC]
- Thin pen lines (the hand-drawn look) vanish at small sizes. Use stroke weights at least about 1.5% of image height for the focal object, and fill with flat ink colour instead of relying on hatching. [REC]
- Paper texture, grain and halftone must not reduce contrast on the focal object. Texture belongs in the background at low contrast. [REC]

### 2.3 Words on the thumbnail
- 0 to 3 words. 4 is a fail unless one is a number. [REC]
- Cap-height of text at least about 12% of image height (so that it is still about 11 px tall at 94 px image height). [REC]
- Text must add information the title does not give, or give the emotion/stakes in one word ("TRAP", "$0", "RIGGED"). Never copy the title. [REC; the idea of title+thumbnail complementing each other is common creator advice, not found in a primary source, UNVERIFIED]
- Text contrast: dark ink on cream, or cream/white on near-black ink, with a thick outline or solid block behind. Minimum contrast ratio 7:1 for thumbnail text (stricter than WCAG 4.5:1 because of the shrink). [REC]
- Words must be true. A "$1M" on the thumbnail must be a number the video sources.

### 2.4 One focal point, composition
- One dominant object or one clear relationship (for example a big coin next to a small coin). Not a collage. [REC; S12 "keep it simple"]
- Place the focal point on a rule-of-thirds intersection (S12), away from the bottom-right corner.
- Foreground object at least about 35-40% of the image height. [REC]
- Maximum 3 distinct elements counting text. [REC]
- Leave the top-left and left-centre for the lead element since western readers scan left to right; the title appears beside or below it. [REC]

### 2.5 Safe zones
- The duration badge sits in the bottom-right corner of the thumbnail; a watched-progress bar can cover the bottom edge. [3P, S15] YouTube's Help pages do not give dimensions. [UNVERIFIED]
- Rule [REC]: no text or key detail in the bottom-right 22% of width x 18% of height, and nothing important in the bottom 6% of height.
- Rule [REC]: keep all key content inside the central 80% of the frame (S15 suggests the same).
- Rounded corners are applied by the player in some surfaces. Leave a margin of about 3% on every side. [REC, UNVERIFIED for exact crop]

### 2.5b Dark and light YouTube themes
- Thumbnails sit on a white page (light theme) or near-black (dark theme). Check the image against both. [REC]
- A cream paper background with no border can bleed into the white light-theme page and lose its edge. Add a defined edge: a dark inked border or a clearly darker vignette. [REC]
- A very dark thumbnail disappears on dark theme. Keep a mid-tone or bright element at the edges. [REC]
- Critic: render a mock of the thumbnail on #FFFFFF and on #0F0F0F, both at 168 px wide, and confirm the edge is visible in both.

### 2.6 Colour and contrast
- Aim for 3 colours or fewer plus paper and ink: for Briefing, paper cream, ink black, and one accent (stamp red or highlighter yellow/orange). [REC; consistent with S12 "too much color overwhelms"]
- The focal object has the highest saturation or the highest contrast on the image. The background is lower contrast. [REC]
- Strong sentiment (positive or negative) in thumbnails correlated with more views in a peer-reviewed study of 16,215 video covers (Cui et al., 2024). Correlation only. [3P, S11]
- Check in greyscale: the focal object and text must still separate. [REC]
- Avoid red text on a green or orange background and thin yellow on cream (low luminance contrast). [REC]

### 2.7 Faces vs faceless alternatives
- YouTube notes faces/emotions work for some audiences (S12). The channel is faceless, so use these substitutes [REC]:
  1. Inked character with an exaggerated expression (a hand-drawn dossier figure, a stick-figure saver) with eyes visible at small size.
  2. A single object metaphor: a lopsided scale, a shrinking piggy bank, a tilted ladder with missing rungs.
  3. A data image with one number: a bar or a gap between two lines, with the gap highlighted.
  4. A dossier/stamp device: "CLASSIFIED", a redacted line, a red circled item. Branded and recognisable at small size.
- A face-like element (eyes on an object, a character looking at the gap) is a cheap way to add "someone is reacting". Test it as one of the variants. [REC, UNVERIFIED benefit]
- Do not use claims like "an expressive face adds 18-32% CTR": the only source found is an unsourced blog. [UNVERIFIED]

### 2.8 Channel consistency
- Every thumbnail shares: paper background colour, ink style, one font family, one accent colour, a fixed position for the tag or stamp. Subject varies; frame does not. [REC]
- Do not use more than one display font. Pick a heavy, condensed, high-legibility face; hand lettering is fine only if letterforms stay open at small sizes. [REC]
- Consistency is a brand rule; it never beats the legibility rule. If they conflict, drop texture, keep contrast.

### 2.9 Honesty
- The thumbnail may use a metaphor, but must not show a result the video does not show (a fake pile of cash, fake chart data). YouTube's spam policy prohibits "maliciously misleading titles, thumbnails, descriptions, or imagery" (S5).
- Any chart or number in the thumbnail must match the video's sourced data exactly or be explicitly illustrative in the video. [REC]

---------------------------------------------------------------------
## 3. Title rules

### 3.1 Length and truncation
- Hard cap: 100 characters. [YT S3]
- YouTube says: keep titles short because viewers may see only part; put key words first; put episode numbers and branding at the end. [YT S12] YouTube gives no number for truncation. [UNVERIFIED as exact]
- 30-50 characters performed best in a correlational study of 18,080 channels (100K-100M monthly views); 90+ characters had lower views; mobile truncation quoted as about 60-70 characters without a source. [3P S10; correlational, thumbnails and topic not controlled]
- Rule [REC]: target 35-55 characters, hard limit for the main promise at 60. Everything after character 60 is bonus, not required to understand the video.
- Limit ALL CAPS and emoji; use for one emphasis only. [YT S12] For this channel: no emoji, at most one all-caps word. [REC]
- No ALL CAPS duplicates of the thumbnail text.

### 3.2 Curiosity vs clarity
YouTube names two kinds of titles (S12):
- Searchable titles: set clear expectations for viewers looking for the topic.
- Intriguing titles: spark curiosity for viewers who are not searching.
Rule [REC]: each batch of 3 titles includes at least one searchable title (names the subject plainly) and at least one intriguing title (names a tension or a puzzle, with the answer in the video).
- The AIR study says curiosity language ("what nobody tells you", "the real reason") is the one positive signal that transferred across niches. Correlational. [3P S10]
- Curiosity must be honest: the video answers it within the first minute or two. A leaked MrBeast production memo is reported to say the first minute should deliver on the thumbnail's promise (S13). The memo's authenticity is unconfirmed (S13), so treat as colour only. [UNVERIFIED]

### 3.3 Search vs browse
- Search viewers type a need ("how does compound interest work"). Browse viewers (Home, Suggested) respond to curiosity and relevance. [REC, consistent with S12]
- For explainers, use the plain topic keyword in the first 40 characters of at least one title, and in the first sentence of the description. [REC]
- Do not stuff keywords. A title is one human sentence.

### 3.4 Numbers
- In the AIR study, numbers helped in Business and Finance, specifically dollar amounts, percentages and timeframes; decorative numbers did not help; no effect sizes were given. [3P S10]
- A claim that titles with numbers get fewer views (about 11%) came from a summary I could not trace. [UNVERIFIED]
- Rule [REC]: use a number only when it is a real, sourced figure from the video (e.g. a median, a percentage, a year). Put the year or country in the title if the data is year- or country-specific.

### 3.5 Misleading claims (do not do)
- No title that promises something the video does not show (S5). YouTube lists the example of a full match in the title with only a clip in the video.
- No guaranteed returns, no "how I made $X" unless it is the channel's own documented result.
- No false urgency ("before it is too late") unless a real dated deadline exists.
- No fake authority ("banks do not want you to know"), no unnamed "they".
- Violations can lead to removal, strikes or loss of monetisation (S5).

### 3.6 Patterns for finance explainers (ILLUSTRATIVE ONLY, not quotes, not real titles)
- Gap pattern: "Why [group A] Keep Falling Behind [group B]"
- Mechanism pattern: "How [Mechanism] Quietly Costs You [Sourced Number]"
- Myth pattern: "The [Common Belief] That Isn't True"
- Comparison pattern: "[A] vs [B]: Which One Actually Wins Over 30 Years?"
- Question pattern: "Is [Common Thing] Worth It? (The Numbers, [Year])"
- Mistake pattern (AIR notes negative framing works when it flags a mistake to avoid, S10): "The [N] Money Mistakes That ..." only if the video really has N items.
- Rule of thumb [REC]: noun for the topic + verb for the tension + one sourced number or timeframe.

### 3.7 Title-thumbnail pairing (check for each of the 3 packages)
- The thumbnail shows the "what" (image, one or two words); the title gives the "why/how" or the stakes.
- Both point at the same single idea. No second topic.
- Read thumbnail text then title: it should read as one sentence or one question and answer; if the same words appear twice, rewrite one. [REC]

---------------------------------------------------------------------
## 4. A/B testing with Test & Compare (as of 2026-10-29)

### 4.1 Facts
From the YouTube Help page "Test & Compare" (S1), fetched 2026-10-29:
- You can test titles only, thumbnails only, or titles and thumbnails together.
- Up to 3 titles and/or thumbnails per test.
- Desktop only, in YouTube Studio. Advanced features must be enabled (account verification, per S1/S9).
- Not eligible: Shorts, scheduled Lives, Premieres until they end, made-for-kids videos, mature/age-restricted-flagged and private videos. Live archives are eligible.
- Test should finish within two weeks; a few days is possible depending on impressions and how recently the video was published.
- Winning metric: watch time share, not CTR. YouTube says it optimises for watch time because it better reflects whether viewers found the video worthwhile.
- Results: Winner (statistically significant), Performed Same (pick what you prefer), Inconclusive (first uploaded title and thumbnail becomes default).
- A small share of viewers may be a control group seeing only the default; their data is excluded.
- Changing the title or thumbnail during a test stops the test.
- YouTube's own advice: test older videos first, and use meaningfully different variants, since similar variants make a winner harder to identify.
Title testing: Search Engine Journal (2025-12-04) reports that title A/B testing was expanded to all creators with advanced features, announced via the Creator Insider channel, long-form only, desktop only (S9). I did not find the Creator Insider video itself; the Help page (S1) confirms titles are testable. A third-party site disagrees about eligibility (says Partner Program only) and about the metric (CTR plus watch time); the Help page is the authority. [3P S9; discrepancy noted]

### 4.2 What this means for a 3-variant design [REC]
- Because the metric is watch-time share, a thumbnail that gets clicks and then loses viewers will lose. Do not optimise for shock.
- Variants must differ by concept, not by tweak. YouTube warns that similar variants make a winner hard to find (S1).
- Concept axes to vary (change at least two axes between every pair):
  1. Subject: object metaphor vs data/gap vs inked character vs dossier/stamp device.
  2. Emotion/angle: threat (what you lose) vs curiosity (what is hidden) vs payoff (what you can fix).
  3. Text: none vs one word vs a number.
  4. Composition: close single object vs wide scene vs split two-sided comparison.
- Not valid variants: colour shifts, font swaps, 5% size changes, moving text by a few pixels.
- Example set (illustrative): A = split comparison, two piles of different size with the gap circled in red, text "THE GAP"; B = one inked character looking at a locked vault, no text; C = a dossier page with a redacted line and a stamped number. Three concepts, three emotions.
- Titles: do the same. One searchable (plain topic), one curiosity/tension, one number-led. They should be different sentences, not reworded versions.
- Test the thumbnails and titles in the same test only when each thumbnail-title pair is a deliberate package. If the aim is to learn which thumbnail concept works, keep one title fixed first, then test titles on that winner. [REC; Help page allows both]

### 4.3 Operating rules [REC]
- Pre-write the hypothesis in one line per variant (what viewer need it tests).
- Do not edit the title or thumbnail during the test (it stops it, S1).
- Record result type (Winner / Same / Inconclusive) and the concept that won, in the video notes, so the next batch learns.
- Do not over-read one result; a "winner" on one video is a hint, not a law.
- A small channel may not get enough impressions in 2 weeks; "Inconclusive" is a likely outcome. [REC, inference from S1]
- Check CTR on Home/Suggested in the first 24 hours as YouTube suggests (S12) for an early read, but decide with the test result.

---------------------------------------------------------------------
## 5. Description, chapters, hashtags, tags

### 5.1 Above the fold
- How much text shows above "Show more" is not stated on the Help pages I fetched. Third-party sites claim about 100-160 characters before the fold. [UNVERIFIED S3, 3P]
- Rule [REC]: the first 2 lines (about 150 characters) must stand alone: the promise of the video, the main keyword, and one sourced fact if possible. No links, no "subscribe", no hashtags at the start.
- Do not copy the title as line 1; extend it.

### 5.2 Recommended description structure [REC]
1. Line 1-2: hook and promise (as above).
2. 2-4 sentences: what the video covers, what data is used, the date range of the data.
3. Chapters (see 5.3).
4. Sources and credits: each sourced figure with publisher, dataset/title, year, and URL. Say which numbers are illustrative.
5. Disclaimer (see section 6).
6. Credits for music, art assets, fonts and tools, if their licences require it.
7. Links (channel, playlist, next video), then up to 3 hashtags at the end.

### 5.3 Chapters (YouTube rules, S4)
- First timestamp must be 00:00.
- At least 3 timestamps, in ascending order.
- Each chapter at least 10 seconds.
- Put them in the description and save. Creator chapters override automatic ones.
- The Help page does not specify the separator. Common format used in practice: `00:00 Title` on its own line. [REC; the page points to an example video for format]
- For this channel [REC]: 5-8 chapters for an 8-10 min video; names are 2-5 words, plain, and carry a keyword ("What is a real return", not "Part 3"). Do not put spoilers that kill the curiosity of the title. Timestamps come from the act timings (`timings.json`), not guessed.
- Check the last chapter is at least 10 s before the end card hold.
- Automatic chapters are not available on channels with active strikes (S4). Do not rely on them.

### 5.4 Hashtags (S6)
- Up to 3 hashtags from the description are shown near the title; YouTube picks which, by engagement. All hashtags still appear in the description.
- More than 60 hashtags makes YouTube ignore all of them. Over-tagging and unrelated hashtags can lead to removal.
- No spaces: #PersonalFinance or #personalfinance.
- Hashtags are links to results pages; they are not a ranking lever.
- Rule [REC]: use exactly 3, relevant, last line of the description. Example (illustrative): #PersonalFinance #MoneyExplained #WealthGap.

### 5.5 Tags (S3, S7)
- YouTube: tags are "descriptive keywords to help correct search mistakes", useful mainly when content is commonly misspelled; otherwise a "minimal role". Title, thumbnail and description matter more for discovery.
- Rule [REC]: 5-10 short tags max: the channel name, the main topic, and common misspellings of any tricky term (names, "401(k)", "SIP"). Do not put tags in the description (YouTube treats excessive tags in the description as spam, S3).
- Do not copy competitor tags; do not add tags unrelated to the video.

---------------------------------------------------------------------
## 6. Finance-specific rules

### 6.1 Numbers
- Only sourced data. Every number in a thumbnail, title or description must appear in the video's plan `data` with a source (house rule, in CLAUDE.md "Never invent data").
- Show the year and geography of the data in the description, and in the title if the claim depends on them.
- Round honestly: do not round $9,400 to "$10K" in a title if the video says $9,400, unless the video also says "about". [REC]
- A comparison must be like for like (nominal vs real, pre-tax vs post-tax). Say which in the video, and do not hide it in the thumbnail. [REC]
- If a figure is a model or illustration (for example a compound-interest example), label it "example" in the description. Do not present hypothetical returns as typical.
- Check every calculation twice and keep the calculation in the notes; ask a second reader to verify. [REC; matches the "encourage verification" principle]

### 6.2 Avoid "get rich" clickbait
- Words to avoid in titles/thumbnails: "guaranteed", "secret", "overnight", "never lose", "they don't want you to know", "get rich", unless the video literally debunks them. [REC]
- A "debunk" framing is acceptable only if the video actually debunks. Title says "Why [get-rich claim] Fails" is fine; showing a stack of cash to imply the viewer will have it is not.
- Spam/deceptive policy covers titles, thumbnails and descriptions (S5). Branded or sponsored finance content must follow Google Ads policies and the paid promotion setting (S8).
- Trust argument [REC]: a finance channel has repeat viewers who check the numbers; an inflated promise costs more in lost trust than it gains in clicks. This is a judgement, not a measured result. Third-party anecdote: clickbait promises that the video does not fulfil cause quick exits (S12 says the title should reflect the video; S13 summarises the same view for the leaked MrBeast memo, unconfirmed).
- Finance case study (AIR): a channel that removed clickbait saw CTR rise from 5.6% to 6.4% and engaged views +175%. It is a single uncontrolled case, not evidence of causation. [3P S10]

### 6.3 Disclaimers and disclosures
- YouTube has no finance-disclaimer rule that I could find in the Help pages I fetched. Whether YouTube has specific finance-advice rules beyond spam/deception, or whether your jurisdiction's regulators require a disclaimer, is [UNVERIFIED]. Check local rules (for India: SEBI rules on investment advice and finfluencers; I did not verify these) and take legal advice if the channel recommends specific products. [UNVERIFIED]
- Suggested standard text [REC], adapt to your needs:
  "This video is for general education only and is not personal financial, investment, tax or legal advice. Past performance does not predict future results. Numbers are from the sources listed above and may change. Consult a qualified professional before making decisions."
- Paid promotions must be declared via the paid promotion setting in Studio; creators remain responsible for legal disclosure (S8). Affiliate links: say so near the link. [REC]
- Do not name individual stocks, funds or products as recommendations without a legal check. [REC]

---------------------------------------------------------------------
## 7. Output format for the agents [REC]

Per video, produce:
- 3 thumbnail concepts: one-line concept, focal object, text (0-3 words), accent colour, which safe zone is left clear, which sourced number (if any) appears.
- 3 titles: tagged searchable / curiosity / number-led, with character count.
- 1 pairing table: each thumbnail concept matched to one title, plus the hypothesis for each.
- 1 description following 5.2, with chapters from `timings.json`, sources, disclaimer, 3 hashtags.
- 5-10 tags.
- Test plan: which axes differ (4.2) and what is held constant.

---------------------------------------------------------------------
## 8. CHECKLIST (one line per item; pass/fail)

Thumbnail (vision critic)
- [ ] File is 16:9, at least 1280x720 (ideally 1920x1080 or 3840x2160), JPG or PNG, under 2 MB.
- [ ] Scaled to 168x94 px, the focal object is identifiable in 1 second.
- [ ] Scaled to 168x94 px, every word on the image is readable.
- [ ] 3 words or fewer of text (numbers count as words).
- [ ] Text does not repeat the title.
- [ ] Text height is at least about 12% of image height.
- [ ] Text contrast is high (dark on light or light on dark with an outline/block); passes in greyscale.
- [ ] Exactly one dominant focal point; 3 elements or fewer including text.
- [ ] Focal object covers at least about 35% of image height.
- [ ] Focal object is on or near a rule-of-thirds point.
- [ ] Nothing important in the bottom-right 22% x 18% (duration badge).
- [ ] Nothing important in the bottom 6% (progress bar) or within about 3% of the edges.
- [ ] Image has a visible edge on both a white (#FFFFFF) and a dark (#0F0F0F) page at 168 px.
- [ ] 3 colours or fewer plus paper and ink; one accent.
- [ ] Paper texture and hatching do not lower the contrast of the focal object or text.
- [ ] Line weights survive downscale (no hairlines carrying meaning).
- [ ] Matches the channel frame (paper, ink, font, accent, stamp position).
- [ ] Emotion or stakes are visible without reading text (expression, tension, gap).
- [ ] Any number or chart on the image matches the video's sourced data.
- [ ] Image does not show a result or object the video never shows.
- [ ] The 3 thumbnails differ in subject and angle, not only colour, font or position.

Title
- [ ] 100 characters or fewer; target 35-55; main promise within the first 60.
- [ ] Key words first; no branding or episode number at the start.
- [ ] At most one ALL CAPS word; no emoji.
- [ ] Reads as one honest sentence; no keyword stuffing.
- [ ] Any number is sourced in the plan `data`; year/geography included if relevant.
- [ ] No guaranteed-return, "secret", "overnight", "get rich" or fake-urgency wording.
- [ ] The video answers the title's question or promise within the first 2 minutes.
- [ ] The 3 titles include one searchable and one curiosity/tension type.
- [ ] Title and thumbnail text together read as one idea with no duplicated words.

Description and metadata
- [ ] First 2 lines (about 150 characters) hold the promise and main keyword, with no link or hashtag.
- [ ] 5,000 characters or fewer.
- [ ] Chapters: first is 00:00; 3 or more; ascending; each at least 10 s; timestamps from `timings.json`.
- [ ] Sources section lists publisher, title, year and URL for every sourced figure; illustrative numbers are labelled.
- [ ] Disclaimer present; sponsorship/affiliate status stated; paid-promotion box set if applicable.
- [ ] Exactly 3 relevant hashtags (never more than 60 in total), no spaces.
- [ ] Tags: 10 or fewer, topic and misspellings only; none stuffed in the description.

A/B test
- [ ] 3 variants differ on at least two concept axes (subject, emotion, text, composition).
- [ ] One-line hypothesis recorded for each variant.
- [ ] Title and thumbnail are not edited during the test; result recorded afterwards.

---------------------------------------------------------------------
## 9. Could not verify (open items)

- Exact description fold length (characters/lines) on desktop and mobile. Only third-party claims (about 100-160 characters).
- Exact duration-badge and progress-bar dimensions; the 168x94, 116x65, 320x180 and 360x202 display sizes. Third-party only.
- Tag character limit (500 combined) on the Help page; only third-party.
- Whether YouTube shows hashtags near the title in the iOS app (2018 secondary source said no; likely out of date).
- The Creator Insider video for title testing (I relied on the Help page and one news report).
- Paddy Galloway, Film Booth, vidIQ and TubeBuddy primary material: searches returned nothing usable, so no claim here is attributed to them.
- MrBeast production memo: only secondhand summaries; authenticity unconfirmed.
- Any effect sizes for faces, numbers or text in thumbnails (blogs without methodology).
- YouTube-specific financial-advice policy and local regulatory disclaimer requirements (for example SEBI in India).

---------------------------------------------------------------------
## Sources (all accessed 2026-10-29 unless noted)

- S1. https://support.google.com/youtube/answer/13861714 : Test & Compare: titles/thumbnails, up to 3, eligibility, 2-week duration, watch-time share, results, advice on different variants.
- S2. https://support.google.com/youtube/answer/72431 : Thumbnail specs: 3840x2160 recommended, 640 px min width, 16:9, JPG/PNG, 2 MB mobile / 50 MB desktop, verified account.
- S3. https://support.google.com/youtube/answer/146402 : Tags: minimal role, misspellings; excessive tags in description are spam. (Does not give title/description limits.)
- S4. https://support.google.com/youtube/answer/9884579 : Chapters: 00:00 start, 3 timestamps minimum, 10 s minimum, ascending, auto-chapter notes.
- S5. https://support.google.com/youtube/answer/2801973 : Spam, deceptive practices and scams policy: "maliciously misleading titles, thumbnails, descriptions", enforcement.
- S6. https://support.google.com/youtube/answer/6390658 : Hashtags: 3 shown near the title, more than 60 ignored, no spaces, misuse consequences.
- S7. https://support.google.com/youtube/answer/187594 : Edit video details: title 100 characters, description 5,000 characters; tags minimal role.
- S8. https://support.google.com/youtube/answer/17596007 : YouTube Branded Content Policies: paid promotion declaration (seen via search snippet only, page not fetched in full).
- S9. https://www.searchenginejournal.com/youtube-title-a-b-testing-rolls-out-globally-to-creators/562571/ : (dated 2025-12-04) title A/B testing expansion, via Creator Insider; third-party report.
- S10. https://air.io/en/audience-growth/how-to-write-a-youtube-title-that-gets-clicked-research-across-11-niches : Correlational title study, 18,080 channels: 30-50 characters, numbers in finance, curiosity wording, case study. Third-party.
- S11. https://ideas.repec.org/a/eee/jbrese/v183y2024ics0148296324003539.html : Journal of Business Research 2024 (Cui et al.) on sentiment in video covers/titles; found via search snippet only, not fetched in full.
- S12. https://support.google.com/youtube/answer/12340300 : YouTube "Thumbnail & title tips": rule of thirds, readable font, simple design, key words first, limit caps/emoji, searchable vs intriguing titles, 24-hour CTR check, accuracy.
- S13. https://zackchewning.substack.com/p/content-lessons-from-the-1-youtubers : Secondhand summary of the leaked MrBeast memo (thumbnail team, expectations must be met). Authenticity of the memo unconfirmed.
- S15. https://socialk.it/en/sizes/youtube-thumbnail-size : Third-party thumbnail size/safe-zone claims (duration badge bottom-right, display sizes). Unverified; see 9.
- S16. https://www.tubefilter.com/2018/07/18/youtube-hashtags-above-titles/amp/ : 2018 report quoting a 15-hashtag limit and 3 hashtags above titles; superseded by S6 for the limit.
