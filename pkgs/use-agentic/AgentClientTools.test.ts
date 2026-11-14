import { describe, expect, test } from "bun:test";
import { AgentClientTools } from "./AgentClientTools";
import { AgenticSurface } from "./AgenticSurface";
import type { ToolActionEntry } from "./types";

const surfaceWith = (...entries: (Partial<ToolActionEntry> & { name: string })[]) => {
  const surface = new AgenticSurface();
  for (const entry of entries) surface.registerTool([], { run: () => undefined, ...entry });
  return surface;
};

describe("AgentClientTools", () => {
  test("lists the screen's tools as a server loop takes them, every one a write", () => {
    const surface = surfaceWith(
      { name: "fillForm", description: "Fill the open form", parameters: { type: "object" } },
      { name: "removeCard", confirm: true },
    );
    expect(new AgentClientTools(surface).list()).toEqual([
      {
        name: "fillForm",
        description: "Fill the open form",
        parameters: { type: "object" },
        needsConfirm: false,
        readOnly: false,
      },
      { name: "removeCard", needsConfirm: true, readOnly: false },
    ]);
  });

  test("runs a parked call through the chat's pipeline, refusals included", async () => {
    let removed = 0;
    const surface = surfaceWith(
      { name: "fillForm", run: (args) => ({ filled: Object.keys(args) }) },
      {
        name: "removeCard",
        confirm: "Remove the card?",
        run: () => {
          removed += 1;
        },
      },
    );
    const unasked = new AgentClientTools(surface);
    expect(await unasked.run({ id: "c1", name: "fillForm", args: { title: "Review" } })).toEqual({
      id: "c1",
      name: "fillForm",
      result: { filled: ["title"] },
    });
    expect((await unasked.run({ id: "c2", name: "removeCard", args: {} })).error).toContain("approval");
    expect(removed).toBe(0);
    const asked: string[] = [];
    const approving = new AgentClientTools(surface, {
      approve: async (request) => {
        asked.push(request.message);
        return true;
      },
    });
    expect((await approving.run({ id: "c3", name: "removeCard", args: {} })).error).toBeUndefined();
    expect(asked).toEqual(["Remove the card?"]);
    expect(removed).toBe(1);
    expect((await unasked.run({ id: "c4", name: "closedForm", args: {} })).error).toBe("Unknown tool: closedForm");
  });
});
