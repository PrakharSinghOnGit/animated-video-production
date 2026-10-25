/**
 * Text normalization for TTS.
 *
 * F5-TTS garbles markdown, symbols and numerals ("**$10,000**", "5%", "S&P 500"),
 * so every line is rewritten into plain spoken English before synthesis.
 * Pure and deterministic: the same input always yields the same output.
 * Captions/display keep using the original `sec.text`.
 */

// ── Extendable dictionaries ─────────────────────────────────────────────────

/** Uppercase tokens that must be spoken as spelled letters / expanded phrases. */
export const ACRONYMS: Record<string, string> = {
  IPO: "I P O",
  ETF: "E T F",
  CEO: "C E O",
  CFO: "C F O",
  GDP: "G D P",
  CPI: "C P I",
  ROI: "R O I",
  APR: "A P R",
  FX: "F X",
  AI: "A I",
  USD: "U S dollars",
};

/** Phrase-level replacements, applied in order before numbers are converted. */
export const PHRASES: Array<[RegExp, string]> = [
  [/\bS&P\b/g, "S and P"],
  [/\bvs\.?(?=\s|$)/gi, "versus"],
  [/\be\.g\.(?=\s|,|$)/gi, "for example"],
  [/\bi\.e\.(?=\s|,|$)/gi, "that is"],
];

// [singular, plural, minor singular, minor plural]
const CURRENCIES: Record<string, [string, string, string, string]> = {
  "$": ["dollar", "dollars", "cent", "cents"],
  "₹": ["rupee", "rupees", "paisa", "paise"],
  "€": ["euro", "euros", "cent", "cents"],
  "£": ["pound", "pounds", "penny", "pence"],
};

const MAGNITUDE_LETTERS: Record<string, string> = {
  K: "thousand",
  M: "million",
  B: "billion",
  T: "trillion",
};

// ── Number to words ─────────────────────────────────────────────────────────

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion", "quadrillion"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)];
    parts.push(n % 10 ? `${t}-${ONES[n % 10]}` : t);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

/** Spell a non-negative integer string ("1221") as words. Falls back to digits beyond quadrillions. */
export function integerToWords(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, "");
  if (clean === "0") return "zero";
  if (clean.length > SCALES.length * 3) return clean.split("").map((d) => ONES[Number(d)]).join(" ");

  const groups: string[] = [];
  for (let end = clean.length, i = 0; end > 0; end -= 3, i++) {
    const n = Number(clean.slice(Math.max(0, end - 3), end));
    if (n) groups.unshift(`${below1000(n)}${SCALES[i] ? " " + SCALES[i] : ""}`);
  }
  return groups.join(" ");
}

/** Spell a numeric string with optional commas and decimals: "3.5" -> "three point five". */
export function numberToWords(raw: string): string {
  const [intPart, fracPart] = raw.replace(/,/g, "").split(".");
  const words = integerToWords(intPart);
  if (!fracPart) return words;
  return `${words} point ${fracPart.split("").map((d) => ONES[Number(d)]).join(" ")}`;
}

/** Spell a 4-digit year (1900-2099) the way it is spoken. */
export function yearToWords(year: number): string {
  if (year >= 2000 && year <= 2009) return integerToWords(String(year));
  const hi = Math.floor(year / 100);
  const lo = year % 100;
  const head = integerToWords(String(hi));
  if (lo === 0) return `${head} hundred`;
  if (lo < 10) return `${head} oh ${ONES[lo]}`;
  return `${head} ${integerToWords(String(lo))}`;
}

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth",
  nine: "ninth", twelve: "twelfth",
};

export function ordinalToWords(digits: string): string {
  const words = integerToWords(digits);
  const m = words.match(/^(.*?)([a-z]+)$/)!;
  const last = m[2];
  let ord: string;
  if (ORDINAL_IRREGULAR[last]) ord = ORDINAL_IRREGULAR[last];
  else if (last.endsWith("y")) ord = `${last.slice(0, -1)}ieth`;
  else ord = `${last}th`;
  return `${m[1]}${ord}`;
}

// ── Normalization passes ────────────────────────────────────────────────────

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const NOT_WORD_BEFORE = String.raw`(?<![A-Za-z\d])`;

function stripMarkdown(t: string): string {
  return t
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+])[ \t]+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/(?<![A-Za-z\d])_(.+?)_(?![A-Za-z\d])/gs, "$1")
    .replace(/\*+/g, "")
    .replace(/_+/g, " ");
}

function normalizePunctuation(t: string): string {
  return t
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/…/g, "...")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/,\s*(?=[.!?,;:])/g, "");
}

function speakCurrency(sym: string, amount: string, magnitude?: string): string {
  const [one, many, minorOne, minorMany] = CURRENCIES[sym];
  if (magnitude) {
    const word = MAGNITUDE_LETTERS[magnitude.toUpperCase()] ?? magnitude.toLowerCase();
    return `${numberToWords(amount)} ${word} ${many}`;
  }
  const clean = amount.replace(/,/g, "");
  const [intPart, frac] = clean.split(".");
  if (frac && frac.length === 2) {
    const cents = Number(frac);
    const minor = cents ? `${integerToWords(frac)} ${cents === 1 ? minorOne : minorMany}` : "";
    if (Number(intPart) === 0) return minor || `zero ${many}`;
    const major = `${integerToWords(intPart)} ${Number(intPart) === 1 ? one : many}`;
    return minor ? `${major} and ${minor}` : major;
  }
  const isOne = clean === "1";
  return `${numberToWords(amount)} ${isOne ? one : many}`;
}

/** Convert raw script text into plain, speakable English for the TTS engine. */
export function normalizeForSpeech(text: string): string {
  let t = stripMarkdown(text);

  // Ranges first (keep digits; later passes convert them): "10-20%" -> "10 to 20%"
  t = t.replace(/(?<![A-Za-z\d])(\d[\d,]*%?)\s?[-–]\s?(?=[$₹€£]?\d)/g, "$1 to ");

  t = normalizePunctuation(t);

  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  // Plural forms ("ETFs", "IPOs") keep a trailing "s": "E T Fs".
  const acronymRe = new RegExp(`\\b(${Object.keys(ACRONYMS).join("|")})(s?)\\b`, "g");
  t = t.replace(acronymRe, (_m, word: string, plural: string) => ACRONYMS[word] + plural);
  t = t.replace(/\s*&\s*/g, " and ");

  // Currency: $10,000 / $1.5 trillion / $9.6T / $0.50
  const currencyRe = new RegExp(
    String.raw`([$₹€£])\s?(${NUM})(?:\s?(trillion|billion|million|thousand)\b|([KMBT])(?![A-Za-z\d]))?`,
    "gi"
  );
  t = t.replace(currencyRe, (_m, sym, amount, word, letter) => speakCurrency(sym, amount, word ?? letter));

  // Percentages
  t = t.replace(new RegExp(String.raw`(${NUM})\s?%`, "g"), (_m, n) => `${numberToWords(n)} percent`);
  t = t.replace(/\s%/g, " percent");

  // Ordinals: 1st, 2nd, 21st
  t = t.replace(/(?<![A-Za-z\d])(\d+)(?:st|nd|rd|th)\b/gi, (_m, n) => ordinalToWords(n));

  // Magnitude suffixes: 5M, 1.2B, 10K
  t = t.replace(new RegExp(`${NOT_WORD_BEFORE}(${NUM})([KMBT])\\b`, "g"), (_m, n, l) =>
    `${numberToWords(n)} ${MAGNITUDE_LETTERS[l]}`
  );

  // Plain numbers and standalone years
  t = t.replace(new RegExp(`${NOT_WORD_BEFORE}(${NUM})`, "g"), (_m, n: string) => {
    if (/^\d{4}$/.test(n)) {
      const y = Number(n);
      if (y >= 1900 && y <= 2099) return yearToWords(y);
    }
    return numberToWords(n);
  });

  return t
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}
