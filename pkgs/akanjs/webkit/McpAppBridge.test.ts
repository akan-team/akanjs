import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "bun:test";
import type { FetchBridgeCall, RestoredError } from "akanjs/fetch";
import { MCP_APP_META } from "../signal/mcp/mcpProtocol";
import { McpAppBridge } from "./McpAppBridge";
import { McpAppFetchBridge } from "./McpAppFetchBridge";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";

interface Sent {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const globals = globalThis as unknown as Record<string, unknown>;
const saved = globals.window;
const sent: Sent[] = [];
const listeners: ((event: { source: unknown; data: unknown }) => void)[] = [];
const parent = { postMessage: (message: Sent) => void sent.push(message) };

beforeAll(() => {
  globals.window = {
    parent,
    location: new URL("about:srcdoc"),
    addEventListener: (_type: string, listener: (event: { source: unknown; data: unknown }) => void) =>
      void listeners.push(listener),
  };
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  globals.window = saved;
});

const fromHost = (data: object) => {
  for (const listener of listeners) listener({ source: parent, data: { jsonrpc: "2.0", ...data } });
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const lastRequest = (method: string) => sent.filter((message) => message.method === method).at(-1);

const started = async (toolResult: object, hostCapabilities: object = {}) => {
  sent.length = 0;
  listeners.length = 0;
  const bridge = new McpAppBridge();
  const connecting = bridge.connect();
  const initialize = lastRequest("ui/initialize");
  fromHost({
    id: initialize?.id,
    result: { hostContext: { theme: "dark", styles: { variables: { a: "1" } } }, hostCapabilities },
  });
  await settle();
  fromHost({ method: "ui/notifications/tool-result", params: toolResult });
  return { bridge, start: await connecting, initialize };
};

const call = (returns: FetchBridgeCall["returns"], args: Record<string, unknown> = {}): FetchBridgeCall => ({
  key: "probe",
  type: "query",
  args,
  returns,
});

describe("McpAppBridge", () => {
  test("introduces the view by `appInfo`, and starts where the result points with its seeded reads", async () => {
    const { start, initialize } = await started({
      structuredContent: { href: "/en/memo" },
      _meta: {
        [MCP_APP_META.snapshot]: [{ key: "memo", args: {}, value: 1 }],
        [MCP_APP_META.account]: { self: { id: "u1" } },
      },
    });
    expect(initialize?.params?.appInfo).toEqual({ name: "test", version: "0" });
    expect(initialize?.params?.clientInfo).toBeUndefined();
    expect(sent.some((message) => message.method === "ui/notifications/initialized")).toBe(true);
    expect(start).toEqual({
      ok: true,
      href: "/en/memo",
      snapshot: [{ key: "memo", args: {}, value: 1 }],
      account: { self: { id: "u1" } },
    });
  });

  test("reports a result that names no screen, or an error, or a cancellation, instead of a start", async () => {
    const refused = await started({ content: [{ type: "text", text: "No screen exists." }], isError: true });
    expect(refused.start).toEqual({ ok: false, message: "No screen exists." });
    const briefOnly = await started({ content: [{ type: "text", text: "Name the memo." }] });
    expect(briefOnly.start).toEqual({ ok: false, message: "Name the memo." });
    sent.length = 0;
    listeners.length = 0;
    const connecting = new McpAppBridge().connect();
    fromHost({ id: lastRequest("ui/initialize")?.id, result: {} });
    await settle();
    fromHost({ method: "ui/notifications/tool-cancelled", params: {} });
    expect(await connecting).toEqual({ ok: false, message: "The tool call was cancelled." });
  });

  test("answers the host's tools requests with the reason once the screen will never start, held ones included", async () => {
    sent.length = 0;
    listeners.length = 0;
    const connecting = new McpAppBridge().connect();
    fromHost({ id: 70, method: "tools/list", params: {} });
    fromHost({ id: lastRequest("ui/initialize")?.id, result: {} });
    await settle();
    fromHost({
      method: "ui/notifications/tool-result",
      params: { content: [{ type: "text", text: "No screen exists." }], isError: true },
    });
    expect(await connecting).toEqual({ ok: false, message: "No screen exists." });
    fromHost({ id: 71, method: "tools/call", params: { name: "renameMemo", arguments: {} } });
    await settle();
    expect(sent.find((message) => message.id === 70)?.error).toEqual({ code: -32603, message: "No screen exists." });
    expect(sent.find((message) => message.id === 71)?.error).toEqual({ code: -32603, message: "No screen exists." });
  });

  test("answers a seeded read once from the snapshot, then asks the host as a view", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const fetchBridge = bridge.fetchBridge([{ key: "probe", args: { id: "1" }, value: "seeded" }]);
    const returns = { refName: "String" };
    expect(await fetchBridge.call(call(returns, { id: "1", skip: undefined }))).toBe("seeded");
    expect(lastRequest("tools/call")).toBeUndefined();
    const asked = fetchBridge.call(call(returns, { id: "1" }));
    const request = lastRequest("tools/call");
    expect(request?.params).toEqual({ name: "probe", arguments: { id: "1" }, _meta: { [MCP_APP_META.view]: true } });
    fromHost({
      id: request?.id,
      result: { content: [{ type: "text", text: "masked" }], _meta: { [MCP_APP_META.value]: "raw" } },
    });
    expect(await asked).toBe("raw");
  });

  test("sends no argument the caller left unset, so a slice's empty `Any` args never reach the server", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const unset = { args: null, skip: null, limit: undefined };
    const asked = bridge.fetchBridge([]).call(call({ refName: "String" }, { id: "1", sort: "latest", ...unset }));
    const request = lastRequest("tools/call");
    expect(request?.params?.arguments).toStrictEqual({ id: "1", sort: "latest" });
    fromHost({ id: request?.id, result: { _meta: { [MCP_APP_META.value]: "page 2" } } });
    expect(await asked).toBe("page 2");
  });

  test("gives up on a relayed call the host never answers, as an HTTP call does, unless the call names its budget", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const fetchBridge = bridge.fetchBridge([]);
    jest.useFakeTimers();
    const keyOf = async (asked: Promise<unknown>) =>
      ((await asked.catch((error: unknown) => error)) as RestoredError).toJSON?.();
    const unanswered = keyOf(fetchBridge.call(call({ refName: "String" })));
    const lateId = lastRequest("tools/call")?.id;
    jest.advanceTimersByTime(McpAppFetchBridge.callTimeoutMs);
    expect(await unanswered).toEqual({ error: "base.error.gatewayTimeout", statusCode: 408, data: { status: 408 } });
    fromHost({ id: lateId, result: { _meta: { [MCP_APP_META.value]: "too late" } } });

    const short = keyOf(fetchBridge.call(Object.assign(call({ refName: "String" }), { timeout: 5_000 })));
    jest.advanceTimersByTime(5_000);
    expect((await short)?.error).toBe("base.error.gatewayTimeout");

    const unbounded = fetchBridge.call(Object.assign(call({ refName: "String" }), { timeout: false }));
    jest.advanceTimersByTime(McpAppFetchBridge.callTimeoutMs * 10);
    fromHost({ id: lastRequest("tools/call")?.id, result: { _meta: { [MCP_APP_META.value]: "slow but sure" } } });
    expect(await unbounded).toBe("slow but sure");
  });

  test("reads a masked answer by the declared return when the host dropped the view's value", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const fetchBridge = bridge.fetchBridge([]);
    const answer = async (returns: FetchBridgeCall["returns"], result: object) => {
      const asked = fetchBridge.call(call(returns));
      fromHost({ id: lastRequest("tools/call")?.id, result });
      return await asked;
    };
    const text = (value: string) => ({ content: [{ type: "text", text: value }] });
    expect(await answer({ refName: "String", arrDepth: 1 }, text('["a","b"]'))).toEqual(["a", "b"]);
    expect(await answer({ refName: "String", nullable: true }, text("null"))).toBeNull();
    expect(await answer({ refName: "ID" }, text("123"))).toBe("123");
    expect(await answer({ refName: "Int" }, text("7"))).toBe(7);
    expect(
      await answer({ refName: "memo", modelType: "light", arrDepth: 1 }, { structuredContent: { items: [1] } }),
    ).toEqual([1]);
    await expect(answer({ refName: "String" }, { ...text("Unknown tool: probe."), isError: true })).rejects.toThrow(
      "Unknown tool: probe.",
    );
  });

  test("restores a refusal the server described for the view, key and data intact", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const asked = bridge.fetchBridge([]).call(call({ refName: "String" }));
    fromHost({
      id: lastRequest("tools/call")?.id,
      result: {
        content: [{ type: "text", text: "The memo is locked." }],
        isError: true,
        _meta: { [MCP_APP_META.error]: { error: "memo.error.locked", statusCode: 409, data: { id: "1" } } },
      },
    });
    const error = (await asked.catch((caught: unknown) => caught)) as { toJSON?: () => unknown };
    expect(error.toJSON?.()).toEqual({ error: "memo.error.locked", statusCode: 409, data: { id: "1" } });
  });

  test("serves the screen's own tools to the host, holding an early list, and answers no call it cancelled", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } }, { updateModelContext: { text: {} } });
    expect(bridge.hostCapabilities).toEqual({ updateModelContext: { text: {} } });
    let release: () => void = () => undefined;
    let cancelled = false;
    fromHost({ id: 59, method: "tools/list", params: {} });
    expect(sent.some((message) => message.id === 59)).toBe(false);
    bridge.serveTools({
      list: () => [{ name: "renameMemo", inputSchema: { type: "object" } }],
      call: async (name, args, signal) => {
        if (name === "slow") {
          signal.addEventListener("abort", () => {
            cancelled = true;
          });
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return { content: [{ type: "text", text: `${name}:${JSON.stringify(args)}` }] };
      },
    });
    expect(sent.find((message) => message.id === 59)?.result).toEqual({
      tools: [{ name: "renameMemo", inputSchema: { type: "object" } }],
    });
    fromHost({ id: 60, method: "tools/list", params: {} });
    fromHost({ id: 61, method: "tools/call", params: { name: "renameMemo", arguments: { title: "Paris" } } });
    fromHost({ id: 62, method: "tools/call", params: { name: "slow" } });
    await settle();
    expect(bridge.toolsListed).toBe(true);
    expect(sent.find((message) => message.id === 60)?.result).toEqual({
      tools: [{ name: "renameMemo", inputSchema: { type: "object" } }],
    });
    expect(sent.find((message) => message.id === 61)?.result).toEqual({
      content: [{ type: "text", text: 'renameMemo:{"title":"Paris"}' }],
    });
    fromHost({ method: "notifications/cancelled", params: { requestId: 62 } });
    release();
    await settle();
    expect(cancelled).toBe(true);
    expect(sent.some((message) => message.id === 62)).toBe(false);

    void bridge.updateModelContext("On the memo list.");
    expect(lastRequest("ui/update-model-context")?.params).toEqual({
      content: [{ type: "text", text: "On the memo list." }],
    });
  });

  test("answers the host's own requests and refuses what it does not implement", async () => {
    await started({ structuredContent: { href: "/en" } });
    fromHost({ id: 41, method: "ping", params: {} });
    fromHost({ id: 42, method: "ui/call-app-tool", params: {} });
    expect(sent.find((message) => message.id === 41)?.result).toEqual({});
    expect(sent.find((message) => message.id === 42)?.error?.code).toBe(-32601);
  });

  test("drops the old theme's styles when the host changes the theme alone", async () => {
    const { bridge } = await started({ structuredContent: { href: "/en" } });
    const seen: unknown[] = [];
    bridge.onHostContext((context) => void seen.push(context));
    fromHost({ method: "ui/notifications/host-context-changed", params: { displayMode: "fullscreen" } });
    fromHost({ method: "ui/notifications/host-context-changed", params: { theme: "light" } });
    expect(seen).toEqual([
      { theme: "dark", styles: { variables: { a: "1" } }, displayMode: "fullscreen" },
      { theme: "light", displayMode: "fullscreen" },
    ]);
  });
});
