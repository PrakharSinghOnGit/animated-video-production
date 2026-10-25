import { describe, expect, test } from "bun:test";
import { normalizeForSpeech as n, numberToWords, yearToWords, ordinalToWords, ACRONYMS } from "./normalize";

describe("number words", () => {
  test("integers", () => {
    expect(numberToWords("0")).toBe("zero");
    expect(numberToWords("1,221")).toBe("one thousand two hundred twenty-one");
    expect(numberToWords("1000000")).toBe("one million");
    expect(numberToWords("1000000001")).toBe("one billion one");
    expect(numberToWords("2500000000000")).toBe("two trillion five hundred billion");
  });
  test("decimals", () => {
    expect(numberToWords("3.5")).toBe("three point five");
    expect(numberToWords("0.05")).toBe("zero point zero five");
  });
  test("years and ordinals", () => {
    expect(yearToWords(1987)).toBe("nineteen eighty-seven");
    expect(yearToWords(2025)).toBe("twenty twenty-five");
    expect(yearToWords(2005)).toBe("two thousand five");
    expect(yearToWords(1900)).toBe("nineteen hundred");
    expect(ordinalToWords("21")).toBe("twenty-first");
    expect(ordinalToWords("12")).toBe("twelfth");
    expect(ordinalToWords("20")).toBe("twentieth");
  });
});

describe("markdown", () => {
  test("bold, em, code, links, bullets", () => {
    expect(n("**bold** and __bold__ and *em* and _em_")).toBe("bold and bold and em and em");
    expect(n("use `code` here")).toBe("use code here");
    expect(n("see [the site](https://x.com/a_b) now")).toBe("see the site now");
    expect(n("# Title\n> quote\n- item")).toBe("Title quote item");
    expect(n("stray * and _ marks")).toBe("stray and marks");
  });
  test("VID02 failing example", () => {
    expect(n("saved up **$10,000**. That's awesome—except")).toBe(
      "saved up ten thousand dollars. That's awesome, except"
    );
  });
});

describe("punctuation", () => {
  test("dashes, ellipsis, quotes, whitespace", () => {
    expect(n("a — b – c")).toBe("a, b, c");
    expect(n("wait… what")).toBe("wait... what");
    expect(n("“hi” it’s")).toBe('"hi" it\'s');
    expect(n("a   b \n c")).toBe("a b c");
  });
});

describe("currency", () => {
  test("basics", () => {
    expect(n("$10,000")).toBe("ten thousand dollars");
    expect(n("$50,000")).toBe("fifty thousand dollars");
    expect(n("$3")).toBe("three dollars");
    expect(n("$1")).toBe("one dollar");
    expect(n("$0.50")).toBe("fifty cents");
    expect(n("$3.50")).toBe("three dollars and fifty cents");
    expect(n("$1.5 trillion")).toBe("one point five trillion dollars");
    expect(n("$9.6T")).toBe("nine point six trillion dollars");
    expect(n("$5M")).toBe("five million dollars");
  });
  test("other symbols", () => {
    expect(n("₹500")).toBe("five hundred rupees");
    expect(n("€20")).toBe("twenty euros");
    expect(n("£1,000")).toBe("one thousand pounds");
  });
  test("trailing punctuation", () => {
    expect(n("You had $10,000.")).toBe("You had ten thousand dollars.");
    expect(n("$10,000, then $5.")).toBe("ten thousand dollars, then five dollars.");
  });
});

describe("percent, numbers, ranges", () => {
  test("percent", () => {
    expect(n("5%")).toBe("five percent");
    expect(n("up 3.5% today")).toBe("up three point five percent today");
    expect(n("a 10 % drop")).toBe("a ten percent drop");
    expect(n("grew 5%.")).toBe("grew five percent.");
  });
  test("plain numbers", () => {
    expect(n("1,221 stocks")).toBe("one thousand two hundred twenty-one stocks");
    expect(n("It was 42.")).toBe("It was forty-two.");
    expect(n("about 3.14 things")).toBe("about three point one four things");
  });
  test("years", () => {
    expect(n("In 1987 it fell")).toBe("In nineteen eighty-seven it fell");
    expect(n("by 2025.")).toBe("by twenty twenty-five.");
    expect(n("in 2005")).toBe("in two thousand five");
  });
  test("ordinals", () => {
    expect(n("1st, 2nd, 3rd and 21st")).toBe("first, second, third and twenty-first");
  });
  test("ranges", () => {
    expect(n("10-20 years")).toBe("ten to twenty years");
    expect(n("5-10%")).toBe("five to ten percent");
    expect(n("1990-2000")).toBe("nineteen ninety to two thousand");
  });
  test("magnitudes", () => {
    expect(n("5M users, 2B views, 10K fans")).toBe("five million users, two billion views, ten thousand fans");
    expect(n("10 million")).toBe("ten million");
  });
});

describe("finance tokens", () => {
  test("S&P and ampersand", () => {
    expect(n("S&P 500")).toBe("S and P five hundred");
    expect(n("risk & reward")).toBe("risk and reward");
  });
  test("abbreviations", () => {
    expect(n("stocks vs. bonds")).toBe("stocks versus bonds");
    expect(n("e.g. gold, i.e. metal")).toBe("for example gold, that is metal");
  });
  test("acronyms", () => {
    expect(n("IPO ETF CEO GDP FX")).toBe("I P O E T F C E O G D P F X");
    expect(n("USD")).toBe("U S dollars");
    expect(n("the IPOs")).toBe("the I P Os");
  });
  test("map is extendable", () => {
    expect(ACRONYMS.IPO).toBe("I P O");
  });
});

test("deterministic / idempotent on plain text", () => {
  const s = "Plain sentence with no symbols.";
  expect(n(s)).toBe(s);
  expect(n(n("**$10,000**"))).toBe("ten thousand dollars");
});

test("plural acronyms are spelled out", () => {
  expect(n("They bought ETFs after the IPOs.")).toBe("They bought E T Fs after the I P Os.");
});
