# Credits

The Briefing style engine is adapted from LemoLab's lemo-opuscar (MIT, Copyright (c) 2026 LemoLab, https://github.com/lemomo-ai/lemo-opuscar):

- `engine.ts`, `glyph.ts`, `chars.ts`, `title.ts` from `styles/spy-titles/demo/` (paper.js, glyph.js, chars.js, title.js): the cut-paper look, scissor edges, silhouette merge layer, League Gothic letter re-cutting, the figure rig, the diagonal title split. Changed: TypeScript port, context passed explicitly, deterministic texture generation, ink sets (`INKS`), new title letterforms (A-Z, not based on any real title logo), figure reduced to one rig (the agent), finance-oriented API.
- `camera.ts`, `transitions.ts` take the camera and transition grammar of `styles/living-screencast/` (whip-pan with directional motion blur derived from camera speed, push-in with spotlight freeze, pixel wipe, chapter pill). Changed: canvas instead of DOM, `focusCam` (new: follows the action and never leaves it early), iris and diagonal-strip wipes, act in/out whip transitions.
- `subtitle.ts`, `SpyCanvas.tsx`, `preview/` are new for this repo.

## Fonts (SIL Open Font License 1.1)

- League Gothic, The League of Moveable Type (https://github.com/theleagueof/league-gothic). Bundled as `fonts/LeagueGothic-Regular.ttf` (the Google Fonts build, default width instance); licence in `fonts/LeagueGothic-OFL.txt`.
- League Spartan, The League of Moveable Type, loaded through `@remotion/google-fonts/LeagueSpartan` (weights 600, 700).

## Libraries

- opentype.js (MIT), Frederik De Bleser, https://github.com/opentypejs/opentype.js: reads the League Gothic outlines.

## MIT License (lemo-opuscar)

Copyright (c) 2026 LemoLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
