import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodeAgentMcpServerRef } from "akanjs/common";
import { ConfigLock } from "../../cloud/configLock";
import { McpOAuth } from "./McpOAuth";
import { McpSignIn } from "./McpSignIn";
import { McpTokenStore } from "./McpTokenStore";
import { McpToolPack } from "./McpToolPack";

// A real server, not stubbed fetches: the wire contract (challenge header, well-known paths, PKCE) is under test.
class FakeProvider {
  readonly server: ReturnType<typeof Bun.serve>;
  readonly issued: string[] = [];
  readonly registrations: { redirect_uris?: string[] }[] = [];
  readonly sessions: string[] = [];
  readonly calls: { token: string; session: string | null }[] = [];
  readonly #codes = new Map<string, { challenge: string; resource: string | null }>();
  #next = 0;
  methods: string[] = ["S256"];
  registerable = true;
  refreshable = true;
  refreshExpiresIn: number | undefined = 3600;
  refusing = false;
  refreshes = 0;
  refreshDelayMs = 0;
  rotating: boolean = false;
  reused = false;
  readonly #spent = new Set<string>();

  constructor() {
    this.server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => this.#route(request) });
  }

  get origin() {
    return `http://127.0.0.1:${this.server.port}`;
  }

  get mcpUrl() {
    return `${this.origin}/mcp`;
  }

  close() {
    this.server.stop(true);
  }

  async #route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") return await this.#mcp(request);
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp")
      return Response.json({ resource: this.mcpUrl, authorization_servers: [this.origin], scopes_supported: ["read"] });
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return Response.json({
        issuer: this.origin,
        authorization_endpoint: `${this.origin}/authorize`,
        token_endpoint: `${this.origin}/token`,
        ...(this.registerable ? { registration_endpoint: `${this.origin}/register` } : {}),
        code_challenge_methods_supported: this.methods,
      });
    if (url.pathname === "/register") return await this.#register(request);
    if (url.pathname === "/authorize") return this.#authorize(url);
    if (url.pathname === "/token") return await this.#token(request);
    return new Response("not found", { status: 404 });
  }

  async #mcp(request: Request) {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token || !this.issued.includes(token) || this.refusing)
      return Response.json(
        { error_description: "Authentication is required to use this MCP server." },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${this.origin}/.well-known/oauth-protected-resource/mcp"`,
          },
        },
      );
    const body = (await request.json()) as { id?: number; method?: string };
    if (body.method === "initialize") {
      const session = `session-${this.sessions.length + 1}`;
      this.sessions.push(session);
      return Response.json(
        { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } },
        { headers: { "mcp-session-id": session } },
      );
    }
    if (body.method === "tools/list")
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [{ name: "search", description: "search it", inputSchema: { type: "object", properties: {} } }],
        },
      });
    if (body.method === "tools/call") {
      this.calls.push({ token, session: request.headers.get("mcp-session-id") });
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "found" }] } });
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result: {} });
  }

  async #register(request: Request) {
    const body = (await request.json()) as { redirect_uris?: string[] };
    this.registrations.push(body);
    this.#next += 1;
    return Response.json({ client_id: `client-${this.#next}`, redirect_uris: body.redirect_uris });
  }

  #authorize(url: URL) {
    const redirect = url.searchParams.get("redirect_uri") ?? "";
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const code = `code-${this.#codes.size + 1}`;
    this.#codes.set(code, { challenge, resource: url.searchParams.get("resource") });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    back.searchParams.set("iss", this.origin);
    return Response.redirect(back.href, 302);
  }

  async #token(request: Request) {
    const form = new URLSearchParams(await request.text());
    if (form.get("grant_type") === "refresh_token") {
      this.refreshes += 1;
      const presented = form.get("refresh_token") ?? "";
      const reuse = this.rotating && this.#spent.has(presented);
      if (this.rotating) this.#spent.add(presented);
      await Bun.sleep(this.refreshDelayMs);
      if (reuse) this.reused = true;
      if (!this.refreshable || reuse) return Response.json({ error: "invalid_grant" }, { status: 400 });
      const access = `access-refreshed-${this.issued.length + 1}`;
      this.issued.push(access);
      const refresh = this.rotating ? `refresh-for-${access}` : "refresh-2";
      return Response.json({ access_token: access, refresh_token: refresh, expires_in: this.refreshExpiresIn });
    }
    const issued = this.#codes.get(form.get("code") ?? "");
    if (!issued) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const verifier = form.get("code_verifier") ?? "";
    if (createHash("sha256").update(verifier).digest("base64url") !== issued.challenge)
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    const access = `access-${this.issued.length + 1}`;
    this.issued.push(access);
    return Response.json({ access_token: access, refresh_token: "refresh-1", expires_in: 3600, scope: "read" });
  }
}

let provider: FakeProvider;
let home: string;
let realHome: string | undefined;

const refOf = (patch: Partial<CodeAgentMcpServerRef> = {}): CodeAgentMcpServerRef => ({
  name: "fake",
  transport: "http",
  url: provider.mcpUrl,
  ...patch,
});

const browser = (url: string) => void fetch(url).catch(() => undefined);

// AKAN_CODE_HOME, not HOME: Bun caches os.homedir(), so a late HOME write would land tokens in the real ~/.akan/code.
beforeAll(() => {
  realHome = process.env.AKAN_CODE_HOME;
  home = mkdtempSync(path.join(tmpdir(), "akan-mcpauth-"));
  process.env.AKAN_CODE_HOME = home;
  expect(McpTokenStore.file().startsWith(home)).toBe(true);
});

afterAll(() => {
  if (realHome === undefined) delete process.env.AKAN_CODE_HOME;
  else process.env.AKAN_CODE_HOME = realHome;
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  provider = new FakeProvider();
  rmSync(McpTokenStore.file(), { force: true });
});

afterEach(() => {
  provider.close();
});

describe("MCP OAuth discovery", () => {
  test("the challenge names the metadata, and it is preferred over any url we could derive", () => {
    expect(
      McpOAuth.resourceMetadataUrls("https://x.dev/mcp", 'Bearer resource_metadata="https://x.dev/custom"'),
    ).toEqual(["https://x.dev/custom"]);
  });

  test("with no challenge, both spellings of the well-known url are tried", () => {
    expect(McpOAuth.resourceMetadataUrls("https://x.dev/mcp")).toEqual([
      "https://x.dev/.well-known/oauth-protected-resource/mcp",
      "https://x.dev/.well-known/oauth-protected-resource",
    ]);
  });

  test("the issuer's path is inserted after the suffix, as RFC 8414 requires", () => {
    expect(McpOAuth.serverMetadataUrls("https://x.dev/tenant/a")).toEqual([
      "https://x.dev/.well-known/oauth-authorization-server/tenant/a",
      "https://x.dev/tenant/a/.well-known/openid-configuration",
      "https://x.dev/.well-known/oauth-authorization-server",
    ]);
  });

  test("everything the flow needs is found from the server url alone", async () => {
    const server = await McpOAuth.discover(provider.mcpUrl, await McpSignIn.challenge(refOf()));
    expect(server).toMatchObject({
      issuer: provider.origin,
      authorizationEndpoint: `${provider.origin}/authorize`,
      tokenEndpoint: `${provider.origin}/token`,
      registrationEndpoint: `${provider.origin}/register`,
      resource: provider.mcpUrl,
      resourceScopes: ["read"],
    });
  });

  test("a server that will not do S256 is refused rather than downgraded", async () => {
    provider.methods = ["plain"];
    await expect(McpOAuth.discover(provider.mcpUrl)).rejects.toThrow(/S256/);
  });

  test("a server that wants no credential answers no challenge", async () => {
    const open = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => Response.json({ jsonrpc: "2.0", id: 0 }) });
    try {
      expect(await McpSignIn.challenge(refOf({ url: `http://127.0.0.1:${open.port}/mcp` }))).toBeNull();
    } finally {
      open.stop(true);
    }
  });
});

describe("MCP sign-in", () => {
  test("a browser round trip ends with a token this session can connect with", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    expect(auth.accessToken).toBe("access-1");
    expect(auth.issuer).toBe(provider.origin);
    expect(auth.resource).toBe(provider.mcpUrl);
    expect(provider.registrations).toHaveLength(1);
    expect(provider.registrations[0]?.redirect_uris?.[0]).toBe(auth.redirectUri);
    expect(McpTokenStore.read(refOf())?.accessToken).toBe("access-1");
  });

  test("the token is what makes the server publish its tools", async () => {
    const before = await McpToolPack.connect({
      workspaceRoot: home,
      profile: { name: "t", tools: { mcp: [refOf()] } } as never,
    });
    expect(before?.status[0]).toMatchObject({ auth: "required", tools: [] });
    await McpSignIn.run(refOf(), { open: browser });
    const after = await McpToolPack.connect({
      workspaceRoot: home,
      profile: { name: "t", tools: { mcp: [refOf()] } } as never,
    });
    try {
      expect(after?.status[0]).toMatchObject({ auth: "authorized" });
      expect(after?.toolNames).toEqual(["mcp__fake__search"]);
    } finally {
      after?.close();
      before?.close();
    }
  });

  test("a second sign-in reuses the client it already registered", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    await McpSignIn.run(refOf(), { open: browser });
    expect(provider.registrations).toHaveLength(1);
  });

  test("an expired token is refreshed without anybody being asked", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    McpTokenStore.write(refOf(), { ...auth, expiresAt: Date.now() - 1 });
    expect(await McpSignIn.token(refOf())).toBe("access-refreshed-2");
    expect(McpTokenStore.read(refOf())?.refreshToken).toBe("refresh-2");
  });

  test("a refreshed token the server gave no lifetime is kept until refused, not refreshed on every connect", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    McpTokenStore.write(refOf(), { ...auth, expiresAt: Date.now() - 1 });
    provider.refreshExpiresIn = undefined;
    expect(await McpSignIn.token(refOf())).toBe("access-refreshed-2");
    expect(await McpSignIn.token(refOf())).toBe("access-refreshed-2");
    expect(McpTokenStore.read(refOf())?.expiresAt).toBeUndefined();
  });

  test("a refresh the server refuses reports no token rather than throwing", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    McpTokenStore.write(refOf(), { ...auth, expiresAt: Date.now() - 1 });
    provider.refreshable = false;
    const notices: string[] = [];
    expect(await McpSignIn.token(refOf(), (message) => notices.push(message))).toBeUndefined();
    expect(notices.join(" ")).toContain("fake");
  });

  const connect = async (notices: string[] = []) =>
    await McpToolPack.connect({
      workspaceRoot: home,
      profile: { name: "t", tools: { mcp: [refOf()] } } as never,
      onNotice: (message) => notices.push(message),
    });

  test("a token refused before its expiry is refreshed once, and the connect goes through with the new one", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    provider.issued.splice(provider.issued.indexOf(auth.accessToken), 1);
    const notices: string[] = [];
    const pack = await connect(notices);
    try {
      expect(pack?.status[0]).toMatchObject({ auth: "authorized" });
      expect(pack?.toolNames).toEqual(["mcp__fake__search"]);
      expect(McpTokenStore.read(refOf())).toMatchObject({
        accessToken: "access-refreshed-1",
        refreshToken: "refresh-2",
      });
      expect(notices).toEqual([]);
    } finally {
      pack?.close();
    }
  });

  test("a refused token whose refresh fails is a sign-in, not a loop", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    provider.issued.splice(0);
    provider.refreshable = false;
    const notices: string[] = [];
    const pack = await connect(notices);
    try {
      expect(pack?.status[0]).toMatchObject({ auth: "required", tools: [] });
      expect(notices.at(-1)).toContain("/mcp login fake");
    } finally {
      pack?.close();
    }
  });

  test("a refreshed token that is refused too is not refreshed again", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    provider.refusing = true;
    const pack = await connect();
    try {
      expect(pack?.status[0]).toMatchObject({ auth: "required", tools: [] });
      expect(provider.issued).toEqual(["access-1", "access-refreshed-2"]);
    } finally {
      pack?.close();
    }
  });

  type McpExecute = (id: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
  const search = async (pack: McpToolPack | undefined) => {
    const tools = new Map<string, McpExecute>();
    const extension = pack?.extension();
    if (extension && "factory" in extension)
      extension.factory({
        registerTool: (tool: { name: string; execute: McpExecute }) => tools.set(tool.name, tool.execute),
      } as never);
    const execute = tools.get("mcp__fake__search");
    if (!execute) throw new Error("the pack published no search tool");
    return await execute("call", {});
  };

  test("a token refused mid-session is refreshed once, and the call is retried on a new session with the new token", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    const pack = await connect();
    try {
      provider.issued.splice(provider.issued.indexOf(auth.accessToken), 1);
      expect((await search(pack)).content[0]?.text).toBe("found");
      expect(provider.refreshes).toBe(1);
      expect(provider.calls).toEqual([{ token: "access-refreshed-1", session: "session-2" }]);
      expect(McpTokenStore.read(refOf())).toMatchObject({
        accessToken: "access-refreshed-1",
        refreshToken: "refresh-2",
      });
    } finally {
      pack?.close();
    }
  });

  test("calls refused together share one refresh and one new session", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    const pack = await connect();
    try {
      provider.issued.splice(provider.issued.indexOf(auth.accessToken), 1);
      const answers = await Promise.all([search(pack), search(pack), search(pack)]);
      expect(answers.map((answer) => answer.content[0]?.text)).toEqual(["found", "found", "found"]);
      expect(provider.refreshes).toBe(1);
      expect(provider.sessions).toEqual(["session-1", "session-2"]);
    } finally {
      pack?.close();
    }
  });

  test("a sub-agent's pack refused at the same moment waits on the same refresh", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    const [parent, child] = [await connect(), await connect()];
    try {
      provider.issued.splice(provider.issued.indexOf(auth.accessToken), 1);
      provider.refreshDelayMs = 100;
      const answers = await Promise.all([search(parent), search(child)]);
      expect(answers.map((answer) => answer.content[0]?.text)).toEqual(["found", "found"]);
      expect(provider.refreshes).toBe(1);
    } finally {
      parent?.close();
      child?.close();
    }
  });

  test("a session connecting with an expired token while a call is refused shares one refresh with it", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    McpTokenStore.write(refOf(), { ...auth, expiresAt: Date.now() - 1 });
    provider.refreshDelayMs = 50;
    const tokens = await Promise.all([McpSignIn.token(refOf()), McpSignIn.retryToken(refOf(), auth.accessToken)]);
    expect(tokens).toEqual(["access-refreshed-2", "access-refreshed-2"]);
    expect(provider.refreshes).toBe(1);
  });

  test("a mid-session refusal whose refresh fails names /mcp login, and the next call does not refresh again", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    const notices: string[] = [];
    const pack = await connect(notices);
    try {
      provider.issued.splice(0);
      provider.refreshable = false;
      await expect(search(pack)).rejects.toThrow("/mcp login fake");
      await expect(search(pack)).rejects.toThrow("/mcp login fake");
      expect(provider.refreshes).toBe(1);
      expect(notices.join(" ")).toContain("needs signing in again");
    } finally {
      pack?.close();
    }
  });

  test("a server whose token cannot be renewed mid-session reads as a failed connect does, until a sign-in and a reload", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    const pack = await connect();
    try {
      expect(pack?.status[0]).toMatchObject({ auth: "authorized" });
      provider.issued.splice(0);
      provider.refreshable = false;
      await expect(search(pack)).rejects.toThrow("/mcp login fake");
      expect(pack?.status[0]).toMatchObject({ auth: "required", tools: ["mcp__fake__search"] });
    } finally {
      pack?.close();
    }
    provider.refreshable = true;
    await McpSignIn.run(refOf(), { open: browser });
    const reloaded = await connect();
    try {
      expect(reloaded?.status[0]).toMatchObject({ auth: "authorized" });
      expect((await search(reloaded)).content[0]?.text).toBe("found");
    } finally {
      reloaded?.close();
    }
  });

  test("a server that refuses the renewed token too reads as needing a sign-in", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    const pack = await connect();
    try {
      provider.refusing = true;
      await expect(search(pack)).rejects.toThrow("/mcp login fake");
      expect(pack?.status[0]).toMatchObject({ auth: "required" });
    } finally {
      pack?.close();
    }
  });

  test("a refreshed token the server refuses too ends the call in /mcp login after one refresh", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    const pack = await connect();
    try {
      provider.refusing = true;
      await expect(search(pack)).rejects.toThrow("/mcp login fake");
      expect(provider.refreshes).toBe(1);
      expect(provider.issued).toEqual(["access-1", "access-refreshed-2"]);
    } finally {
      pack?.close();
    }
  });

  test("a provider that registers no clients says what to declare instead", async () => {
    provider.registerable = false;
    await expect(McpSignIn.run(refOf(), { open: browser })).rejects.toThrow(/clientId/);
  });

  test("a declared client id is used instead of registering one", async () => {
    const auth = await McpSignIn.run(refOf({ oauth: { clientId: "mine" } }), { open: browser });
    expect(auth.clientId).toBe("mine");
    expect(provider.registrations).toHaveLength(0);
  });

  test("a stdio server is told its credential goes in env", async () => {
    await expect(McpSignIn.run({ name: "s", transport: "stdio", command: "x" }, { open: browser })).rejects.toThrow(
      /env/,
    );
  });

  test("signing out forgets the token and leaves nothing behind", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    expect(McpTokenStore.clear(refOf())).toBe(true);
    expect(McpTokenStore.read(refOf())).toBeUndefined();
    expect(McpTokenStore.clear(refOf())).toBe(false);
  });

  test("signing out of a renamed server forgets the token its origin still hands it", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    expect(McpTokenStore.read(refOf({ name: "renamed" }))?.accessToken).toBe("access-1");
    expect(McpTokenStore.clear(refOf({ name: "renamed" }))).toBe(true);
    expect(McpTokenStore.read(refOf({ name: "renamed" }))).toBeUndefined();
    expect(McpTokenStore.names()).toEqual([]);
  });

  test("signing out by the name alone forgets a token whose server is no longer declared", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    expect(McpTokenStore.clear({ name: "fake" })).toBe(true);
    expect(McpTokenStore.read(refOf())).toBeUndefined();
  });
});

describe("the token file", () => {
  test("it lives outside the workspace", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    const file = McpTokenStore.file();
    expect(file.startsWith(home)).toBe(true);
    expect(await Bun.file(file).exists()).toBe(true);
  });

  test.skipIf(process.platform === "win32")("it is readable only by its owner", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    expect(statSync(McpTokenStore.file()).mode & 0o777).toBe(0o600);
  });

  test("a token is found by the server's origin, so the same name at another url gets none", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    expect(await McpSignIn.token(refOf({ url: "http://127.0.0.1:9/mcp" }))).toBeUndefined();
    expect(await McpSignIn.token(refOf({ name: "renamed" }))).toBe("access-1");
    expect(McpTokenStore.names()).toEqual(["fake"]);
  });

  test("a file an older build keyed by name keeps its tokens at the origin they were minted for", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    await Bun.write(
      McpTokenStore.file(),
      JSON.stringify({ servers: { fake: auth, broken: { ...auth, resource: "" } } }),
    );
    expect(McpTokenStore.read(refOf())?.accessToken).toBe("access-1");
    expect(McpTokenStore.read(refOf({ url: "https://elsewhere.example/mcp" }))).toBeUndefined();
    expect(McpTokenStore.names()).toEqual(["fake"]);
    McpTokenStore.write(refOf(), { ...auth, accessToken: "access-rewritten" });
    const saved = (await Bun.file(McpTokenStore.file()).json()) as { servers?: unknown; tokens: object };
    expect(saved.servers).toBeUndefined();
    expect(Object.keys(saved.tokens)).toEqual([`${provider.origin} ${provider.origin}`]);
  });

  test("a corrupt file costs the sign-ins and not the session", async () => {
    await McpSignIn.run(refOf(), { open: browser });
    await Bun.write(McpTokenStore.file(), "{ not json");
    expect(McpTokenStore.read(refOf())).toBeUndefined();
    expect(McpTokenStore.names()).toEqual([]);
  });
});

describe("two akan code processes", () => {
  const lines = (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    return async () => {
      while (!buffer.includes("\n")) {
        const chunk = await reader.read();
        if (chunk.done) return buffer;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const [line = "", ...rest] = buffer.split("\n");
      buffer = rest.join("\n");
      return line;
    };
  };

  // A separate `bun` per session, pointed at this file's AKAN_CODE_HOME so both read and write the one token file.
  const session = async () => {
    const script = path.join(home, `session-${crypto.randomUUID()}.ts`);
    await Bun.write(
      script,
      `import { McpToolPack } from ${JSON.stringify(path.resolve(import.meta.dir, "McpToolPack.ts"))};
import { McpTokenStore } from ${JSON.stringify(path.resolve(import.meta.dir, "McpTokenStore.ts"))};
if (!McpTokenStore.file().startsWith(${JSON.stringify(home)})) throw new Error("refusing to touch " + McpTokenStore.file());
const pack = await McpToolPack.connect({
  workspaceRoot: ${JSON.stringify(home)},
  profile: { name: "t", tools: { mcp: [${JSON.stringify(refOf())}] } },
});
let execute;
const extension = pack?.extension();
if (extension && "factory" in extension)
  extension.factory({ registerTool: (tool) => { if (tool.name === "mcp__fake__search") execute = tool.execute; } });
process.stdout.write("ready\\n");
for await (const line of console) if (line.trim() === "go") break;
const answer = await execute("call", {}).then((result) => result.content[0].text, (error) => "error: " + String(error));
process.stdout.write(JSON.stringify(answer) + "\\n");
pack?.close();
process.exit(0);
`,
    );
    const proc = Bun.spawn(["bun", script], {
      env: { ...process.env, AKAN_CODE_HOME: home },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    return { proc, line: lines(proc.stdout) };
  };

  test("a refresh waits for the lock another session holds, then takes the token that session stored", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    const taken = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const elsewhere = ConfigLock.run(McpTokenStore.lockFile(), async () => {
      taken.resolve();
      await released.promise;
    });
    await taken.promise;
    const retried = McpSignIn.retryToken(refOf(), auth.accessToken);
    McpTokenStore.write(refOf(), { ...auth, accessToken: "access-elsewhere", refreshToken: "refresh-elsewhere" });
    released.resolve();
    await elsewhere;
    expect(await retried).toBe("access-elsewhere");
    expect(provider.refreshes).toBe(0);
  });

  test("refused at the same moment, they make one refresh between them, and both calls go through", async () => {
    const auth = await McpSignIn.run(refOf(), { open: browser });
    provider.rotating = true;
    provider.refreshDelayMs = 300;
    const sessions = [await session(), await session()];
    try {
      expect(await Promise.all(sessions.map(({ line }) => line()))).toEqual(["ready", "ready"]);
      provider.issued.splice(provider.issued.indexOf(auth.accessToken), 1);
      for (const { proc } of sessions) {
        proc.stdin.write("go\n");
        await proc.stdin.flush();
      }
      const answers = await Promise.all(sessions.map(({ line }) => line()));
      expect(answers).toEqual(['"found"', '"found"']);
      expect(provider.refreshes).toBe(1);
      expect(provider.reused).toBe(false);
    } finally {
      for (const { proc } of sessions) proc.kill();
    }
  }, 30_000);
});
