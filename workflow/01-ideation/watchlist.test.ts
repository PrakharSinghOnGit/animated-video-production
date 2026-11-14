import { describe, expect, test } from "bun:test";
import { isoDur, isShort, mergeDataset, normaliseWatchlist, readWatchlist, type DatasetRow } from "./watchlist";

describe("niche radar watchlist", () => {
  test("handles are normalised and de-duplicated", () => {
    expect(normaliseWatchlist(["HowMoneyWorks", { handle: "@howmoneyworks" }, { handle: "https://www.youtube.com/@PBoyle/videos", why: "w" }, { handle: " " }, {}]))
      .toEqual([{ handle: "@HowMoneyWorks", why: undefined }, { handle: "@PBoyle", why: "w" }]);
  });
  test("the checked-in watchlist parses and has channels", () => {
    expect(readWatchlist().length).toBeGreaterThan(5);
  });
  test("the dataset keeps old rows and takes the newest view count", () => {
    const r = (ytId: string, views: number): DatasetRow => ({ ytId, channelId: "c", channel: "C", title: "t", publishedAt: "2026-01-01", durationS: 600, views, seenAt: "x" });
    const out = mergeDataset([r("a", 10), r("b", 5)], [r("a", 99)]);
    expect(out.map((x) => [x.ytId, x.views])).toEqual([["a", 99], ["b", 5]]);
  });
  test("durations and the short cut-off", () => {
    expect(isoDur("PT1H2M3S")).toBe(3723);
    expect(isShort(isoDur("PT59S"))).toBe(true);
    expect(isShort(isoDur("PT9M"))).toBe(false);
  });
});
