import { describe, expect, it } from "bun:test";

import type { MentionCandidate, MentionSource } from "../mention.type";
import { MENTION_ROWS_PER_SOURCE, searchMentionSources, toMentionPayload } from "./mentionPlugin.util";

const candidates = (refName: string, count: number): MentionCandidate[] =>
  Array.from({ length: count }, (_, idx) => ({ refId: `${refName}${idx}`, label: `${refName}-${idx}` }));

const sourceOf = (refName: string, overrides: Partial<MentionSource> = {}): MentionSource => ({
  refName,
  label: refName,
  search: async () => candidates(refName, 3),
  ...overrides,
});

describe("searchMentionSources", () => {
  it("merges every source and caps the rows each may contribute", async () => {
    const matches = await searchMentionSources(
      [sourceOf("admin", { search: async () => candidates("admin", 20) }), sourceOf("user")],
      "ka",
      new AbortController().signal,
    );

    expect(matches.filter((match) => match.source.refName === "admin")).toHaveLength(MENTION_ROWS_PER_SOURCE);
    expect(matches.filter((match) => match.source.refName === "user")).toHaveLength(3);
    expect(matches[0]?.candidate.refId).toBe("admin0");
  });

  it("skips a source until the query reaches its minQueryLength", async () => {
    const sources = [sourceOf("admin", { minQueryLength: 2 }), sourceOf("user")];

    const short = await searchMentionSources(sources, "k", new AbortController().signal);
    expect(short.every((match) => match.source.refName === "user")).toBe(true);

    const long = await searchMentionSources(sources, "ka", new AbortController().signal);
    expect(new Set(long.map((match) => match.source.refName))).toEqual(new Set(["admin", "user"]));
  });

  it("drops a failing source instead of blanking the menu", async () => {
    const matches = await searchMentionSources(
      [
        sourceOf("admin", {
          search: () => Promise.reject(new Error("boom")),
        }),
        sourceOf("user"),
      ],
      "ka",
      new AbortController().signal,
    );

    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.source.refName === "user")).toBe(true);
  });
});

describe("toMentionPayload", () => {
  const source = sourceOf("admin", { hrefOf: (candidate) => `/admin/${candidate.refId}` });

  it("prefers the candidate href over the source builder", () => {
    const payload = toMentionPayload(source, { refId: "a1", label: "kangmin", href: "/custom" });
    expect(payload).toEqual({ refName: "admin", refId: "a1", label: "kangmin", href: "/custom", imageUrl: null });
  });

  it("falls back to the source builder, then to null", () => {
    expect(toMentionPayload(source, { refId: "a1", label: "kangmin" }).href).toBe("/admin/a1");
    expect(toMentionPayload(sourceOf("user"), { refId: "u1", label: "hana" }).href).toBe(null);
  });
});
