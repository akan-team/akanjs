import { describe, expect, it } from "bun:test";

import { collectMentions } from "./collectMentions";

const mention = (refName: string, refId: string, label: string) => ({
  type: "akan-mention",
  text: `@${label}`,
  refName,
  refId,
  label,
  href: `/${refName}/${refId}`,
  format: 0,
  detail: 1,
  mode: "token",
  style: "",
  version: 1,
});

const doc = (...children: unknown[]) => ({
  root: { type: "root", format: "", indent: 0, version: 1, direction: null, children },
});

describe("collectMentions", () => {
  it("collects mentions from nested blocks", () => {
    const content = doc(
      { type: "paragraph", children: [{ type: "text", text: "cc " }, mention("admin", "a1", "kangmin")] },
      {
        type: "akan-callout",
        children: [
          {
            type: "list",
            children: [{ type: "listitem", children: [mention("user", "u1", "hana")] }],
          },
        ],
      },
    );

    expect(collectMentions(content)).toEqual([
      { refName: "admin", refId: "a1" },
      { refName: "user", refId: "u1" },
    ]);
  });

  it("de-duplicates repeated references but keeps distinct models with the same id", () => {
    const content = doc(
      { type: "paragraph", children: [mention("admin", "a1", "kangmin"), mention("admin", "a1", "kangmin")] },
      { type: "paragraph", children: [mention("user", "a1", "hana")] },
    );

    expect(collectMentions(content)).toEqual([
      { refName: "admin", refId: "a1" },
      { refName: "user", refId: "a1" },
    ]);
  });

  it("returns [] for wiped, legacy, or garbage content", () => {
    expect(collectMentions(null)).toEqual([]);
    expect(collectMentions(undefined)).toEqual([]);
    expect(collectMentions([])).toEqual([]);
    expect(collectMentions("string")).toEqual([]);
    expect(collectMentions({ "block-1": { type: "Paragraph" } })).toEqual([]);
    expect(collectMentions(doc({ type: "paragraph", children: [{ type: "text", text: "@notAMention" }] }))).toEqual([]);
  });

  it("ignores a mention node missing its ref fields", () => {
    expect(collectMentions(doc({ type: "paragraph", children: [{ type: "akan-mention", text: "@ghost" }] }))).toEqual(
      [],
    );
  });
});
