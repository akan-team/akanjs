import { describe, expect, test } from "bun:test";
import { Compaction } from "./Compaction";
import type { ChatMessage } from "./types";

const user = (text: string): ChatMessage => ({ role: "user", text });
const assistant = (text: string): ChatMessage => ({ role: "assistant", text });
const call = (id: string, name: string): ChatMessage => ({ role: "assistant", toolCalls: [{ id, name, args: {} }] });
const result = (id: string, name: string): ChatMessage => ({ role: "tool", toolResults: [{ id, name, result: 1 }] });

describe("Compaction.cutAt", () => {
  test("cuts at the first user message at or below the kept tail", () => {
    const messages = [user("a"), assistant("b"), user("c"), assistant("d"), user("e"), assistant("f")];
    expect(Compaction.cutAt(messages, 2)).toBe(4);
    expect(Compaction.cutAt(messages, 3)).toBe(4);
  });

  test("never leaves a tool result whose call was summarized away", () => {
    const messages = [user("a"), call("c1", "bump"), result("c1", "bump"), assistant("done")];
    // Two messages back is the result, and cutting there would send a tool response with no call above it, so the
    // cut slides past it to the message below.
    expect(Compaction.cutAt(messages, 2)).toBe(3);
  });

  test("cuts a tool-driven turn that has no user message anywhere near its tail", () => {
    const messages = [
      user("go"),
      ...Array.from({ length: 5 }, (_, at) => [call(`c${at}`, "read"), result(`c${at}`, "read")]).flat(),
    ];
    // The kept half opens on the call, not on the result answering it — the pairing is what the cut protects.
    expect(Compaction.cutAt(messages, 6)).toBe(5);
    expect(messages[5]).toEqual(call("c2", "read"));
  });

  test("a tail that is only a trailing result keeps the call it answers with it", () => {
    const messages = [user("go"), call("c1", "read"), result("c1", "read")];
    expect(Compaction.cutAt(messages, 1)).toBe(1);
  });

  test("keeping nothing summarizes the whole transcript, and an empty one has nothing to cut", () => {
    expect(Compaction.cutAt([user("a"), assistant("b")], 0)).toBe(2);
    expect(Compaction.cutAt([], 0)).toBe(-1);
    expect(Compaction.cutAt([user("a")], 4)).toBe(-1);
  });
});

describe("Compaction.tokensOf", () => {
  test("estimates from the JSON a turn posts and ignores what is never sent", () => {
    const long = user("x".repeat(4000));
    expect(Compaction.tokensOf([long])).toBeGreaterThan(1000);
    expect(Compaction.tokensOf([{ role: "assistant", text: "y".repeat(4000), local: true }])).toBe(0);
  });

  test("an inlined picture costs what a provider bills for it, not its base64", () => {
    const shot = { name: "screen.png", mimeType: "image/png", data: "A".repeat(400_000) };
    const tokens = Compaction.tokensOf([{ role: "user", text: "fix this button", attachments: [shot] }]);
    expect(tokens).toBeGreaterThanOrEqual(Compaction.imageTokens);
    expect(tokens).toBeLessThan(Compaction.imageTokens + 100);
    // Text is what a text attachment costs, so it is still counted as it rides.
    const notes = { name: "notes.txt", mimeType: "text/plain", text: "x".repeat(40_000) };
    expect(Compaction.tokensOf([{ role: "user", attachments: [notes] }])).toBeGreaterThan(10_000);
  });
});

describe("Compaction.promptTokensOf", () => {
  test("starts from the provider's count and estimates only what arrived after it", () => {
    const counted: ChatMessage = { role: "assistant", text: "a", usage: { input: 50_000, output: 1_000 } };
    const after = result("c1", "read");
    expect(Compaction.promptTokensOf([user("x".repeat(40_000)), counted, after], () => 999_999)).toBe(
      51_000 + Compaction.tokensOf([after]),
    );
  });

  test("with no count, the tools and the context stand in beside the transcript", () => {
    const messages = [user("hi")];
    expect(Compaction.promptTokensOf(messages, () => 3_000)).toBe(Compaction.tokensOf(messages) + 3_000);
  });

  test("a count is never part of what the estimate says is posted", () => {
    const counted: ChatMessage = { role: "assistant", text: "a", usage: { input: 1, output: 1 } };
    expect(Compaction.tokensOf([counted])).toBe(Compaction.tokensOf([assistant("a")]));
  });
});

describe("Compaction.thresholdOf", () => {
  test("holds back the answer ceiling and the buffer, and is off while the window is unknown", () => {
    expect(Compaction.thresholdOf({ window: 128_000, output: 8_000 }, 13_000)).toBe(107_000);
    expect(Compaction.thresholdOf({ window: 128_000 }, 13_000)).toBe(128_000 - Compaction.answerTokens - 13_000);
    expect(Compaction.thresholdOf({}, 13_000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("Compaction.digest", () => {
  test("names every part of a message a summary would need", () => {
    const digest = Compaction.digest([
      user("trim the intro"),
      { role: "assistant", text: "on it", toolCalls: [{ id: "c1", name: "setSeconds", args: { seconds: 4 } }] },
      { role: "tool", toolResults: [{ id: "c1", name: "setSeconds", error: "refused" }] },
    ]);
    expect(digest).toContain("user: trim the intro");
    expect(digest).toContain('[called setSeconds {"seconds":4}]');
    expect(digest).toContain("[failed setSeconds: refused]");
  });

  test("a folded reference keeps its pointer and says the value is gone", () => {
    const digest = Compaction.digest([
      {
        role: "user",
        text: "make this more dynamic",
        references: [
          {
            refName: "videoCut",
            refId: "6a1f",
            label: "Cut 3 body",
            path: "cutFrames.2.content",
            value: "a wide shot",
          },
        ],
      },
    ]);
    // The value is the whole point of dropping it, and the pointer is the whole point of keeping the line: a model
    // that needs the text again has a refName and an id to read it with.
    expect(digest).toContain("[referenced videoCut/6a1f#cutFrames.2.content (Cut 3 body), value not carried");
    expect(digest).not.toContain("a wide shot");
  });

  test("an overlong digest gives way in the middle, keeping where it started and where it now is", () => {
    const messages = [user("THE ORIGINAL ASK"), ...Array.from({ length: 40 }, (_, at) => assistant(`m${at}`))];
    const digest = Compaction.digest(messages, 200);
    expect(digest.length).toBeLessThanOrEqual(260);
    expect(digest).toContain("THE ORIGINAL ASK");
    expect(digest).toContain("m39");
    expect(digest).toContain("messages omitted");
  });

  test("a previous summary is carried whole under its own label, outside the bound", () => {
    const notes = `${"n".repeat(2_999)}END`;
    const messages = [Compaction.message(notes), ...Array.from({ length: 40 }, (_, at) => assistant(`m${at}`))];
    const digest = Compaction.digest(messages, 200);
    // Clipped, the rest of it is gone from every summary after this one; as a `user:` line it reads as an ask.
    expect(digest.startsWith(`previous summary:\n${notes}`)).toBe(true);
    expect(digest).not.toContain(`user: ${notes.slice(0, 10)}`);
    expect(digest).toContain("m39");
    expect(digest).toContain("messages omitted");
  });

  test("clips one enormous message instead of letting it fill the digest", () => {
    const digest = Compaction.digest([user("x".repeat(5000))]);
    expect(digest.length).toBeLessThan(1400);
    expect(digest.endsWith("...")).toBe(true);
  });
});
