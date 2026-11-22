import { describe, expect, test } from "bun:test";
import { OAuthAuthorize } from "./OAuthAuthorize";
import type { OAuthClientRecord } from "./oauthTypes";

const client: OAuthClientRecord = {
  clientId: "dcr_claude",
  clientName: "Claude Code",
  redirectUris: ["http://localhost:8080/callback"],
  grantTypes: ["authorization_code", "refresh_token"],
  tokenEndpointAuthMethod: "none",
  source: "dynamic",
};
const context = { client, issuer: "https://app.example.com", resource: "https://app.example.com/mcp" };
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const request = (params: Record<string, string | undefined>) => {
  const url = new URL("https://app.example.com/oauth/authorize");
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url;
};
const valid = {
  client_id: "dcr_claude",
  redirect_uri: "http://localhost:8080/callback",
  response_type: "code",
  code_challenge: challenge,
  code_challenge_method: "S256",
  resource: "https://app.example.com/mcp",
  state: "xyz",
};
const location = (res: Response) => new URL(res.headers.get("location") ?? "");

describe("OAuthAuthorize", () => {
  test("accepts a complete request and carries what the consent step needs", () => {
    const result = OAuthAuthorize.parse(request(valid), context);
    if (!result.ok) throw new Error("expected params");
    expect(result.params).toEqual({
      clientId: "dcr_claude",
      redirectUri: "http://localhost:8080/callback",
      codeChallenge: challenge,
      state: "xyz",
      resource: "https://app.example.com/mcp",
      scope: undefined,
    });
  });

  test("answers an unknown client or an unregistered redirect with a page, never a redirect", async () => {
    const unknown = OAuthAuthorize.parse(request(valid), { ...context, client: null });
    if (unknown.ok) throw new Error("expected a refusal");
    expect(unknown.response.status).toBe(400);
    expect(unknown.response.headers.get("content-type")).toContain("text/html");
    expect(await unknown.response.text()).toContain("Unknown client");
    const foreign = OAuthAuthorize.parse(request({ ...valid, redirect_uri: "https://attacker.example/cb" }), context);
    if (foreign.ok) throw new Error("expected a refusal");
    expect(foreign.response.status).toBe(400);
    expect(foreign.response.headers.get("location")).toBeNull();
    // A page must not interpolate the attacker's URI raw.
    const evil = OAuthAuthorize.parse(request({ ...valid, redirect_uri: "https://x.example/<script>" }), context);
    if (evil.ok) throw new Error("expected a refusal");
    expect(await evil.response.text()).not.toContain("<script>");
  });

  test("answers every later failure through the registered redirect, with state and iss", () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ ...valid, response_type: "token" }, "unsupported_response_type"],
      [{ ...valid, code_challenge: undefined }, "invalid_request"],
      [{ ...valid, code_challenge_method: "plain" }, "invalid_request"],
      [{ ...valid, code_challenge_method: undefined }, "invalid_request"],
      [{ ...valid, resource: "https://other.example.com/mcp" }, "invalid_target"],
    ];
    for (const [params, error] of cases) {
      const result = OAuthAuthorize.parse(request(params), context);
      if (result.ok) throw new Error(`expected ${error}`);
      expect(result.response.status).toBe(302);
      const target = location(result.response);
      expect(target.origin + target.pathname).toBe("http://localhost:8080/callback");
      expect(target.searchParams.get("error")).toBe(error);
      expect(target.searchParams.get("state")).toBe("xyz");
      expect(target.searchParams.get("iss")).toBe("https://app.example.com");
    }
  });

  test("lets a loopback client vary its port and a single-redirect client omit the parameter", () => {
    const otherPort = OAuthAuthorize.parse(
      request({ ...valid, redirect_uri: "http://localhost:51234/callback" }),
      context,
    );
    if (!otherPort.ok) throw new Error("expected params");
    expect(otherPort.params.redirectUri).toBe("http://localhost:51234/callback");
    const omitted = OAuthAuthorize.parse(request({ ...valid, redirect_uri: undefined }), context);
    if (!omitted.ok) throw new Error("expected params");
    expect(omitted.params.redirectUri).toBe("http://localhost:8080/callback");
    const several = { ...client, redirectUris: [...client.redirectUris, "https://claude.ai/api/mcp/auth_callback"] };
    const ambiguous = OAuthAuthorize.parse(request({ ...valid, redirect_uri: undefined }), {
      ...context,
      client: several,
    });
    expect(ambiguous.ok).toBe(false);
  });

  test("treats the resource as a URI, so a trailing slash, an omitted parameter or a shelf path under it is not another server", () => {
    expect(OAuthAuthorize.sameResource("https://app.example.com/mcp/", "https://app.example.com/mcp")).toBe(true);
    expect(OAuthAuthorize.sameResource("HTTPS://APP.example.com/mcp", "https://app.example.com/mcp")).toBe(true);
    expect(OAuthAuthorize.sameResource("https://app.example.com/other", "https://app.example.com/mcp")).toBe(false);
    expect(OAuthAuthorize.sameResource("https://app.example.com/mcp/runner", "https://app.example.com/mcp")).toBe(true);
    expect(OAuthAuthorize.sameResource("https://app.example.com/mcpx", "https://app.example.com/mcp")).toBe(false);
    expect(OAuthAuthorize.sameResource("https://app.example.com/mcp", "https://app.example.com/mcp/runner")).toBe(
      false,
    );
    const absent = OAuthAuthorize.parse(request({ ...valid, resource: undefined }), context);
    if (!absent.ok) throw new Error("expected params");
    expect(absent.params.resource).toBe("https://app.example.com/mcp");
  });
});
