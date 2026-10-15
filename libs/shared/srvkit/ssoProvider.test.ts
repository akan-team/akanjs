import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

import { SsoProvider } from "./ssoProvider";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const origin = "https://app.example.com";
const clientId = "com.example.app";

describe("SsoProvider", () => {
  let privateKey: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  const idToken = async ({
    iss = "https://appleid.apple.com",
    aud = clientId,
    sub = "000123.abc",
    expiresIn = "5m",
  } = {}) =>
    await new SignJWT({ sub })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" };
    jwks = createLocalJWKSet({ keys: [jwk] });
    SsoProvider.configure({
      google: { clientID: "google-client", clientSecret: "google-secret" },
      github: { clientID: "github-client", clientSecret: "github-secret" },
      kakao: { clientID: "kakao-client" },
      apple: { clientID: clientId, teamID: "TEAM", keyID: "KEY", keyFilePath: "/dev/null" },
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  const originalFetch = globalThis.fetch;
  const answer = (bodies: unknown[]) => {
    const queue = [...bodies];
    spyOn(globalThis, "fetch").mockImplementation(
      (async () => new Response(JSON.stringify(queue.shift() ?? {}), { status: 200 })) as unknown as typeof fetch,
    );
  };

  test("an authorize URL carries the state and a callback under the API prefix", () => {
    const url = new URL(SsoProvider.authorizeUrl("google", origin, "state-1"));
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/user/google/callback`);
    expect(url.searchParams.get("scope")).toBe("email profile");
  });

  test("Apple is asked to answer on the query, without the scopes that force a cross-site form post", () => {
    const url = new URL(SsoProvider.authorizeUrl("apple", origin, "state-2"));
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("scope")).toBeNull();
  });

  test("an unconfigured provider is refused", () => {
    expect(() => SsoProvider.assertConfigured("naver")).toThrow();
  });

  test("an Apple id token is believed only with Apple's signature, issuer, our audience and a live expiry", async () => {
    expect(await SsoProvider.verifyAppleIdToken(await idToken(), clientId, jwks)).toBe("000123.abc");
    await expect(SsoProvider.verifyAppleIdToken(await idToken({ aud: "other" }), clientId, jwks)).rejects.toThrow();
    await expect(
      SsoProvider.verifyAppleIdToken(await idToken({ iss: "https://evil" }), clientId, jwks),
    ).rejects.toThrow();
    await expect(SsoProvider.verifyAppleIdToken(await idToken({ expiresIn: "-1m" }), clientId, jwks)).rejects.toThrow();
    const forged = await new SignJWT({ sub: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://appleid.apple.com")
      .setAudience(clientId)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("guessable"));
    await expect(SsoProvider.verifyAppleIdToken(forged, clientId, jwks)).rejects.toThrow();
  });

  test("GitHub is identified by its numeric id, keeping the login only to migrate old rows", async () => {
    answer([{ access_token: "t" }, { id: 42, login: "alice", name: null }]);
    expect(await SsoProvider.identify("github", "code", origin)).toEqual({
      accountId: "github:42",
      nickname: "alice",
      legacyAccountId: "alice",
    });
  });

  test("an email the provider has not verified does not sign anyone in", async () => {
    answer([{ access_token: "t" }, { email: "ann@example.com", verified_email: false, name: "Ann" }]);
    await expect(SsoProvider.identify("google", "code", origin)).rejects.toThrow(/ssoEmailNotVerified/);
    answer([{ access_token: "t" }, { kakao_account: { email: "ann@example.com", is_email_verified: false } }]);
    await expect(SsoProvider.identify("kakao", "code", origin)).rejects.toThrow(/ssoEmailNotVerified/);
    answer([{ access_token: "t" }, { email: "ann@example.com", verified_email: true, name: "Ann" }]);
    expect(await SsoProvider.identify("google", "code", origin)).toEqual({
      accountId: "ann@example.com",
      nickname: "Ann",
    });
  });

  test("a provider error status is a refusal, never a profile", async () => {
    spyOn(globalThis, "fetch").mockImplementation(
      (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch,
    );
    await expect(SsoProvider.identify("google", "code", origin)).rejects.toThrow(/ssoProviderFailed/);
  });
});
