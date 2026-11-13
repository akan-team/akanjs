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
    });
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
        return new Response(`event: message\ndata: ${JSON.stringify({ id, result: {} })}\n\n`);
      page += 1;
      return json({ id, result: { tools: [{ name: `t${page}` }], ...(page < 3 ? { nextCursor: `c${page}` } : {}) } });
    });
    const listed = await new RemoteMcp(paged.fetcher, "https://shop.example.com/mcp", "good").listTools();
    expect(listed.map((tool) => tool.name)).toEqual(["t1", "t2", "t3"]);
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
