import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { AppHosts } from "akanjs/common";
import { SignalContext } from "../../signal/signalContext";
import { McpAuth } from "./McpAuth";

process.env.AKAN_PUBLIC_APP_NAME = "probe";
process.env.AKAN_PUBLIC_REPO_NAME = "akan";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
process.env.AKAN_PUBLIC_ENV = "main";

beforeAll(() => AppHosts.declare(["app.example.com"]));
afterAll(() => AppHosts.reset());

const auth = (option: Partial<ConstructorParameters<typeof McpAuth>[0]> = {}) =>
  new McpAuth({ path: "/mcp", ...option });

const token = (claims: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(claims)).toString("base64url"), "not-verified-here"].join(".");

const request = (authorization?: string) =>
  new Request("https://app.example.com/mcp", {
    method: "POST",
    ...(authorization ? { headers: { authorization } } : {}),
  });

const metadata = async (instance: McpAuth, path: string) => {
  const routes = instance.createRoutes() as Record<string, { GET: (req: Request) => Response }>;
  const res = routes[path].GET(new Request(`https://app.example.com${path}`));
  return { res, json: (await res.json()) as Record<string, unknown> };
};

describe("McpAuth metadata", () => {
  test("serves the document at both spellings of the well-known path", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const { res, json } = await metadata(auth(), path);
      expect(res.status).toBe(200);
      expect(json.resource).toBe("https://app.example.com/mcp");
      expect(json.bearer_methods_supported).toEqual(["header"]);
    }
  });

  test("publishes issuers and scopes only once they are configured", async () => {
    const bare = await metadata(auth(), "/.well-known/oauth-protected-resource");
    expect(bare.json.authorization_servers).toBeUndefined();
    expect(bare.json.scopes_supported).toBeUndefined();
    const configured = await metadata(
      auth({ path: "/mcp", authorizationServers: ["https://auth.example.com"], scopes: ["mcp:read"] }),
      "/.well-known/oauth-protected-resource",
    );
    expect(configured.json.authorization_servers).toEqual(["https://auth.example.com"]);
    expect(configured.json.scopes_supported).toEqual(["mcp:read"]);
  });

  test("stays readable to a browser-hosted client that holds no credential yet", async () => {
    const { res } = await metadata(auth(), "/.well-known/oauth-protected-resource");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("names the origin the client used rather than the one behind the proxy", async () => {
    const routes = auth().createRoutes() as Record<string, { GET: (req: Request) => Response }>;
    const res = routes["/.well-known/oauth-protected-resource"].GET(
      new Request("http://internal-child/.well-known/oauth-protected-resource", {
        headers: { "x-forwarded-host": "app.example.com, edge.internal", "x-forwarded-proto": "https" },
      }),
    );
    expect(((await res.json()) as { resource: string }).resource).toBe("https://app.example.com/mcp");
  });

  test("prefers a configured resource identifier over the one the request reports", async () => {
    const { json } = await metadata(
      auth({ path: "/mcp", resource: "https://public.example.com/mcp" }),
      "/.well-known/oauth-protected-resource",
    );
    expect(json.resource).toBe("https://public.example.com/mcp");
  });

  test("a configured resource also fixes the origin the challenge and the same-origin check use", () => {
    const pinned = auth({ path: "/mcp", resource: "https://public.example.com/mcp" });
    const forged = new Request("http://internal-child/mcp", {
      method: "POST",
      headers: { "x-forwarded-host": "evil.example.net", "x-forwarded-proto": "https" },
    });
    expect(pinned.publicOrigin(forged)).toBe("https://public.example.com");
    expect(pinned.unauthorized(forged).headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://public.example.com/.well-known/oauth-protected-resource/mcp"',
    );
    expect(auth().publicOrigin(forged)).toBe("https://evil.example.net");
  });
});

describe("McpAuth callerKey", () => {
  const verified = auth({ verify: () => ({}) });

  test("keys a verified bearer on its session, one connection or many, and an anonymous caller on its address", () => {
    const sid = request(`Bearer ${token({ sid: "s1", jti: "j1", sub: "user:u1" })}`);
    expect(verified.callerKey(sid)).toBe("token:s1");
    expect(verified.callerKey(request(`Bearer ${token({ jti: "j1", sub: "user:u1" })}`))).toBe("token:j1");
    expect(verified.callerKey(request(`Bearer ${token({ sub: "user:u1" })}`))).toBe("token:user:u1");
    const opaque = verified.callerKey(request("Bearer opaque-token"));
    expect(opaque.startsWith("token:")).toBe(true);
    expect(opaque).toBe(verified.callerKey(request("Bearer opaque-token")));
    expect(opaque).not.toBe(verified.callerKey(request("Bearer other-token")));
    expect(verified.callerKey(request())).toBe("ip:anonymous");
  });

  test("keys every bearer on its address while no verifier vouches for tokens", () => {
    for (const authorization of [`Bearer ${token({ sid: "s1" })}`, `Bearer ${token({ sub: "u2" })}`, "Bearer x"])
      expect(auth().callerKey(request(authorization))).toBe("ip:anonymous");
  });

  afterEach(() => SignalContext.setHttpPeerResolver(null));

  test("believes a forwarded address only from a trusted proxy, so a caller cannot pick a fresh budget", () => {
    const proxied = new Request("https://app.example.com/mcp", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.9" },
    });
    SignalContext.setHttpPeerResolver(() => ({ address: "10.0.0.2", port: 50_000 }));
    expect(auth().callerKey(proxied)).toBe("ip:203.0.113.9");
    SignalContext.setHttpPeerResolver(() => ({ address: "198.51.100.4", port: 50_000 }));
    expect(auth().callerKey(proxied)).toBe("ip:198.51.100.4");
  });
});

describe("McpAuth host", () => {
  const hosted = (host: string) => new Request(`http://${host}/mcp`, { method: "POST", headers: { host } });

  test("answers to an address, localhost and the hosts the app declares, and to any once a resource is pinned", () => {
    for (const host of [
      "127.0.0.1:8080",
      "[::1]:8080",
      "192.168.0.7",
      "localhost:8282",
      "app.localhost",
      "app.example.com",
    ])
      expect(auth().answersTo(hosted(host))).toBe(true);
    expect(auth().answersTo(hosted("probe-main.example.com"))).toBe(true);
    expect(auth().answersTo(hosted("rebound.example.net:8080"))).toBe(false);
    expect(auth({ resource: "https://app.example.com/mcp" }).answersTo(hosted("rebound.example.net"))).toBe(true);
  });

  test("expects an audience naming its own host, so a token for another resource is refused whatever Host says", async () => {
    const other = new Request("https://other.example.com/mcp", {
      method: "POST",
      headers: { host: "other.example.com" },
    });
    other.headers.set("authorization", `Bearer ${token({ aud: "https://other.example.com/mcp" })}`);
    expect((await auth().reject(other))?.status).toBe(401);
    const ours = new Request("https://app.example.com/mcp", { method: "POST" });
    ours.headers.set("authorization", `Bearer ${token({ aud: "https://app.example.com/mcp" })}`);
    expect(await auth().reject(ours)).toBeNull();
  });
});

describe("McpAuth challenge", () => {
  test("points an unauthenticated caller at the metadata document", () => {
    const res = auth().unauthorized(request());
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  test("names every required scope in the challenge", () => {
    const res = auth({ path: "/mcp", scopes: ["mcp:read", "mcp:write"] }).unauthorized(request());
    expect(res.headers.get("WWW-Authenticate")).toContain('scope="mcp:read mcp:write"');
  });
});

describe("McpAuth token rejection", () => {
  test("passes through what it cannot judge", async () => {
    expect(await auth().reject(request())).toBeNull();
    expect(await auth().reject(request("Bearer opaque-session-token"))).toBeNull();
    expect(await auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("refuses an expired token instead of letting it degrade to anonymous", async () => {
    const res = await auth().reject(request(`Bearer ${token({ exp: Math.floor(Date.now() / 1000) - 60 })}`));
    if (!res) throw new Error("expected a rejection");
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_token");
  });

  test("keeps a token whose expiry has not passed", async () => {
    expect(await auth().reject(request(`Bearer ${token({ exp: Math.floor(Date.now() / 1000) + 60 })}`))).toBeNull();
  });

  test("refuses a token minted for another resource but accepts one naming this one", async () => {
    const foreign = await auth().reject(request(`Bearer ${token({ aud: ["https://other.example.com/mcp"] })}`));
    expect(foreign?.status).toBe(401);
    expect(await auth().reject(request(`Bearer ${token({ aud: "https://app.example.com/mcp" })}`))).toBeNull();
    expect(await auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("demands an audience once an authorization server is named", async () => {
    const federated = auth({ authorizationServers: ["https://auth.example.com"] });
    const res = await federated.reject(request(`Bearer ${token({ appName: "probe" })}`));
    if (!res) throw new Error("expected a rejection");
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error_description: string }).error_description).toContain("names no resource");
    expect(await federated.reject(request(`Bearer ${token({ aud: "https://app.example.com/mcp" })}`))).toBeNull();
    expect(await auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("answers a scope shortfall with 403 and every missing scope at once", async () => {
    const scoped = auth({ path: "/mcp", scopes: ["mcp:read", "mcp:write"] });
    const res = await scoped.reject(request(`Bearer ${token({ scope: "mcp:read" })}`));
    expect(res?.status).toBe(403);
    const body = (await res?.json()) as { error: string; error_description: string };
    expect(body.error).toBe("insufficient_scope");
    expect(body.error_description).toContain("mcp:write");
    expect(await scoped.reject(request(`Bearer ${token({ scope: "mcp:read mcp:write" })}`))).toBeNull();
  });

  test("leaves scopes unenforced until a deployment declares them", async () => {
    expect(await auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("judges a bearer whatever the scheme's case or the spacing before it", async () => {
    const foreign = token({ aud: ["https://other.example.com/mcp"] });
    for (const authorization of [`bearer ${foreign}`, `BEARER ${foreign}`, `Bearer  ${foreign}`])
      expect((await auth().reject(request(authorization)))?.status).toBe(401);
    const federated = auth({ authorizationServers: ["https://auth.example.com"] });
    expect(federated.challengeAnonymous(request(`bearer ${token({ aud: "https://app.example.com/mcp" })}`))).toBeNull();
  });

  test("reads no token from a header with more than one word after the scheme, as the account layer reads none", async () => {
    const foreign = token({ aud: ["https://other.example.com/mcp"] });
    const federated = auth({ authorizationServers: ["https://auth.example.com"] });
    for (const authorization of [`Bearer ${foreign} x`, `Bearer\t${foreign}`, `Bearer ${foreign}\tx`]) {
      expect(await auth().reject(request(authorization))).toBeNull();
      expect(auth({ verify: () => ({}) }).callerKey(request(authorization))).toBe("ip:anonymous");
      expect(federated.challengeAnonymous(request(authorization))?.status).toBe(401);
    }
  });
});

describe("McpAuth verification hook", () => {
  test("refuses a token the verifier rejects instead of degrading it to anonymous", async () => {
    const res = await auth({ verify: () => null }).reject(request("Bearer forged"));
    expect(res?.status).toBe(401);
    const body = (await res?.json()) as { error: string; error_description: string };
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toContain("could not be verified");
  });

  test("judges the claims the verifier returns, not the ones the token spells", async () => {
    const expired = auth({ verify: () => ({ exp: Math.floor(Date.now() / 1000) - 60 }) });
    expect((await expired.reject(request(`Bearer ${token({})}`)))?.status).toBe(401);
    expect(await auth({ verify: () => ({ appName: "probe" }) }).reject(request("Bearer opaque"))).toBeNull();
  });

  test("treats a verifier that throws as a refusal", async () => {
    const throwing = auth({
      verify: () => {
        throw new Error("bad signature");
      },
    });
    expect((await throwing.reject(request("Bearer x")))?.status).toBe(401);
  });

  test("leaves a request carrying no token to the anonymous path", async () => {
    expect(await auth({ verify: () => null }).reject(request())).toBeNull();
  });
});

describe("McpAuth anonymous challenge", () => {
  test("challenges a credential-less request only once an authorization server is named", () => {
    expect(auth().challengeAnonymous(request())).toBeNull();
    const federated = auth({ authorizationServers: ["https://auth.example.com"] });
    const res = federated.challengeAnonymous(request());
    expect(res?.status).toBe(401);
    expect(res?.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    expect(federated.challengeAnonymous(request("Bearer x"))).toBeNull();
  });
});
