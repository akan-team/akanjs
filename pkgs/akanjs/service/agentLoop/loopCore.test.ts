import { describe, expect, test } from "bun:test";
import type { AgentWireMessage } from "../predefinedAdaptor/llm.adaptor";
import { LoopCompaction } from "./loopCompaction";
import { LoopToolOutput } from "./loopToolOutput";
import { LoopTranscript } from "./loopTranscript";

const user = (text: string): AgentWireMessage => ({ role: "user", text });
const assistant = (text: string): AgentWireMessage => ({ role: "assistant", text });
const call = (id: string, name = "bump"): AgentWireMessage => ({
  role: "assistant",
  toolCalls: [{ id, name, args: {} }],
});
const answer = (id: string, name = "bump"): AgentWireMessage => ({
  role: "tool",
  toolResults: [{ id, name, result: 1 }],
});

describe("LoopTranscript.sanitize", () => {
  test("a paired transcript is left as it is", () => {
    const messages = [user("go"), call("c1"), answer("c1")];
    expect(LoopTranscript.sanitize(messages)).toEqual(messages);
  });

  test("a call nothing answered is answered, so the pairing holds", () => {
    const repaired = LoopTranscript.sanitize([user("go"), call("c1")]);
    expect(repaired.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(repaired[2]?.toolResults).toEqual([{ id: "c1", name: "bump", error: LoopTranscript.unanswered }]);
  });

  test("only the calls left over are answered when a batch stopped part-way", () => {
    const partial: AgentWireMessage[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "c1", name: "first", args: {} },
          { id: "c2", name: "second", args: {} },
        ],
      },
      { role: "tool", toolResults: [{ id: "c1", name: "first", result: "done" }] },
    ];
    const repaired = LoopTranscript.sanitize(partial);
    expect(repaired).toHaveLength(2);
    expect(repaired[1]?.toolResults).toEqual([
      { id: "c2", name: "second", error: LoopTranscript.unanswered },
      { id: "c1", name: "first", result: "done" },
    ]);
  });

  test("a tool message stored twice answers its call once", () => {
    const repaired = LoopTranscript.sanitize([call("c1"), answer("c1"), answer("c1")]);
    expect(repaired.map((message) => message.role)).toEqual(["assistant", "tool"]);
    expect(repaired[1]?.toolResults).toHaveLength(1);
  });

  test("a call id a later round reuses keeps its own result", () => {
    const messages = [call("c1"), answer("c1"), call("c1"), answer("c1")];
    expect(LoopTranscript.sanitize(messages)).toEqual(messages);
  });

  test("a batch split over two tool messages reaches the provider as one", () => {
    const split: AgentWireMessage[] = [
      {
        role: "assistant",
        toolCalls: [
          { id: "c1", name: "first", args: {} },
          { id: "c2", name: "second", args: {} },
        ],
      },
      { role: "tool", toolResults: [{ id: "c1", name: "first", result: "one" }] },
      { role: "tool", toolResults: [{ id: "c2", name: "second", result: "two" }] },
    ];
    const repaired = LoopTranscript.sanitize(split);
    expect(repaired.map((message) => message.role)).toEqual(["assistant", "tool"]);
    expect(repaired[1]?.toolResults?.map((result) => result.id)).toEqual(["c1", "c2"]);
    expect(split[1]?.toolResults).toHaveLength(1);
  });

  test("a result whose call was cut away is dropped, and an empty assistant draft too", () => {
    expect(LoopTranscript.sanitize([answer("c1"), user("and now?")])).toEqual([user("and now?")]);
    const errored: AgentWireMessage = { role: "assistant", error: "refused" };
    expect(LoopTranscript.sanitize([{ role: "assistant" }, errored, assistant("here")])).toEqual([
      errored,
      assistant("here"),
    ]);
  });
});

describe("LoopTranscript.seen", () => {
  test("a file a tool returned before the latest ask rides as a note; the latest turn's keep their bytes", () => {
    const viewed = (id: string, name: string): AgentWireMessage[] => [
      { role: "assistant", toolCalls: [{ id, name: "viewImage", args: {} }] },
      {
        role: "tool",
        toolResults: [
          {
            id,
            name: "viewImage",
            attachments: [
              { name, mimeType: "image/jpeg", data: "AAAA" },
              { name: "caption.txt", mimeType: "text/plain", text: "a red coat" },
            ],
          },
        ],
      },
    ];
    const messages = [
      user("what is she wearing?"),
      ...viewed("c1", "card.jpg"),
      user("and this?"),
      ...viewed("c2", "b.jpg"),
    ];
    const wire = LoopTranscript.wire(messages);
    const [earlier, caption] = wire[2]?.toolResults?.[0]?.attachments ?? [];
    expect(earlier).toEqual({
      name: "card.jpg",
      mimeType: "image/jpeg",
      text: "[Seen earlier and no longer attached. To look at it again, call viewImage again.]",
    });
    expect(caption?.text).toBe("a red coat");
    expect(wire[5]?.toolResults?.[0]?.attachments?.[0]?.data).toBe("AAAA");
    expect(messages.at(2)?.toolResults?.[0]?.attachments?.[0]?.data).toBe("AAAA");
  });

  test("a compaction summary is not the ask that ends a turn", () => {
    const shot: AgentWireMessage = {
      role: "tool",
      toolResults: [
        { id: "c1", name: "viewImage", attachments: [{ name: "a.jpg", mimeType: "image/jpeg", data: "A" }] },
      ],
    };
    const messages = [user("look"), call("c1", "viewImage"), shot, LoopCompaction.message("earlier: a card")];
    expect(LoopTranscript.seen(messages)[2]?.toolResults?.[0]?.attachments?.[0]?.data).toBe("A");
  });
});

describe("LoopTranscript.pending", () => {
  test("is the last assistant's calls no later result answers", () => {
    const batch: AgentWireMessage = {
      role: "assistant",
      toolCalls: [
        { id: "c1", name: "first", args: {} },
        { id: "c2", name: "second", args: {} },
      ],
    };
    expect(LoopTranscript.pending([user("go"), batch]).map((pending) => pending.id)).toEqual(["c1", "c2"]);
    const partial: AgentWireMessage[] = [
      user("go"),
      batch,
      { role: "tool", toolResults: [{ id: "c1", name: "first" }] },
    ];
    expect(LoopTranscript.pending(partial).map((pending) => pending.id)).toEqual(["c2"]);
  });

  test("is nothing once a later message moved the conversation on", () => {
    expect(LoopTranscript.pending([user("go"), call("c1"), user("never mind")])).toEqual([]);
    expect(LoopTranscript.pending([user("go"), call("c1"), answer("c1")])).toEqual([]);
    expect(LoopTranscript.pending([user("go"), call("c1"), answer("c1"), assistant("done")])).toEqual([]);
  });
});

describe("LoopToolOutput.clipped", () => {
  test("a result inside the ceiling is handed back untouched, absent keys staying absent", () => {
    const result = { id: "c1", name: "read", result: { rows: [1, 2, 3] }, changes: [{ name: "count", value: 3 }] };
    expect(LoopToolOutput.clipped(result)).toEqual(result);
    expect("result" in LoopToolOutput.clipped({ id: "c1", name: "bump" })).toBe(false);
  });

  test("an enormous value becomes a clipped string led by what it was", () => {
    const huge = { data: "x".repeat(LoopToolOutput.limit * 3) };
    const text = LoopToolOutput.clipped({ id: "c1", name: "read", result: huge }).result as string;
    expect(text.startsWith("[Truncated")).toBe(true);
    expect(text).toContain(String(JSON.stringify(huge).length));
    expect(text.length).toBeLessThan(LoopToolOutput.limit * 1.2);
  });

  test("an error, a change and a text attachment are bounded too; a file past its byte ceiling becomes a note", () => {
    const long = "y".repeat(LoopToolOutput.limit * 2);
    const clipped = LoopToolOutput.clipped({
      id: "c1",
      name: "read",
      error: long,
      changes: [
        { name: "rows", value: long },
        { name: "count", value: 2 },
      ],
      attachments: [
        { name: "a.txt", mimeType: "text/plain", text: long },
        { name: "big.png", mimeType: "image/png", data: "A".repeat(LoopToolOutput.attachmentBytes * 2) },
      ],
    });
    expect(clipped.error?.startsWith("[Truncated")).toBe(true);
    const [rows, count] = (clipped.changes ?? []) as { value: unknown }[];
    expect(String(rows?.value)).toContain("Truncated");
    expect(count?.value).toBe(2);
    expect(clipped.attachments?.[0]?.text?.startsWith("[Truncated")).toBe(true);
    expect(clipped.attachments?.[1]).toEqual({
      name: "big.png",
      mimeType: "image/png",
      text: expect.stringContaining("[Not attached:"),
    });
  });
});

describe("LoopCompaction", () => {
  test("cuts at a user message, or else above a call, never on an orphaned result", () => {
    const talk = [user("a"), assistant("b"), user("c"), assistant("d"), user("e"), assistant("f")];
    expect(LoopCompaction.cutAt(talk, 2)).toBe(4);
    expect(LoopCompaction.cutAt([user("a"), call("c1"), answer("c1"), assistant("done")], 2)).toBe(3);
    const tools = [user("go"), ...Array.from({ length: 5 }, (_, at) => [call(`c${at}`), answer(`c${at}`)]).flat()];
    expect(LoopCompaction.cutAt(tools, 6)).toBe(5);
    expect(LoopCompaction.cutAt([user("go"), call("c1"), answer("c1")], 1)).toBe(1);
    expect(LoopCompaction.cutAt([user("a"), assistant("b")], 0)).toBe(2);
    expect(LoopCompaction.cutAt([], 0)).toBe(-1);
    expect(LoopCompaction.cutAt([user("a")], 4)).toBe(-1);
  });

  test("estimates four characters a token, and an inlined picture at its billed rate", () => {
    expect(LoopCompaction.tokensOf([user("x".repeat(4000))])).toBeGreaterThan(1000);
    const shot = { name: "s.png", mimeType: "image/png", data: "A".repeat(400_000) };
    const tokens = LoopCompaction.tokensOf([{ role: "user", text: "fix", attachments: [shot] }]);
    expect(tokens).toBeGreaterThanOrEqual(LoopCompaction.imageTokens);
    expect(tokens).toBeLessThan(LoopCompaction.imageTokens + 100);
  });

  test("digests calls, failures and files by name, giving way in the middle and carrying a summary whole", () => {
    const digest = LoopCompaction.digest([
      user("trim the intro"),
      { role: "assistant", text: "on it", toolCalls: [{ id: "c1", name: "setSeconds", args: { seconds: 4 } }] },
      {
        role: "tool",
        toolResults: [
          {
            id: "c1",
            name: "setSeconds",
            error: "refused",
            attachments: [{ name: "a.jpg", mimeType: "image/jpeg", data: "QUJD" }],
          },
        ],
      },
    ]);
    expect(digest).toContain('[called setSeconds {"seconds":4}]');
    expect(digest).toContain("[failed setSeconds: refused]");
    expect(digest).toContain("[setSeconds returned a.jpg, content not carried into this summary]");
    expect(digest).not.toContain("QUJD");
    const notes = `${"n".repeat(2_999)}END`;
    const long = [
      LoopCompaction.message(notes),
      user("THE ASK"),
      ...Array.from({ length: 40 }, (_, at) => assistant(`m${at}`)),
    ];
    const bounded = LoopCompaction.digest(long, 200);
    expect(bounded.startsWith(`previous summary:\n${notes}`)).toBe(true);
    expect(bounded).toContain("THE ASK");
    expect(bounded).toContain("m39");
    expect(bounded).toContain("messages omitted");
  });
});
