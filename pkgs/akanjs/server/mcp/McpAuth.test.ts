import { describe, expect, test } from "bun:test";
import { McpAuth } from "./McpAuth";

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
    // RFC 9728 inserts the resource path; clients try that first and the bare form second.
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
  test("passes through what it cannot judge", () => {
    // No token at all is a legal anonymous call, and an opaque one belongs to whatever middleware issued it.
    expect(auth().reject(request())).toBeNull();
    expect(auth().reject(request("Bearer opaque-session-token"))).toBeNull();
    // A JWT with none of the claims this checks reads as fine, which is what the app's own tokens look like.
    expect(auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("refuses an expired token instead of letting it degrade to anonymous", async () => {
    const res = auth().reject(request(`Bearer ${token({ exp: Math.floor(Date.now() / 1000) - 60 })}`));
    if (!res) throw new Error("expected a rejection");
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_token");
  });

  test("keeps a token whose expiry has not passed", () => {
    expect(auth().reject(request(`Bearer ${token({ exp: Math.floor(Date.now() / 1000) + 60 })}`))).toBeNull();
  });

  test("refuses a token minted for another resource but accepts one naming this one", () => {
    const foreign = auth().reject(request(`Bearer ${token({ aud: ["https://other.example.com/mcp"] })}`));
    expect(foreign?.status).toBe(401);
    expect(auth().reject(request(`Bearer ${token({ aud: "https://app.example.com/mcp" })}`))).toBeNull();
    // This server's own tokens are bound by app and environment rather than by a resource URI, so an absent
    // `aud` must not be read as a violation.
    expect(auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("demands an audience once an authorization server is named", async () => {
    // The confused-deputy case RFC 8707 is a MUST for: the moment a deployment names an issuer, that issuer mints
    // tokens for its other resources too, and one arriving here with no `aud` at all is exactly one of those.
    const federated = auth({ authorizationServers: ["https://auth.example.com"] });
    const res = federated.reject(request(`Bearer ${token({ appName: "probe" })}`));
    if (!res) throw new Error("expected a rejection");
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error_description: string }).error_description).toContain("names no resource");
    expect(federated.reject(request(`Bearer ${token({ aud: "https://app.example.com/mcp" })}`))).toBeNull();
    // Unchanged for a deployment that mints its own: refusing those would lock out every internal caller.
    expect(auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });

  test("answers a scope shortfall with 403 and every missing scope at once", async () => {
    const scoped = auth({ path: "/mcp", scopes: ["mcp:read", "mcp:write"] });
    const res = scoped.reject(request(`Bearer ${token({ scope: "mcp:read" })}`));
    expect(res?.status).toBe(403);
    const body = (await res?.json()) as { error: string; error_description: string };
    expect(body.error).toBe("insufficient_scope");
    expect(body.error_description).toContain("mcp:write");
    expect(scoped.reject(request(`Bearer ${token({ scope: "mcp:read mcp:write" })}`))).toBeNull();
  });

  test("leaves scopes unenforced until a deployment declares them", () => {
    // The server's own tokens carry no scope claim, so demanding one by default would lock out first-party callers.
    expect(auth().reject(request(`Bearer ${token({ appName: "probe" })}`))).toBeNull();
  });
});
