import { describe, expect, test } from "bun:test";
import { OAuthRegistration } from "./OAuthRegistration";

const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("OAuthRegistration parse", () => {
  test("accepts the request Claude Code sends and fills OAuth 2.1 defaults", () => {
    const result = OAuthRegistration.parse({
      client_name: "Claude Code",
      redirect_uris: ["http://localhost:51234/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    });
    if (!result.ok) throw new Error("expected a client");
    expect(result.client).toEqual({
      clientName: "Claude Code",
      redirectUris: ["http://localhost:51234/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      tokenEndpointAuthMethod: "none",
    });
    const minimal = OAuthRegistration.parse({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    if (!minimal.ok) throw new Error("expected a client");
    expect(minimal.client.grantTypes).toEqual(["authorization_code"]);
    expect(minimal.client.tokenEndpointAuthMethod).toBe("none");
    expect(minimal.client.clientName).toBeUndefined();
  });

  test("refuses a redirect URI the policy does not admit, naming it", async () => {
    const result = OAuthRegistration.parse({ redirect_uris: ["http://app.example.com/callback"] });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.response.status).toBe(400);
    const json = await body(result.response);
    expect(json.error).toBe("invalid_redirect_uri");
    expect(json.error_description).toContain("http://app.example.com/callback");
    const cursor = { redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback"] };
    expect(OAuthRegistration.parse(cursor).ok).toBe(false);
    expect(OAuthRegistration.parse(cursor, { allowedSchemes: ["cursor"] }).ok).toBe(true);
  });

  test("refuses metadata this server cannot honour", async () => {
    const cases: [unknown, string][] = [
      [null, "invalid_client_metadata"],
      [{ redirect_uris: [] }, "invalid_redirect_uri"],
      [{ redirect_uris: ["https://a.example/cb"], grant_types: ["implicit"] }, "invalid_client_metadata"],
      [{ redirect_uris: ["https://a.example/cb"], response_types: ["token"] }, "invalid_client_metadata"],
      [
        { redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "private_key_jwt" },
        "invalid_client_metadata",
      ],
    ];
    for (const [input, error] of cases) {
      const result = OAuthRegistration.parse(input);
      if (result.ok) throw new Error(`expected a refusal for ${JSON.stringify(input)}`);
      expect((await body(result.response)).error).toBe(error);
    }
  });

  test("bounds how many redirect URIs one registration stores, and how long each is", async () => {
    const uris = (count: number) => Array.from({ length: count }, (_, idx) => `https://a.example/cb/${idx}`);
    expect(OAuthRegistration.parse({ redirect_uris: uris(OAuthRegistration.maxRedirectUris) }).ok).toBe(true);
    const long = `https://a.example/${"p".repeat(OAuthRegistration.maxRedirectUriLength)}`;
    for (const redirect_uris of [uris(OAuthRegistration.maxRedirectUris + 1), [long]]) {
      const result = OAuthRegistration.parse({ redirect_uris });
      if (result.ok) throw new Error("expected a refusal");
      const json = await body(result.response);
      expect(json.error).toBe("invalid_redirect_uri");
      expect(String(json.error_description)).not.toContain("pppp");
    }
  });

  test("answers a registration with the stored metadata and the assigned id, uncacheable", async () => {
    const res = OAuthRegistration.response(
      {
        clientId: "dcr_abc",
        clientName: "Cursor",
        redirectUris: ["http://localhost:8787/callback"],
        grantTypes: ["authorization_code"],
        tokenEndpointAuthMethod: "client_secret_post",
        clientSecretHash: "h",
        source: "dynamic",
      },
      { clientSecret: "s3cret", issuedAt: 1_700_000_000_000 },
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await body(res);
    expect(json.client_id).toBe("dcr_abc");
    expect(json.client_id_issued_at).toBe(1_700_000_000);
    expect(json.client_secret).toBe("s3cret");
    expect(json.client_secret_expires_at).toBe(0);
    expect(json.response_types).toEqual(["code"]);
  });
});
