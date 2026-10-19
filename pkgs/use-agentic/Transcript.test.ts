import { describe, expect, test } from "bun:test";
import { Transcript } from "./Transcript";
import type { ChatMessage } from "./types";

const call = (id: string): ChatMessage => ({ role: "assistant", toolCalls: [{ id, name: "bump", args: {} }] });
const answer = (id: string): ChatMessage => ({ role: "tool", toolResults: [{ id, name: "bump", result: 1 }] });

describe("Transcript", () => {
  test("a paired transcript is left as it is", () => {
    const messages = [{ role: "user", text: "go" } as ChatMessage, call("c1"), answer("c1")];
    expect(Transcript.sanitize(messages)).toEqual(messages);
  });

  test("a call nothing answered is answered, so the pairing holds", () => {
    const repaired = Transcript.sanitize([{ role: "user", text: "go" }, call("c1")]);
    expect(repaired.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(repaired[2].toolResults).toEqual([{ id: "c1", name: "bump", error: Transcript.unanswered }]);
  });

  test("only the calls left over are answered when a turn was stopped part-way", () => {
    const partial: ChatMessage[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "c1", name: "first", args: {} },
          { id: "c2", name: "second", args: {} },
        ],
      },
      { role: "tool", toolResults: [{ id: "c1", name: "first", result: "done" }] },
    ];
    const repaired = Transcript.sanitize(partial);
    expect(repaired).toHaveLength(3);
    expect(repaired[1].toolResults).toEqual([{ id: "c2", name: "second", error: Transcript.unanswered }]);
    expect(repaired[2].toolResults).toEqual([{ id: "c1", name: "first", result: "done" }]);
  });

  test("a result whose call was cut away is dropped — the cap can start mid-pair", () => {
    const decapitated: ChatMessage[] = [answer("c1"), { role: "user", text: "and now?" }];
    expect(Transcript.sanitize(decapitated)).toEqual([{ role: "user", text: "and now?" }]);
  });

  test("an assistant draft that never said anything is dropped, an errored one kept", () => {
    const messages: ChatMessage[] = [
      { role: "assistant" },
      { role: "assistant", error: "the relay refused" },
      { role: "assistant", text: "here" },
    ];
    expect(Transcript.sanitize(messages)).toEqual([messages[1], messages[2]]);
  });

  test("wire leaves out what the host wrote for itself", () => {
    const messages: ChatMessage[] = [
      { role: "user", text: "go" },
      { role: "assistant", text: "the help text", local: true },
      { role: "assistant", text: "answered" },
    ];
    expect(Transcript.wire(messages)).toEqual([messages[0], messages[2]]);
  });

  test("a picture a tool returned before the latest ask rides as a note; the latest turn's keep their bytes", () => {
    const viewed = (id: string, name: string): ChatMessage[] => [
      { role: "assistant", toolCalls: [{ id, name: "viewImage", args: { src: `/${name}` } }] },
      {
        role: "tool",
        toolResults: [
          {
            id,
            name: "viewImage",
            result: `Attached ${name}`,
            attachments: [
              { name, mimeType: "image/jpeg", data: "AAAA", ref: "f1" },
              { name: "caption.txt", mimeType: "text/plain", text: "a red coat" },
            ],
          },
        ],
      },
    ];
    const messages: ChatMessage[] = [
      { role: "user", text: "what is she wearing?" },
      ...viewed("c1", "card.jpg"),
      { role: "assistant", text: "A red coat." },
      { role: "assistant", text: "/help output", local: true },
      { role: "user", text: "and this one?" },
      ...viewed("c2", "other.jpg"),
    ];
    const wire = Transcript.wire(messages);
    const [earlier, caption] = wire[2].toolResults?.[0]?.attachments ?? [];
    expect(earlier).toEqual({
      name: "card.jpg",
      mimeType: "image/jpeg",
      text: "[Seen earlier and no longer attached. To look at it again, call viewImage again while it is on screen.]",
    });
    expect(caption).toEqual({ name: "caption.txt", mimeType: "text/plain", text: "a red coat" });
    expect(wire[6].toolResults?.[0]?.attachments?.[0]?.data).toBe("AAAA");
    expect(messages[2].toolResults?.[0]?.attachments?.[0]?.data).toBe("AAAA");
  });

  test("a compaction summary is not the ask that ends a turn", () => {
    const messages: ChatMessage[] = [
      { role: "user", text: "look at the card" },
      { role: "assistant", toolCalls: [{ id: "c1", name: "viewImage", args: {} }] },
      {
        role: "tool",
        toolResults: [
          { id: "c1", name: "viewImage", attachments: [{ name: "card.jpg", mimeType: "image/jpeg", data: "AAAA" }] },
        ],
      },
      { role: "user", text: "earlier: the user asked about a card", summary: true },
    ];
    expect(Transcript.seen(messages)[2].toolResults?.[0]?.attachments?.[0]?.data).toBe("AAAA");
  });
});
