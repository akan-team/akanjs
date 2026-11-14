import { describe, expect, test } from "bun:test";
import { RemoteFetch, type RemoteFetchOptions } from "./RemoteFetch";
import { RemoteMcp } from "./RemoteMcp";
import { RemoteOAuth } from "./RemoteOAuth";
import { type RemoteAccess, RemoteSource } from "./RemoteSource";
import { RemoteError } from "./remoteError";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  serverName?: string;
}
type Answer = (seen: Seen) => Response;

const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);
const fetcherOf = (answer: Answer, options: RemoteFetchOptions = {}) => {
  const seen: Seen[] = [];
  const fetcher = new RemoteFetch({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (input, init) => {
      const entry: Seen = {
        url: input.href,
        method: init.method ?? "GET",
        headers: Object.fromEntries(new Headers(init.headers)),
        body: typeof init.body === "string" ? init.body : "",
        ...(init.tls ? { serverName: init.tls.serverName } : {}),
      };
      seen.push(entry);
      return answer(entry);
    },
    ...options,
  });
  return { fetcher, seen };
};
const codeOf = async (work: Promise<unknown>) => {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof RemoteError ? error.code : String(error);
  }
};
const rpc = (seen: Seen) => JSON.parse(seen.body) as { id?: number; method: string; params?: Record<string, unknown> };

describe("RemoteFetch", () => {
  test("connects to the address it checked, under the name's own host header and certificate name", async () => {
    const { fetcher, seen } = fetcherOf(() => json({ ok: true }));
    const answer = await fetcher.json("https://shop.example.com/mcp");
    expect(answer).toEqual({ status: 200, body: { ok: true } });
    expect(seen[0]).toMatchObject({ url: "https://93.184.216.34/mcp", serverName: "shop.example.com" });
    expect(seen[0]?.headers.host).toBe("shop.example.com");
  });

  test("refuses plain http, credentials in the url, and a name or literal inside a private network", async () => {
    const { fetcher, seen } = fetcherOf(() => json({}));
    expect(await codeOf(fetcher.send("http://shop.example.com/mcp"))).toBe("remoteUrlRejected");
    expect(await codeOf(fetcher.send("https://ann:pw@shop.example.com/mcp"))).toBe("remoteUrlRejected");
    expect(await codeOf(fetcher.send("https://127.0.0.1/mcp"))).toBe("remoteUrlRejected");
    expect(await codeOf(fetcher.send("https://[::1]/mcp"))).toBe("remoteUrlRejected");
    expect(await codeOf(fetcher.send("file:///etc/passwd"))).toBe("remoteUrlRejected");
    const parked = fetcherOf(() => json({}), {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ],
    });
    expect(await codeOf(parked.fetcher.send("https://shop.example.com/mcp"))).toBe("remoteUrlRejected");
    expect([...seen, ...parked.seen]).toEqual([]);
  });

  test("follows no redirect and reads no more than its cap", async () => {
    const moved = fetcherOf(() => new Response(null, { status: 302, headers: { location: "http://10.0.0.7/" } }));
    expect(await codeOf(moved.fetcher.send("https://shop.example.com/mcp"))).toBe("remoteUrlRejected");
    const large = fetcherOf(() => new Response("x".repeat(64)), { maxBytes: 16 });
    expect(await codeOf(large.fetcher.send("https://shop.example.com/mcp"))).toBe("remoteTooLarge");
  });

  test("reaches a private address as it is only when told to", async () => {
    const { fetcher, seen } = fetcherOf(() => json({}), { allowPrivate: true });
    await fetcher.send("http://127.0.0.1:8282/mcp");
    expect(seen[0]?.url).toBe("http://127.0.0.1:8282/mcp");
  });
});

const metadata = {
  issuer: "https://shop.example.com",
  authorization_endpoint: "https://shop.example.com/oauth/authorize",
  token_endpoint: "https://shop.example.com/oauth/token",
  registration_endpoint: "https://shop.example.com/oauth/register",
  revocation_endpoint: "https://shop.example.com/oauth/revoke",
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
};

describe("RemoteOAuth", () => {
  test("discovers the authorization server from the MCP endpoint's own origin", async () => {
    const { fetcher, seen } = fetcherOf(({ url }) => {
      if (url.endsWith("/.well-known/oauth-protected-resource/mcp"))
        return json({ resource: "https://shop.example.com/mcp", authorization_servers: ["https://shop.example.com"] });
      if (url.endsWith("/.well-known/oauth-authorization-server")) return json(metadata);
      return new Response(null, { status: 404 });
    });
    const challenge = 'Bearer resource_metadata="https://evil.example.net/.well-known/oauth-protected-resource"';
    const server = await RemoteOAuth.discover(fetcher, "https://shop.example.com/mcp", challenge);
    expect(server).toMatchObject({
      issuer: "https://shop.example.com",
      resource: "https://shop.example.com/mcp",
      secretPost: true,
      revocationEndpoint: "https://shop.example.com/oauth/revoke",
    });
    expect(seen.some(({ headers }) => headers.host === "evil.example.net")).toBe(false);
  });

  test("refuses a server that offers no S256, and one that publishes nothing", async () => {
    const weak = fetcherOf(() => json({ ...metadata, code_challenge_methods_supported: ["plain"] }));
    expect(await codeOf(RemoteOAuth.discover(weak.fetcher, "https://shop.example.com/mcp"))).toBe("remoteOAuth");
    const silent = fetcherOf(() => new Response(null, { status: 404 }));
    expect(await codeOf(RemoteOAuth.discover(silent.fetcher, "https://shop.example.com/mcp"))).toBe("remoteOAuth");
  });

  test("registers as a confidential client and sends its secret with every grant", async () => {
    const { fetcher, seen } = fetcherOf(({ url }) =>
      url.endsWith("/oauth/register")
        ? json({ client_id: "dyn_1", client_secret: "s3" }, { status: 201 })
        : json({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    );
    const server = {
      ...(await RemoteOAuth.discover(fetcherOf(() => json(metadata)).fetcher, "https://shop.example.com/mcp")),
    };
    const client = await RemoteOAuth.register(fetcher, server, {
      redirectUri: "https://hub.example.org/remote/callback",
      clientName: "Hub",
    });
    expect(JSON.parse(seen[0]?.body ?? "{}")).toMatchObject({
      token_endpoint_auth_method: "client_secret_post",
      redirect_uris: ["https://hub.example.org/remote/callback"],
    });
    const { verifier, challenge, state } = RemoteOAuth.pkce();
    const authorize = new URL(
      RemoteOAuth.authorizeUrl(server, {
        clientId: client.clientId,
        redirectUri: "https://hub.example.org/cb",
        state,
        challenge,
      }),
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("resource")).toBe(server.resource);
    expect(server.resource).toBe("https://shop.example.com/mcp");
    const tokens = await RemoteOAuth.exchange(fetcher, server, {
      code: "c1",
      verifier,
      redirectUri: "https://hub.example.org/cb",
      client,
    });
    expect(tokens.accessToken).toBe("at");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    const form = new URLSearchParams(seen[1]?.body);
    expect(Object.fromEntries(form)).toMatchObject({
      client_id: "dyn_1",
      client_secret: "s3",
      code_verifier: verifier,
      resource: "https://shop.example.com/mcp",
    });
  });

  test("takes a server's metadata only when it names the issuer it was asked about", async () => {
    const other = fetcherOf(({ url }) =>
      url.includes("/.well-known/oauth-authorization-server") || url.includes("/.well-known/openid-configuration")
        ? json({ ...metadata, issuer: "https://auth.example.org" })
        : new Response(null, { status: 404 }),
    );
    expect(await codeOf(RemoteOAuth.discover(other.fetcher, "https://shop.example.com/mcp"))).toBe("remoteOAuth");

    const tenant = "https://auth.example.org/tenant";
    const pathed = fetcherOf(({ url }) => {
      if (url.endsWith("/.well-known/oauth-protected-resource/mcp"))
        return json({ resource: "https://shop.example.com/mcp", authorization_servers: [tenant] });
      if (url === "https://93.184.216.34/.well-known/oauth-authorization-server/tenant")
        return json({ ...metadata, issuer: "https://auth.example.org" });
      if (url === "https://93.184.216.34/tenant/.well-known/openid-configuration")
        return json({ ...metadata, issuer: tenant, token_endpoint: `${tenant}/token` });
      return new Response(null, { status: 404 });
    });
    const server = await RemoteOAuth.discover(pathed.fetcher, "https://shop.example.com/mcp");
    expect(server).toMatchObject({ issuer: tenant, tokenEndpoint: `${tenant}/token` });

    const slashed = fetcherOf(({ url }) =>
      url.endsWith("/.well-known/oauth-authorization-server")
        ? json({ ...metadata, issuer: "https://shop.example.com/" })
        : new Response(null, { status: 404 }),
    );
    expect((await RemoteOAuth.discover(slashed.fetcher, "https://shop.example.com/mcp")).issuer).toBe(
      "https://shop.example.com/",
    );
  });

  test("takes the resource a server's metadata names only on the MCP endpoint's origin and path", async () => {
    const discoverWith = async (resource: string, mcpUrl = "https://shop.example.com/api/mcp") => {
      const { fetcher, seen } = fetcherOf(({ url }) => {
        if (url.includes("/.well-known/oauth-protected-resource"))
          return json({ resource, authorization_servers: ["https://shop.example.com"] });
        if (url.endsWith("/.well-known/oauth-authorization-server")) return json(metadata);
        return new Response(null, { status: 404 });
      });
      try {
        return { resource: (await RemoteOAuth.discover(fetcher, mcpUrl)).resource, seen };
      } catch (error) {
        return { resource: error instanceof RemoteError ? error.code : String(error), seen };
      }
    };
    expect((await discoverWith("https://shop.example.com/api/mcp")).resource).toBe("https://shop.example.com/api/mcp");
    expect((await discoverWith("https://shop.example.com/api")).resource).toBe("https://shop.example.com/api");
    expect((await discoverWith("https://shop.example.com")).resource).toBe("https://shop.example.com");
    expect((await discoverWith("https://shop.example.com/api/mcp/")).resource).toBe(
      "https://shop.example.com/api/mcp/",
    );
    expect((await discoverWith("https://shop.example.com/ap")).resource).toBe("remoteOAuth");
    expect((await discoverWith("https://shop.example.com/api/mcp/tools")).resource).toBe("remoteOAuth");
    const foreign = await discoverWith("https://mail.example.org/api/mcp");
    expect(foreign.resource).toBe("remoteOAuth");
    expect(foreign.seen.some(({ url }) => url.includes("oauth-authorization-server"))).toBe(false);
  });

  test("takes only https endpoints out of a server's metadata", async () => {
    const plain = fetcherOf(() => json({ ...metadata, token_endpoint: "http://shop.example.com/oauth/token" }));
    expect(await codeOf(RemoteOAuth.discover(plain.fetcher, "https://shop.example.com/mcp"))).toBe("remoteOAuth");
  });

  test("tells a token endpoint that refused from one that could not answer", async () => {
    const refreshWith = async (response: () => Response) => {
      const { fetcher } = fetcherOf(response);
      try {
        await RemoteOAuth.refresh(
          fetcher,
          { tokenEndpoint: metadata.token_endpoint, resource: "https://shop.example.com/mcp" },
          { refreshToken: "old", client: { clientId: "dyn_1" } },
        );
        return null;
      } catch (error) {
        return error instanceof RemoteError ? [error.code, error.data?.status] : String(error);
      }
    };
    expect(await refreshWith(() => json({ error: "invalid_grant" }, { status: 400 }))).toEqual(["remoteOAuth", 400]);
    expect(await refreshWith(() => new Response(null, { status: 401 }))).toEqual(["remoteOAuth", 401]);
    expect(await refreshWith(() => json({ token_type: "Bearer" }))).toEqual(["remoteOAuth", 200]);
    expect(await refreshWith(() => json({ error: "temporarily_unavailable" }, { status: 503 }))).toEqual([
      "remoteUnavailable",
      503,
    ]);
    expect(await refreshWith(() => new Response("slow down", { status: 429 }))).toEqual(["remoteUnavailable", 429]);
    expect(await refreshWith(() => new Response("<html>maintenance</html>", { status: 200 }))).toEqual([
      "remoteUnavailable",
      200,
    ]);
  });

  test("names the refusal of a token request", async () => {
    const { fetcher } = fetcherOf(() => json({ error: "invalid_grant" }, { status: 400 }));
    const refused = RemoteOAuth.refresh(
      fetcher,
      { tokenEndpoint: metadata.token_endpoint, resource: "https://shop.example.com/mcp" },
      { refreshToken: "old", client: { clientId: "dyn_1" } },
    );
    await expect(refused).rejects.toThrow("invalid_grant");
  });
});

const tools = [
  {
    name: "orderList",
    description: "Lists orders.",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
  },
  { name: "refundOrder", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } },
  {
    name: "showOrder",
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://shop/apps/showOrder" }, "akanjs/static": true },
  },
];
const serverOf = (valid: () => string, call: (name: string, meta: unknown) => unknown = () => ({ content: [] })) =>
  fetcherOf((seen) => {
    if (seen.headers.authorization !== `Bearer ${valid()}`)
      return new Response(null, { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="x"' } });
    const { id, method, params } = rpc(seen);
    if (id === undefined) return new Response(null, { status: 202 });
    if (method === "initialize") return json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18" } });
    if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools } });
    return json({ jsonrpc: "2.0", id, result: call(String(params?.name), params?._meta) });
  });
const sourceOf = (fetcher: RemoteFetch, access: RemoteAccess, allow?: string[]) =>
  new RemoteSource({
    name: "shop",
    url: "https://shop.example.com/mcp",
    description: "The shop.",
    access,
    fetcher,
    ...(allow ? { allow } : {}),
  });

describe("RemoteMcp", () => {
  test("throws a 401 with its challenge, and reads an SSE answer and every page", async () => {
    const closed = serverOf(() => "good");
    const refused = new RemoteMcp(closed.fetcher, "https://shop.example.com/mcp", "bad").listTools();
    expect(await codeOf(refused)).toBe("remoteUnauthorized");

    let page = 0;
    const paged = fetcherOf((seen) => {
      const { id, method } = rpc(seen);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize")
        return new Response(`event: message\ndata: ${JSON.stringify({ id, result: {} })}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        });
      page += 1;
      return json({ id, result: { tools: [{ name: `t${page}` }], ...(page < 3 ? { nextCursor: `c${page}` } : {}) } });
    });
    const listed = await new RemoteMcp(paged.fetcher, "https://shop.example.com/mcp", "good").listTools();
    expect(listed.map((tool) => tool.name)).toEqual(["t1", "t2", "t3"]);
  });

  test("stops paging when a server hands back the cursor it was given", async () => {
    const { fetcher, seen } = fetcherOf((entry) => {
      const { id, method } = rpc(entry);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize") return json({ id, result: {} });
      return json({ id, result: { tools: [{ name: `t${id}` }], nextCursor: "same" } });
    });
    await new RemoteMcp(fetcher, "https://shop.example.com/mcp", "good").listTools();
    expect(seen.filter((entry) => rpc(entry).method === "tools/list")).toHaveLength(2);
  });

  test("skips or refuses what a server answers in the wrong shape", async () => {
    const long = "x".repeat(5_000);
    const { fetcher } = fetcherOf((entry) => {
      const { id, method, params } = rpc(entry);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize") return json({ id, result: {} });
      if (method === "tools/list") return json({ id, result: { tools: [null, 7, { name: "kept" }, { name: 3 }] } });
      if (method === "resources/read") return json({ id, result: { contents: [null, { text: "v" }] } });
      if (params?.name === "empty") return new Response("null", { headers: { "content-type": "application/json" } });
      if (params?.name === "long") return json({ id, error: { code: -32000, message: long } });
      return json({ id, result: { content: [null, { type: "text", text: "kept" }] } });
    });
    const mcp = new RemoteMcp(fetcher, "https://shop.example.com/mcp", "good");
    expect((await mcp.listTools()).map((tool) => tool.name)).toEqual(["kept"]);
    expect((await mcp.callTool("kept", {})).content).toEqual([{ type: "text", text: "kept" }]);
    expect(await mcp.readResource("ui://shop/v")).toEqual([{ text: "v" }]);
    expect(await codeOf(mcp.callTool("empty", {}))).toBe("remoteProtocol");
    const clipped = RemoteMcp.textOf((await mcp.callTool("long", {})).content);
    expect(clipped.length).toBeGreaterThan(100);
    expect(clipped.length).toBeLessThan(400);
  });

  test("tries the handshake again after one that failed", async () => {
    let handshakes = 0;
    const { fetcher } = fetcherOf((entry) => {
      const { id, method } = rpc(entry);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize") {
        handshakes += 1;
        return handshakes === 1 ? new Response(null, { status: 503 }) : json({ id, result: {} });
      }
      return json({ id, result: { tools: [{ name: "t" }] } });
    });
    const mcp = new RemoteMcp(fetcher, "https://shop.example.com/mcp", "good");
    expect(await codeOf(mcp.listTools())).toBe("remoteProtocol");
    expect((await mcp.listTools()).map((tool) => tool.name)).toEqual(["t"]);
  });

  test("reads the answer to its own request out of an event stream", async () => {
    const stream = (body: string) => new Response(body, { headers: { "content-type": "text/event-stream" } });
    const { fetcher } = fetcherOf((entry) => {
      const { id, method } = rpc(entry);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize")
        return stream(`: ok\r\nretry: 1000\r\n\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result: {} })}\r\n\r\n`);
      if (method === "tools/call")
        return stream(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 999, result: {} })}\n\n`);
      const answer = JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "split" }] } });
      const notice = JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} });
      const asked = JSON.stringify({ jsonrpc: "2.0", id, method: "sampling/createMessage", params: {} });
      const half = answer.indexOf(',"result"');
      return stream(
        `event: message\ndata: ${notice}\n\nid: 3\ndata:${asked}\n\nid: 4\ndata: ${answer.slice(0, half)}\ndata: ${answer.slice(half)}\n\n`,
      );
    });
    const mcp = new RemoteMcp(fetcher, "https://shop.example.com/mcp", "good");
    expect((await mcp.listTools()).map((tool) => tool.name)).toEqual(["split"]);
    expect(await codeOf(mcp.callTool("split", {}))).toBe("remoteProtocol");
  });
});

describe("RemoteSource", () => {
  test("lists nothing without a connection, and narrows a listing to allow", async () => {
    const { fetcher, seen } = serverOf(() => "good");
    expect(await sourceOf(fetcher, { token: async () => null, renew: async () => "good" }).list()).toBeNull();
    expect(seen).toEqual([]);
    const access = { token: async () => "good", renew: async () => null };
    const listed = await sourceOf(fetcher, access, ["orderList", "showOrder"]).list();
    expect(listed).toEqual([
      { name: "orderList", description: "Lists orders.", parameters: { type: "object" }, readOnly: true },
      { name: "showOrder", readOnly: true },
    ]);
  });

  test("renews once on a 401, and reports the connection gone when renewal fails", async () => {
    let valid = "second";
    const { fetcher } = serverOf(
      () => valid,
      () => ({ content: [{ type: "text", text: "3 orders" }] }),
    );
    let renewals = 0;
    const access: RemoteAccess = {
      token: async () => "first",
      renew: async () => {
        renewals += 1;
        return renewals === 1 ? "second" : null;
      },
    };
    const source = sourceOf(fetcher, access);
    expect((await source.list())?.length).toBe(3);
    expect(renewals).toBe(1);
    valid = "third";
    expect(await source.call("orderList", {})).toEqual({
      error: 'The connection to "shop" is gone. Open its toolkit again to reconnect.',
      code: "remoteDisconnected",
    });
  });

  test("carries an app's screen as a view, keeping its link only on the remote's own origin", async () => {
    const answers: Record<string, unknown> = {
      showOrder: {
        content: [{ type: "text", text: "Order o1\nOpen the full screen: https://shop.example.com/order/o1" }],
      },
      orderList: { content: [{ type: "text", text: "Open the full screen: https://evil.example.net/x" }] },
      refundOrder: {
        content: [{ type: "text", text: "Not allowed." }],
        isError: true,
        _meta: { "akanjs/failure": { code: "forbidden" } },
      },
    };
    const { fetcher } = serverOf(
      () => "good",
      (name) => answers[name],
    );
    const source = sourceOf(fetcher, { token: async () => "good", renew: async () => null });
    await source.list();
    expect((await source.call("showOrder", { id: "o1" })).view).toEqual({
      href: "https://shop.example.com/order/o1",
      static: true,
      resourceUri: "ui://shop/apps/showOrder",
    });
    expect((await source.call("orderList", {})).view).toBeUndefined();
    expect(await source.call("refundOrder", {})).toEqual({ error: "Not allowed.", code: "forbidden" });
  });

  test("asks a static app for its HTML", async () => {
    const metas: unknown[] = [];
    const { fetcher } = serverOf(
      () => "good",
      (_name, meta) => {
        metas.push(meta);
        return {
          content: [
            { type: "text", text: "Open the full screen: https://shop.example.com/order/o1" },
            {
              type: "resource",
              resource: { uri: "ui://shop/static/showOrder", mimeType: "text/html", text: "<p>o1</p>" },
            },
          ],
        };
      },
    );
    const source = sourceOf(fetcher, { token: async () => "good", renew: async () => null });
    expect(await source.screen("showOrder", { id: "o1" })).toEqual({
      html: "<p>o1</p>",
      href: "https://shop.example.com/order/o1",
    });
    expect(metas).toEqual([{ "akanjs/render": "html" }]);
    expect(await source.screen("refundOrder", { id: "o1" })).toBeNull();
    expect(await source.screen("orderList", {})).toBeNull();
    expect(metas).toHaveLength(1);
  });

  test("frames a listed app's view under a policy that connects nowhere, and relays the view's own calls", async () => {
    const metas: unknown[] = [];
    const reads: string[] = [];
    const { fetcher } = fetcherOf((seen) => {
      const { id, method, params } = rpc(seen);
      if (id === undefined) return new Response(null, { status: 202 });
      if (method === "initialize") return json({ id, result: {} });
      if (method === "tools/list") return json({ id, result: { tools } });
      if (method === "resources/read") {
        reads.push(String(params?.uri));
        const text =
          '<!doctype html><html><head><meta charset="utf-8"><script>boot()</script></head><body></body></html>';
        return json({ id, result: { contents: [{ uri: params?.uri, mimeType: "text/html;profile=mcp-app", text }] } });
      }
      metas.push(params?._meta);
      return json({
        id,
        result: { content: [], structuredContent: { href: "/order/o1" }, _meta: { "akanjs/snapshot": [] } },
      });
    });
    const source = sourceOf(fetcher, { token: async () => "", renew: async () => null });
    const view = (await source.view("ui://shop/apps/showOrder")) ?? "";
    expect(view.indexOf("Content-Security-Policy")).toBeGreaterThan(0);
    expect(view.indexOf("Content-Security-Policy")).toBeLessThan(view.indexOf("<script>"));
    expect(view).toContain("connect-src 'none'");
    expect(view).toContain("img-src https://shop.example.com data: blob:");
    expect(await source.view("ui://shop/apps/other")).toBeNull();
    expect(reads).toEqual(["ui://shop/apps/showOrder"]);
    expect((await source.viewCall("showOrder", { id: "o1" }))?._meta).toEqual({ "akanjs/snapshot": [] });
    expect(await source.viewCall("notListed", {})).toBeNull();
    expect(metas).toEqual([{ "akanjs/view": true }]);
  });

  test("puts the view's policy ahead of everything the remote wrote but its doctype", () => {
    const origin = "https://shop.example.com";
    const early = RemoteSource.framed("<!DOCTYPE html>\n<script>early()</script><html><head></head></html>", origin);
    expect(early).toStartWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"');
    expect(early.indexOf("Content-Security-Policy")).toBeLessThan(early.indexOf("<script>"));
    expect(RemoteSource.framed("<script>bare()</script>", origin)).toStartWith("<meta http-equiv=");
    const started = performance.now();
    RemoteSource.framed("<head ".repeat(400_000), origin);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("reads a bare origin as the /mcp an akan server answers at", () => {
    const { fetcher } = fetcherOf(() => json({}));
    expect(RemoteSource.endpointOf(fetcher, " https://shop.example.com ")).toBe("https://shop.example.com/mcp");
    expect(RemoteSource.endpointOf(fetcher, "https://shop.example.com/api/mcp?x=1#y")).toBe(
      "https://shop.example.com/api/mcp",
    );
    expect(() => RemoteSource.endpointOf(fetcher, "shop")).toThrow(RemoteError);
  });
});
