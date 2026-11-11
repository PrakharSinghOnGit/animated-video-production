import { describe, expect, test } from "bun:test";
import { parseScript, scriptStats, checkClaims, figuresOf, bannedWords, opening, timedScript, spokenOf, type Claim } from "./script_lib";

const md = `### Part 1: Hook
**VO:** \`[VO: calm, curious]\` Why can you afford a coffee, but never a house? Since 2000, rent went up 149%.
**[ON SCREEN]:** a cup and a house

**VO:** \`[VO: dry]\` And then... <short pause> it ran. Without YOU.
**[ON SCREEN]:** a line

### CHAPTER 2: The Math
**VO:** \`[VO: methodical]\` The median home sells for about 410 thousand dollars. Say you save 200 dollars a month.
**[ON SCREEN]:** a tag
`;

describe("parseScript", () => {
  const s = parseScript(md);
  test("reads parts, beats, spoken words and on-screen hints", () => {
    expect(s.parts.map((p) => p.title)).toEqual(["Part 1: Hook", "CHAPTER 2: The Math"]);
    expect(s.beats).toHaveLength(3);
    expect(s.beats[0].tone).toBe("calm, curious");
    expect(s.beats[0].onScreen).toBe("a cup and a house");
    expect(s.beats[1].text).toBe("And then... it ran. Without YOU.");
    expect(s.words).toBe(16 + 6 + 16);
  });
  test("times run at 150 wpm, with a pause before a chapter", () => {
    expect(s.beats[0].t1).toBeCloseTo((16 / 150) * 60, 5);
    expect(s.beats[2].t0).toBeCloseTo(((16 + 6) / 150) * 60 + 2.5, 5);
    expect(timedScript(s)).toContain("[0:06] And then... it ran.");
  });
  test("spokenOf drops tone notes and inline tags; opening stops at whole sentences", () => {
    expect(spokenOf("`[VO: dry]` It was <breath> the **bait**.")).toBe("It was the bait.");
    expect(opening(s, 5)).toBe("Why can you afford a coffee, but never a house?");
  });
});

describe("scriptStats", () => {
  test("measures the first you, figure and question, and flags video-talk and banned words", () => {
    const s = parseScript(`**VO:** In this video we'll cover markets. Buckle up. Markets are big.\n**VO:** ${"Prices move and funds trade and banks lend money. ".repeat(40)}`);
    const st = scriptStats(s, bannedWords('## Words I never use\n"buckle up", "dive in"\n\n## Next\n"not this"'));
    expect(st.firstYou).toBeNull();
    expect(st.firstNumber).toBeNull();
    const notes = st.notes.join("\n");
    expect(notes).toContain("talks about the video");
    expect(notes).toContain('"buckle up"');
    expect(notes).toContain('without "you"');
    expect(notes).toContain("no concrete figure in the first 30 s");
  });
  test("a script that opens on the viewer and a figure gets no opening notes", () => {
    const st = scriptStats(parseScript(md));
    expect(st.firstYou).toBe(0);
    expect(st.notes.join("\n")).not.toContain("first 10 s");
  });
});

describe("claims", () => {
  const s = parseScript(md);
  const claims: Claim[] = [
    { id: "C01", claim: "Rent up 149% since 2000", said: "rent went up 149%", status: "sourced", source: { url: "https://www.bls.gov/cpi/x?a=1", says: "Rent index rose 149 percent" } },
    { id: "C02", claim: "Median home $410k", said: "about 410 thousand dollars", status: "sourced", source: { url: "https://made-up.example/page", says: "410" } },
    { id: "C03", claim: "Saving $200 a month", said: "Say you save 200 dollars a month", status: "illustrative" },
    { id: "C04", claim: "Something not said", said: "this is not in the script", status: "check" },
  ];
  test("figures as spoken", () => {
    expect(figuresOf("About $9.6 trillion, 7%, 410 thousand dollars and three quarters of it in 2000.")).toEqual(["$9.6 trillion", "7%", "410 thousand", "three quarters", "2000"]);
  });
  test("a claim is sourced only with a trusted URL; others become check; quotes must be in the script", () => {
    const r = checkClaims(s, claims, ["https://bls.gov/cpi/x"]);
    expect(r.claims.map((c) => c.status)).toEqual(["sourced", "check", "illustrative", "check"]);
    expect(r.claims[1].problems[0]).toContain("not a page-checked research fact");
    expect(r.claims[3].problems[0]).toContain("not in the script");
    expect(r.sourced).toBe(1);
  });
  test("figures the narrator says without a claim are listed", () => {
    const r = checkClaims(s, claims.slice(0, 1), []);
    expect(r.unlisted.map((u) => u.figure)).toEqual(["2000", "410 thousand", "200"]);
    expect(r.unlisted.some((u) => u.figure.startsWith("410"))).toBe(true);
    expect(r.unlisted.some((u) => u.figure.startsWith("149"))).toBe(false);
    expect(r.claims[0].status).toBe("check");
  });
});
