import { describe, expect, it } from "bun:test";

import type { LinkedMention, MentionCandidate, MentionLinkReader, MentionSource } from "../mention.type";
import {
  type MentionMatch,
  MentionSession,
  mentionMatchOf,
  mentionRowsPerSource,
  pastedLinkOf,
  readMentionLink,
  searchMentionSources,
  toMentionPayload,
} from "./mentionPlugin.util";

const candidates = (refName: string, count: number): MentionCandidate[] =>
  Array.from({ length: count }, (_, idx) => ({ refId: `${refName}${idx}`, label: `${refName}-${idx}` }));

const sourceOf = (refName: string, overrides: Partial<MentionSource> = {}): MentionSource => ({
  refName,
  label: refName,
  search: async () => candidates(refName, 3),
  ...overrides,
});

describe("mentionMatchOf", () => {
  it("keeps searching across spaces and replaces the whole typed text", () => {
    expect(mentionMatchOf("hi @Doyun Kim")).toEqual({
      leadOffset: 3,
      matchingString: "Doyun Kim",
      replaceableString: "@Doyun Kim",
    });
    expect(mentionMatchOf("@김 도윤")?.matchingString).toBe("김 도윤");
  });

  it("trims a trailing space from the query but not from the text it replaces", () => {
    expect(mentionMatchOf("@Doyun ")).toEqual({ leadOffset: 0, matchingString: "Doyun", replaceableString: "@Doyun " });
  });

  it("opens on a bare trigger after whitespace, a parenthesis or the line start only", () => {
    expect(mentionMatchOf("@")?.matchingString).toBe("");
    expect(mentionMatchOf("(@ka")?.leadOffset).toBe(1);
    expect(mentionMatchOf("mail@ka")).toBeNull();
  });

  it("reads a space right after the trigger, a double space and punctuation as prose", () => {
    expect(mentionMatchOf("@ ")).toBeNull();
    expect(mentionMatchOf("@ hello")).toBeNull();
    expect(mentionMatchOf("@Doyun  Kim")).toBeNull();
    expect(mentionMatchOf("@Doyun  ")).toBeNull();
    expect(mentionMatchOf("@Doyun. Kim")).toBeNull();
  });

  it("stops past the length cap", () => {
    expect(mentionMatchOf(`@${"a".repeat(75)}`)?.matchingString).toHaveLength(75);
    expect(mentionMatchOf(`@${"a".repeat(76)}`)).toBeNull();
  });
});

describe("MentionSession", () => {
  const sources = [sourceOf("user")];
  const row: MentionMatch[] = [{ source: sources[0] as MentionSource, candidate: { refId: "u1", label: "Doyun Kim" } }];
  const anchor = (text: string, key = "1") => ({ key, text });
  const typed = (session: MentionSession, text: string, key = "1") => session.match(text, anchor(text, key));

  it("keeps a spaced query open while its searches find rows", () => {
    const session = new MentionSession();
    session.settle("Doyun", sources, row);
    expect(typed(session, "@Doyun K")?.matchingString).toBe("Doyun K");
    session.settle("Doyun K", sources, row);
    expect(typed(session, "@Doyun Kim")?.matchingString).toBe("Doyun Kim");
  });

  it("keeps a query without a space open even when it found nothing", () => {
    const session = new MentionSession();
    session.settle("zzz", sources, []);
    expect(typed(session, "@zzzz")?.matchingString).toBe("zzzz");
  });

  it("ends once a space follows a query that found nothing, and stays ended while typing on", () => {
    const session = new MentionSession();
    session.settle("zzzz", sources, []);
    expect(typed(session, "@zzzz ")).toBeNull();
    expect(typed(session, "@zzzz qqqq")).toBeNull();
    session.reset();
    expect(typed(session, "@zzzz")).toBeNull();
  });

  it("ends a spaced query whose own search found nothing on the next keystroke", () => {
    const session = new MentionSession();
    expect(typed(session, "@zzzz q")?.matchingString).toBe("zzzz q");
    session.settle("zzzz q", sources, []);
    expect(typed(session, "@zzzz qq")).toBeNull();
  });

  it("starts afresh at a new trigger, or once the ended one is deleted", () => {
    const session = new MentionSession();
    session.settle("zzzz", sources, []);
    expect(typed(session, "@zzzz q")).toBeNull();
    session.reset();
    expect(typed(session, "@zzzz q @Doyun")?.matchingString).toBe("Doyun");
    expect(typed(session, "@zzzz q", "2")?.matchingString).toBe("zzzz q");
    expect(session.match("", anchor("zzzz q"))).toBeNull();
    expect(typed(session, "@zzzz q")?.matchingString).toBe("zzzz q");
  });

  it("does not end on an empty result some source was never asked for", () => {
    const session = new MentionSession();
    session.settle("z", [...sources, sourceOf("admin", { minQueryLength: 2 })], []);
    expect(typed(session, "@z q")?.matchingString).toBe("z q");
  });
});

describe("searchMentionSources", () => {
  it("merges every source and caps the rows each may contribute", async () => {
    const matches = await searchMentionSources(
      [sourceOf("admin", { search: async () => candidates("admin", 20) }), sourceOf("user")],
      "ka",
      new AbortController().signal,
    );

    expect(matches.filter((match) => match.source.refName === "admin")).toHaveLength(mentionRowsPerSource);
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

describe("pastedLinkOf", () => {
  it("takes a lone http(s) link, trimmed", () => {
    expect(pastedLinkOf("  https://office.akanjs.com/en/org/1/chat/2?threadId=3\n")).toEqual({
      text: "https://office.akanjs.com/en/org/1/chat/2?threadId=3",
      url: "https://office.akanjs.com/en/org/1/chat/2?threadId=3",
    });
  });

  it("leaves a sentence, a path, another scheme and an empty paste to the default paste", () => {
    expect(pastedLinkOf("see https://office.akanjs.com/en/org/1")).toBeNull();
    expect(pastedLinkOf("/org/1/chat/2")).toBeNull();
    expect(pastedLinkOf("mailto:a@b.co")).toBeNull();
    expect(pastedLinkOf("javascript:alert(1)")).toBeNull();
    expect(pastedLinkOf("   ")).toBeNull();
    expect(pastedLinkOf(undefined)).toBeNull();
  });
});

describe("readMentionLink", () => {
  const chip: LinkedMention = { refName: "channel", refId: "c1", label: "#general", href: "/org/o1/chat/c1" };
  const notMine: MentionLinkReader = () => null;

  it("answers null synchronously when no reader owns the link", () => {
    expect(readMentionLink([notMine], "https://a.com/")).toBeNull();
    expect(readMentionLink([], "https://a.com/")).toBeNull();
  });

  it("asks the first reader that owns the link", async () => {
    const later: MentionLinkReader = async () => ({ ...chip, label: "#later" });
    expect(await readMentionLink([notMine, async () => chip, later], "https://a.com/")).toEqual(chip);
  });

  it("reads a nameless document as an unreadable link", async () => {
    expect(await readMentionLink([async () => ({ ...chip, label: "  " })], "https://a.com/")).toBeNull();
  });

  it("reads a failed lookup as an unreadable link", async () => {
    const failing: MentionLinkReader = async () => {
      throw new Error("forbidden");
    };
    expect(await readMentionLink([failing], "https://a.com/")).toBeNull();
  });
});
