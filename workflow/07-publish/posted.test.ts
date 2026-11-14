import { expect, test } from "bun:test";
import { captions, ytCell } from "./posted";

const v = (o: object) => ({ ytId: "abcdefghijk", title: "t", publishedAt: "", durationS: 50, views: 0, likes: 0, comments: 0, short: true, ...o });

test("YouTube status: public is live; private, unlisted and scheduled are drafts; no link is not posted", () => {
  expect(ytCell(null, undefined)).toMatchObject({ status: "none", label: "not linked" });
  expect(ytCell("abcdefghijk", v({ privacy: "public" }))).toMatchObject({ status: "live", url: "https://www.youtube.com/shorts/abcdefghijk" });
  expect(ytCell("abcdefghijk", v({ privacy: "private" }))).toMatchObject({ status: "draft", label: "private" });
  expect(ytCell("abcdefghijk", v({ privacy: "private", publishAt: "2026-11-20T10:00:00Z" }))).toMatchObject({ status: "draft", label: "scheduled 2026-11-20" });
  expect(ytCell("abcdefghijk", v({ privacy: "unlisted", short: false }))).toMatchObject({ status: "draft", url: "https://www.youtube.com/watch?v=abcdefghijk" });
  expect(ytCell("abcdefghijk", undefined).status).toBe("draft");   // linked but not fetched yet
});

test("captions keep #Shorts only for YouTube", () => {
  const c = captions("Title", "Desc", ["#Shorts", "#CreditScore"]);
  expect(c.youtube).toBe("Title\n\nDesc\n\n#Shorts #CreditScore");
  expect(c.instagram).toBe("Title\n\nDesc\n\n#CreditScore");
  expect(captions("T", "", []).facebook).toBe("T");
});
