/** Sentence-per-line transcript ("[startMs-endMs] text") — a compact form for prompts. */
export function compactTranscript(words: { text: string; startMs: number; endMs: number }[]): string {
  const lines: string[] = [];
  let buf: typeof words = [];
  const flush = () => {
    if (buf.length === 0) return;
    lines.push(`[${buf[0].startMs}-${buf[buf.length - 1].endMs}] ${buf.map((w) => w.text).join(" ")}`);
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    if (/[.!?]["')\]]*$/.test(w.text) || buf.length >= 40) flush();
  }
  flush();
  return lines.join("\n");
}
