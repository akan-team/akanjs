import { describe, expect, test } from "bun:test";
import type { LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";
import { ToolNames } from "./toolNames";

const turn = (partial: Partial<LlmTurnRequest>): LlmTurnRequest => ({
  messages: [],
  tools: [],
  context: [],
  ...partial,
});

describe("ToolNames", () => {
  test("leaves a request whose names the wire already accepts exactly as it was", () => {
    const request = turn({ tools: [{ name: "createPost" }, { name: "remove-post" }] });
    const names = ToolNames.of(request);
    expect(names.renamed).toBe(false);
    expect(names.encode(request)).toBe(request);
    expect(names.wire("createPost")).toBe("createPost");
  });

  test("folds a zone's scope join to `__` and reads the answer back as the surface registered it", () => {
    const request = turn({ tools: [{ name: "videoProjectDraft.createVideoProject" }] });
    const names = ToolNames.of(request);
    expect(names.encode(request).tools[0].name).toBe("videoProjectDraft__createVideoProject");
    expect(names.decode([{ id: "c1", name: "videoProjectDraft__createVideoProject", args: {} }])).toEqual([
      { id: "c1", name: "videoProjectDraft.createVideoProject", args: {} },
    ]);
  });

  test("renames the calls the transcript carries, including a tool that has left the screen", () => {
    const request = turn({
      tools: [{ name: "draft.save" }],
      messages: [
        { role: "assistant", toolCalls: [{ id: "c1", name: "gone.oldTool", args: {} }] },
        { role: "tool", toolResults: [{ id: "c1", name: "gone.oldTool", result: 1 }] },
        { role: "user", text: "and now?" },
      ],
    });
    const encoded = ToolNames.of(request).encode(request);
    expect(encoded.messages[0].toolCalls?.[0].name).toBe("gone__oldTool");
    expect(encoded.messages[1].toolResults?.[0].name).toBe("gone__oldTool");
    // A message carrying no calls is passed through untouched rather than rebuilt.
    expect(encoded.messages[2]).toBe(request.messages[2]);
  });

  test("never takes a name a real tool already answers to", () => {
    const request = turn({ tools: [{ name: "zone.pick" }, { name: "zone__pick" }] });
    const names = ToolNames.of(request);
    expect(names.wire("zone__pick")).toBe("zone__pick");
    expect(names.wire("zone.pick")).toBe("zone__pick_2");
    expect(names.surface("zone__pick_2")).toBe("zone.pick");
  });

  test("caps a long name at the limit both dialects impose, keeping the tool's own name", () => {
    const long = `${"deeplyNestedZone.".repeat(5)}createVideoProject`;
    const wire = ToolNames.of(turn({ tools: [{ name: long }] })).wire(long);
    expect(wire.length).toBe(ToolNames.limit);
    expect(wire).toEndWith("createVideoProject");
    expect(wire).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("a name the model invented is handed on unchanged, so the surface still answers Unknown tool", () => {
    const names = ToolNames.of(turn({ tools: [{ name: "zone.pick" }] }));
    expect(names.decode([{ id: "c1", name: "createVideoProject", args: {} }])[0].name).toBe("createVideoProject");
  });
});
