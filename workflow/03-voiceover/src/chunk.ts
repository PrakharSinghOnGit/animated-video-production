// Sentence-level chunking (originally tuned for F5-TTS): short chunks stay close to the 11 s reference clip's
// length scale, which is where F5 is least likely to babble or hallucinate syllables.

export const MAX_CHUNK_CHARS = 220;

// Tokens ending in "." that do not end a sentence
const NON_TERMINAL = /^(?:e\.g|i\.e|vs|etc|mr|mrs|ms|dr|st|no|inc|ltd|co|u\.s|u\.k|approx)\.$/i;

export function splitSentences(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const sentences: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const w = words[i].replace(/["')\]]+$/, "");
    const next = words[i + 1];
    const ends = /[.!?]$/.test(w) && !NON_TERMINAL.test(w) && !/^[A-Z]\.$/.test(w);
    // Only break when the next word starts a new sentence (capital, digit or opening quote)
    if (ends && (!next || /^["'(\[]?[A-Z0-9]/.test(next))) {
      sentences.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur.join(" "));
  return sentences;
}

// Split an over-long sentence at the comma/semicolon nearest its middle (else the nearest space)
export function splitLong(sentence: string, max = MAX_CHUNK_CHARS): string[] {
  if (sentence.length <= max) return [sentence];
  const mid = sentence.length / 2;
  const nearest = (re: RegExp): number => {
    let best = -1;
    for (const m of sentence.matchAll(re)) {
      const end = m.index! + m[0].length;
      if (end < 20 || sentence.length - end < 20) continue;
      if (best < 0 || Math.abs(end - mid) < Math.abs(best - mid)) best = end;
    }
    return best;
  };
  let cut = nearest(/[,;:]\s/g);
  if (cut < 0) cut = nearest(/\s/g);
  if (cut < 0) return [sentence];
  return [...splitLong(sentence.slice(0, cut).trim(), max), ...splitLong(sentence.slice(cut).trim(), max)];
}

export function chunkText(text: string, max = MAX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const piece of splitSentences(text).flatMap((s) => splitLong(s, max))) {
    if (cur && cur.length + 1 + piece.length > max) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur} ${piece}` : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
