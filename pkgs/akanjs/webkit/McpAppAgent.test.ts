import { afterEach, describe, expect, jest, test } from "bun:test";
import { AgenticSurface } from "use-agentic";
import { McpAppApprovals } from "./McpAppApprovals";
import type { McpAppBridge, McpAppToolServer } from "./McpAppBridge";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
//? Imported once the env is set: the store module reads it while it loads.
const { McpAppAgent } = await import("./McpAppAgent");
const { csrLocation } = await import("akanjs/client");
csrLocation.useMemory("/en/memo", { leave: () => undefined, reload: () => undefined });

const fakeBridge = ({ takesContext = false } = {}) => {
  const sent = { contexts: [] as string[], changed: 0, server: null as McpAppToolServer | null };
  const bridge = {
    hostCapabilities: takesContext ? { updateModelContext: { text: {} } } : {},
    toolsListed: false,
    serveTools: (server: McpAppToolServer) => {
      sent.server = server;
    },
    toolsChanged: () => {
      sent.changed += 1;
    },
    updateModelContext: async (text: string) => {
      sent.contexts.push(text);
    },
  };
  return { bridge: bridge as unknown as McpAppBridge, sent };
};

const screen = () => {
  const surface = new AgenticSurface();
  let title = "Trip";
  surface.registerTool([], {
    name: "renameMemo",
    description: "Rename the memo on screen.",
    parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    confirm: "Rename this memo?",
    run: (args) => {
      title = String(args.title);
      return title;
    },
  });
  surface.registerTool([], { name: "countMemos", description: "Count the memos.", settle: false, run: () => 3 });
  surface.registerTool([], { name: "pickColor", description: "Ask the user for a color.", card: () => null });
  surface.registerResource([], { name: "memoTitle", read: () => title });
  return { surface, titleOf: () => title };
};

const settled = () => jest.advanceTimersByTime(McpAppAgent.settleMs);
const never = new AbortController().signal;

afterEach(() => {
  jest.useRealTimers();
  globalThis.__AKAN_EMBED__ = undefined;
});

describe("McpAppAgent", () => {
  test("offers the screen's tools to the host, leaving out the ones a person answers in a chat", () => {
    const { surface } = screen();
    const agent = new McpAppAgent(fakeBridge().bridge, surface, new McpAppApprovals());
    expect(agent.tools()).toEqual([
      {
        name: "countMemos",
        description: "Count the memos.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      {
        name: "renameMemo",
        description: "Rename the memo on screen.",
        inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
    ]);
  });

  test("runs a declared confirmation past the person in the view, and reports what the call changed", async () => {
    const { surface, titleOf } = screen();
    const approvals = new McpAppApprovals();
    const agent = new McpAppAgent(fakeBridge().bridge, surface, approvals);
    const declined = agent.call("renameMemo", { title: "Paris" }, never);
    await Promise.resolve();
    expect(approvals.current()?.message).toBe("Rename this memo?");
    approvals.current()?.reject();
    expect(await declined).toEqual({ content: [{ type: "text", text: "The user declined." }], isError: true });
    expect(titleOf()).toBe("Trip");

    const approved = agent.call("renameMemo", { title: "Paris" }, never);
    await Promise.resolve();
    approvals.current()?.approve();
    expect(await approved).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ result: "Paris", changes: [{ name: "memoTitle", value: "Paris" }] }) },
      ],
    });
    expect(await agent.call("countMemos", {}, never)).toEqual({ content: [{ type: "text", text: "3" }] });
    expect((await agent.call("missing", {}, never)).isError).toBe(true);
  });

  test("asks for a confirmation in a webview that has no `AbortSignal.any`", async () => {
    const statics = AbortSignal as unknown as Record<string, unknown>;
    const any = statics.any;
    statics.any = undefined;
    try {
      const { surface, titleOf } = screen();
      const approvals = new McpAppApprovals();
      const approved = new McpAppAgent(fakeBridge().bridge, surface, approvals).call(
        "renameMemo",
        { title: "Rome" },
        never,
      );
      await Promise.resolve();
      expect(approvals.current()?.message).toBe("Rename this memo?");
      approvals.current()?.approve();
      expect((await approved).isError).toBeUndefined();
      expect(titleOf()).toBe("Rome");
    } finally {
      statics.any = any;
    }
  });

  test("withdraws a question nobody answered before the host would give up on the call", async () => {
    jest.useFakeTimers();
    const { surface, titleOf } = screen();
    const approvals = new McpAppApprovals();
    const asked = new McpAppAgent(fakeBridge().bridge, surface, approvals).call("renameMemo", { title: "Oslo" }, never);
    await Promise.resolve();
    jest.advanceTimersByTime(McpAppAgent.approvalMs - 1);
    expect(approvals.current()?.message).toBe("Rename this memo?");
    jest.advanceTimersByTime(1);
    expect(await asked).toEqual({
      content: [{ type: "text", text: "The call ended before the user decided." }],
      isError: true,
    });
    expect(approvals.current()).toBeNull();
    expect(titleOf()).toBe("Trip");
  });

  test("tells the host only when the tool list moved, and hands it the screen's context once per change", () => {
    jest.useFakeTimers();
    const { surface } = screen();
    const { bridge, sent } = fakeBridge({ takesContext: true });
    new McpAppAgent(bridge, surface, new McpAppApprovals()).start();
    settled();
    expect(sent.changed).toBe(0);
    expect(sent.contexts).toHaveLength(1);
    expect(sent.contexts[0]).toContain("memoTitle");
    expect(sent.server?.list().map((tool) => tool.name)).toEqual(["countMemos", "renameMemo"]);

    const remove = surface.registerTool([], { name: "archiveMemo", description: "Archive it.", run: () => true });
    settled();
    expect(sent.changed).toBe(1);
    remove();
    settled();
    expect(sent.changed).toBe(2);
    expect(sent.contexts).toHaveLength(1);
  });

  test("keeps the context to itself when the host does not take one", () => {
    jest.useFakeTimers();
    const { surface } = screen();
    const { bridge, sent } = fakeBridge();
    new McpAppAgent(bridge, surface, new McpAppApprovals()).start();
    settled();
    expect(sent.contexts).toEqual([]);
  });

  test("names the screen at the app's own address, not at the host's sandbox", () => {
    globalThis.__AKAN_EMBED__ = { kind: "mcp-app", origin: "https://app.example.com" };
    const agent = new McpAppAgent(fakeBridge().bridge, screen().surface, new McpAppApprovals());
    expect(agent.context()).toContain("open in the chat: https://app.example.com/en/memo\n");
  });
});
