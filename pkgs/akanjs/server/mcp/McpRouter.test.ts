import { describe, expect, test } from "bun:test";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { MCP_LEGACY_PRIOR_VERSION, MCP_LEGACY_VERSION, MCP_MODERN_VERSION } from "../../signal/mcp";
import { McpRouter } from "./McpRouter";

// The advertised server name is the runtime identity, not a server option, so `getEnv()` has to resolve.
process.env.AKAN_PUBLIC_APP_NAME = "probe";
process.env.AKAN_PUBLIC_REPO_NAME = "akan";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
process.env.AKAN_PUBLIC_ENV = "local";
process.env.AKAN_PUBLIC_OPERATION_MODE = "local";

const routes = () =>
  new McpRouter({
    registry: getDefaultInjectRegistry(),
    live: getDefaultLiveRegistry(),
    middleware: new Map(),
    env: {},
    instructions: "Domain tools.",
  }).createRoutes() as Record<string, Record<string, (req: Request) => Promise<Response> | Response>>;

const post = async (body: object, init: RequestInit = {}) => {
  const handlers = routes()["/mcp"];
  const req = new Request("http://127.0.0.1:8080/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const res = await handlers.POST(req);
  // A transport-level refusal answers in plain text, before any JSON-RPC envelope exists to put an error in.
  const text = await res.text();
  let json: { result?: any; error?: { code: number; message: string; data?: any }; raw?: string };
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json };
};

const meta = {
  "io.modelcontextprotocol/protocolVersion": MCP_MODERN_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};

/** The mirror headers the modern era requires on every POST, which the server refuses a request for omitting. */
const mirrored = (method: string, name?: string) => ({
  "MCP-Protocol-Version": MCP_MODERN_VERSION,
  "Mcp-Method": method,
  ...(name ? { "Mcp-Name": name } : {}),
});

describe("McpRouter transport", () => {
  test("refuses the verbs neither era uses", async () => {
    const handlers = routes()["/mcp"];
    for (const verb of ["GET", "DELETE"] as const) {
      const res = await handlers[verb](new Request("http://127.0.0.1:8080/mcp"));
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    }
  });

  test("answers a notification with 202 and no body", async () => {
    const handlers = routes()["/mcp"];
    const res = await handlers.POST(
      new Request("http://127.0.0.1:8080/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
    );
    expect(res.status).toBe(202);
  });

  test("rejects a cross-origin post but allows a client that sends none", async () => {
    const { res } = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { headers: { Origin: "http://evil.test" } },
    );
    expect(res.status).toBe(403);
    const matching = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { headers: { Origin: "http://127.0.0.1:8080" } },
    );
    expect(matching.res.status).toBe(200);
    // MCP clients are not browsers and normally send no Origin at all.
    const absent = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(absent.res.status).toBe(200);
  });

  test("reports a broken body as a parse error rather than crashing", async () => {
    const handlers = routes()["/mcp"];
    const res = await handlers.POST(new Request("http://127.0.0.1:8080/mcp", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });
});

describe("McpRouter eras", () => {
  test("serves the legacy handshake without issuing a session", async () => {
    const { res, json } = await post({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: MCP_LEGACY_VERSION, capabilities: {} },
    });
    expect(res.headers.get("Mcp-Session-Id")).toBeNull();
    expect(json.result.protocolVersion).toBe(MCP_LEGACY_VERSION);
    // Nothing opted in on this registry, so nothing is advertised — a client that reads capabilities skips three
    // listing round-trips it would otherwise make to discover three empty shelves.
    expect(json.result.capabilities).toEqual({});
    // Legacy results carry no `resultType`; a legacy client would ignore it, but keeping the eras separable
    // is what makes a captured exchange readable.
    expect(json.result.resultType).toBeUndefined();
  });

  test("answers a legacy revision it speaks with that same revision", async () => {
    const { json } = await post({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: MCP_LEGACY_PRIOR_VERSION, capabilities: {} },
    });
    // The wire this server implements is identical across the legacy revisions, so listing only the measured one
    // turned every other legacy client into a disconnect.
    expect(json.result.protocolVersion).toBe(MCP_LEGACY_PRIOR_VERSION);
  });

  test("meets an unknown proposal at whichever end of its list is closer", async () => {
    const older = await post({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    // A client proposes the newest it speaks. Older than everything here means the newest is hopeless for it.
    expect(older.json.result.protocolVersion).toBe(MCP_LEGACY_PRIOR_VERSION);
    const newer = await post({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2099-01-01" },
    });
    expect(newer.json.result.protocolVersion).toBe(MCP_MODERN_VERSION);
  });

  test("serves modern discovery with resultType and serverInfo", async () => {
    const { json } = await post(
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } },
      { headers: mirrored("server/discover") },
    );
    expect(json.result.resultType).toBe("complete");
    expect(json.result.supportedVersions).toEqual([MCP_MODERN_VERSION, MCP_LEGACY_VERSION, MCP_LEGACY_PRIOR_VERSION]);
    expect(json.result._meta["io.modelcontextprotocol/serverInfo"]).toEqual({ name: "probe-mcp", version: "0.0.0" });
  });

  test("treats a legacy _meta as legacy instead of demanding modern fields", async () => {
    // Legacy `_meta` exists too — it carries `progressToken`. Reading that as modern would reject a valid request.
    const { res, json } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { progressToken: "abc" } },
    });
    expect(res.status).toBe(200);
    expect(json.result.tools).toEqual([]);
    expect(json.result.resultType).toBeUndefined();
  });

  test("requires the modern _meta fields once a modern request declares itself", async () => {
    const { res, json } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": MCP_MODERN_VERSION } },
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32602);
  });

  test("names the versions it speaks when asked for one it does not", async () => {
    const { res, json } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "2030-01-01" } },
    });
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32022);
    expect(json.error?.data).toEqual({
      requested: "2030-01-01",
      supported: [MCP_MODERN_VERSION, MCP_LEGACY_VERSION, MCP_LEGACY_PRIOR_VERSION],
    });
  });
});

describe("McpRouter header mirroring", () => {
  test("rejects a header that contradicts the body", async () => {
    const { res, json } = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } },
      { headers: { "Mcp-Method": "tools/call" } },
    );
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe(-32020);
  });

  test("accepts a matching header and refuses one that was left out", async () => {
    const matched = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } },
      { headers: mirrored("tools/list") },
    );
    expect(matched.res.status).toBe(200);
    // A gateway rule keyed on `mcp-method` never fires for a request that omits it, so absence buys the same
    // bypass as a header that lies. The modern era requires the mirror; a legacy request never gets here.
    const absent = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } });
    expect(absent.res.status).toBe(400);
    expect(absent.json.error?.code).toBe(-32020);
    expect(absent.json.error?.message).toContain("mcp-protocol-version");
  });

  test("compares a base64 sentinel by its decoded value", async () => {
    const encoded = `=?base64?${Buffer.from("한글도구", "utf8").toString("base64")}?=`;
    const { res, json } = await post(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "한글도구", _meta: meta } },
      { headers: mirrored("tools/call", encoded) },
    );
    // Past the header check, so the failure is the unknown tool rather than a mismatch.
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
    expect(json.error?.message).toContain("Unknown tool");
  });
});

describe("McpRouter methods", () => {
  test("returns empty catalogues when nothing opted in", async () => {
    for (const [method, key] of [
      ["tools/list", "tools"],
      ["resources/list", "resources"],
      ["resources/templates/list", "resourceTemplates"],
      ["prompts/list", "prompts"],
    ] as const) {
      const { json } = await post({ jsonrpc: "2.0", id: 1, method });
      expect(json.result[key]).toEqual([]);
    }
  });

  test("answers an unimplemented method with 404 for a modern client and 200 for a legacy one", async () => {
    const modern = await post(
      { jsonrpc: "2.0", id: 1, method: "sampling/createMessage", params: { _meta: meta } },
      { headers: mirrored("sampling/createMessage") },
    );
    // The 404 is what tells a modern client the refusal came from an MCP server and not from a proxy.
    expect(modern.res.status).toBe(404);
    expect(modern.json.error?.code).toBe(-32601);
    // A legacy client spends 404 on "your session is gone, start a new one", so the same status there invites a
    // re-handshake loop over a method that will still not exist. It reads the JSON-RPC error at 200 instead.
    const legacy = await post({ jsonrpc: "2.0", id: 1, method: "sampling/createMessage" });
    expect(legacy.res.status).toBe(200);
    expect(legacy.json.error?.code).toBe(-32601);
    // A legacy client cannot fall forward, so this message is the only diagnostic it gets.
    expect(legacy.json.error?.message).toContain(MCP_MODERN_VERSION);
  });

  test("keeps a tool-level failure at HTTP 200 inside the JSON-RPC error", async () => {
    const { res, json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope" } });
    expect(res.status).toBe(200);
    expect(json.error?.code).toBe(-32602);
  });

  test("refuses an unadvertised resource uri", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "akan://user/1" } });
    expect(json.error?.code).toBe(-32602);
  });
});
