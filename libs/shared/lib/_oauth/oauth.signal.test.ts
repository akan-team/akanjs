import { beforeAll, describe, expect, it } from "bun:test";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { createOpaqueToken } from "@libs/util/srvkit";
import { getApiPrefix } from "akanjs/base";
import { OAuthPkce } from "akanjs/server";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as sharedFetch } from "../useServer";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}
interface Claims {
  aud: string;
  iss: string;
  client_id: string;
  sub: string;
  tokenType: string;
  self: { id: string };
  scope?: string;
}
interface ToolResult {
  result: { isError: boolean; content: { text: string }[]; tools: { name: string }[] };
}
type Json = Record<string, string> & { error?: string; error_description?: string };
interface Connection {
  sessionId: string;
  clientId: string;
  clientName: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

const decode = (jwt: string): Claims =>
  JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as Claims;
const json = async <T = Json>(res: Response) => (await res.json()) as T;
const redirectUri = "http://localhost:51234/callback";
const verifier = createOpaqueToken(32);
const challenge = OAuthPkce.challengeOf(verifier);
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "probe", version: "0" } },
};

describe("Oauth Signal", () => {
  let anonFetch: typeof sharedFetch;
  let owner: userSpec.UserAgent, other: userSpec.UserAgent;
  let base = "";
  let resource = "";
  let clientId = "";
  let code = "";
  let accessToken = "";
  let refreshToken = "";

  const register = async (body: Record<string, unknown>) =>
    await fetch(`${base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const authorize = async (jwt?: string, params: Record<string, string> = {}) => {
    const url = new URL(`${base}/oauth/authorize`);
    const query = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource,
      state: "xyz",
      ...params,
    };
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return await fetch(url, { redirect: "manual", headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });
  };
  // An anonymous authorize lands on `/signin?redirect=/oauth/consent?request=…`, a signed-in one on the consent page.
  const requestIdOf = (res: Response) => {
    const location = new URL(res.headers.get("location") ?? "", base);
    const redirect = location.searchParams.get("redirect");
    return (redirect ? new URL(redirect, base) : location).searchParams.get("request") ?? "";
  };
  const decide = async (decision: "approveOAuthConsent" | "denyOAuthConsent", requestId: string, jwt: string) =>
    await fetch(`${base}${getApiPrefix()}/${decision}/${requestId}`, {
      method: "POST",
      redirect: "manual",
      headers: { authorization: `Bearer ${jwt}` },
    });
  const token = async (fields: Record<string, string>) =>
    await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  const mcp = async (body: object, jwt?: string) =>
    await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify(body),
    });
  const revoke = async (fields: Record<string, string>) =>
    await fetch(`${base}/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  const grant = async (asClient = clientId) =>
    await json<TokenResponse>(
      await token({
        grant_type: "authorization_code",
        code: await approvedCode(asClient),
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: asClient,
      }),
    );
  const connections = async (jwt: string) =>
    await json<Connection[]>(
      await fetch(`${base}${getApiPrefix()}/listOAuthConnections`, { headers: { authorization: `Bearer ${jwt}` } }),
    );
  const approvedCode = async (asClient = clientId) => {
    const requestId = requestIdOf(await authorize(owner.accessToken.jwt, { client_id: asClient }));
    const target = new URL(
      (await decide("approveOAuthConsent", requestId, owner.accessToken.jwt)).headers.get("location") ?? "",
    );
    return target.searchParams.get("code") ?? "";
  };

  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    owner = await userSpec.getUserAgentWithPassword();
    other = await userSpec.getUserAgentWithPassword();
    base = `http://localhost:${process.env.PORT}`;
    resource = `${base}/mcp`;
  });

  it("publishes authorization-server and protected-resource metadata that name each other", async () => {
    const server = await json<Record<string, unknown>>(await fetch(`${base}/.well-known/oauth-authorization-server`));
    expect(server.issuer).toBe(base);
    expect(server.authorization_endpoint).toBe(`${base}/oauth/authorize`);
    expect(server.token_endpoint).toBe(`${base}/oauth/token`);
    expect(server.registration_endpoint).toBe(`${base}/oauth/register`);
    expect(server.revocation_endpoint).toBe(`${base}/oauth/revoke`);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.client_id_metadata_document_supported).toBe(true);
    const protectedResource = await json<Record<string, unknown>>(
      await fetch(`${base}/.well-known/oauth-protected-resource/mcp`),
    );
    expect(protectedResource.resource).toBe(resource);
    expect(protectedResource.authorization_servers).toEqual([base]);
  });

  it("challenges an anonymous MCP handshake now that an issuer is named", async () => {
    const res = await mcp(initialize);
    expect(res.status).toBe(401);
    const challengeHeader = res.headers.get("www-authenticate") ?? "";
    expect(challengeHeader).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    expect(challengeHeader).not.toContain("error=");
  });

  it("registers a public client, Cursor's private scheme included, and refuses plain HTTP", async () => {
    const res = await register({
      client_name: "Probe",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    });
    expect(res.status).toBe(201);
    const registered = await json(res);
    clientId = registered.client_id;
    expect(clientId.startsWith("dcr_")).toBe(true);
    expect(registered.client_secret).toBeUndefined();
    const cursor = await register({ redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback"] });
    expect(cursor.status).toBe(201);
    const plain = await register({ redirect_uris: ["http://app.example.com/callback"] });
    expect(plain.status).toBe(400);
    expect((await json(plain)).error).toBe("invalid_redirect_uri");
  });

  it("answers a bad request through the registered redirect and an unknown client with a page", async () => {
    const wrongMethod = await authorize(undefined, { code_challenge_method: "plain" });
    expect(wrongMethod.status).toBe(302);
    const target = new URL(wrongMethod.headers.get("location") ?? "");
    expect(target.origin + target.pathname).toBe(redirectUri);
    expect(target.searchParams.get("error")).toBe("invalid_request");
    expect(target.searchParams.get("state")).toBe("xyz");
    expect(target.searchParams.get("iss")).toBe(base);
    const unknown = await authorize(undefined, { client_id: "nobody" });
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("location")).toBeNull();
  });

  it("sends an anonymous browser to sign in and a signed-in one straight to consent", async () => {
    const anonymous = await authorize();
    expect(anonymous.status).toBe(302);
    const location = anonymous.headers.get("location") ?? "";
    expect(location.startsWith("/signin?redirect=")).toBe(true);
    expect(decodeURIComponent(location.split("redirect=")[1] ?? "")).toMatch(/^\/oauth\/consent\?request=/);
    const signedIn = await authorize(owner.accessToken.jwt);
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toMatch(/^\/oauth\/consent\?request=/);
  });

  it("binds a request to the first account that opens it and refuses every other", async () => {
    const requestId = requestIdOf(await authorize());
    const request = await owner.fetch.viewOAuthAuthorizationRequest(requestId);
    expect(request).toMatchObject({
      clientName: "Probe",
      redirectHost: "localhost:51234",
      isLoopbackRedirect: true,
      status: "pending",
    });
    await expect(other.fetch.viewOAuthAuthorizationRequest(requestId)).rejects.toThrow();
    await expect(anonFetch.viewOAuthAuthorizationRequest(requestId)).rejects.toThrow();
    const stolen = await decide("approveOAuthConsent", requestId, other.accessToken.jwt);
    expect(stolen.status).toBeGreaterThanOrEqual(400);
    expect(stolen.headers.get("location")).toBeNull();
  });

  it("denies through the redirect with access_denied, once", async () => {
    const requestId = requestIdOf(await authorize(owner.accessToken.jwt));
    const denied = await decide("denyOAuthConsent", requestId, owner.accessToken.jwt);
    expect(denied.status).toBe(302);
    const target = new URL(denied.headers.get("location") ?? "");
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.get("state")).toBe("xyz");
    expect(target.searchParams.get("iss")).toBe(base);
    expect((await decide("approveOAuthConsent", requestId, owner.accessToken.jwt)).status).not.toBe(302);
  });

  it("approves once and exchanges the code once for tokens bound to the MCP resource", async () => {
    const requestId = requestIdOf(await authorize(owner.accessToken.jwt));
    const approved = await decide("approveOAuthConsent", requestId, owner.accessToken.jwt);
    expect(approved.status).toBe(302);
    const target = new URL(approved.headers.get("location") ?? "");
    expect(target.origin + target.pathname).toBe(redirectUri);
    code = target.searchParams.get("code") ?? "";
    expect(code).toBeTruthy();
    expect(target.searchParams.get("state")).toBe("xyz");
    expect(target.searchParams.get("iss")).toBe(base);
    expect((await decide("approveOAuthConsent", requestId, owner.accessToken.jwt)).status).not.toBe(302);

    const fields = {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      resource,
    };
    const exchanged = await token(fields);
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get("cache-control")).toBe("no-store");
    const tokens = await json<TokenResponse>(exchanged);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBe(3600);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expect(refreshToken).toBeTruthy();
    const claims = decode(accessToken);
    expect(claims.aud).toBe(resource);
    expect(claims.iss).toBe(base);
    expect(claims.client_id).toBe(clientId);
    expect(claims.sub).toBe(`user:${owner.user.id}`);
    expect(claims.tokenType).toBe("access");
    expect(claims.self.id).toBe(owner.user.id);
    expect(claims.scope).toBeUndefined();
    const reused = await token(fields);
    expect(reused.status).toBe(400);
    expect((await json(reused)).error).toBe("invalid_grant");
  });

  it("spends a code on a failed PKCE check so the right verifier cannot follow", async () => {
    const stolenCode = await approvedCode();
    const fields = {
      grant_type: "authorization_code",
      code: stolenCode,
      redirect_uri: redirectUri,
      client_id: clientId,
    };
    const wrong = await token({ ...fields, code_verifier: "x".repeat(43) });
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error).toBe("invalid_grant");
    const right = await token({ ...fields, code_verifier: verifier });
    expect((await json(right)).error).toBe("invalid_grant");
  });

  it("lets the token through /mcp, and a first-party or forged token no longer", async () => {
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const listed = await mcp(list, accessToken);
    expect(listed.status).toBe(200);
    const names = (await json<ToolResult>(listed)).result.tools.map((tool) => tool.name);
    expect(names).toContain("myAccountId");
    const called = await json<ToolResult>(
      await mcp(
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "myAccountId", arguments: {} } },
        accessToken,
      ),
    );
    expect(called.result.isError).toBe(false);
    expect(typeof called.result.content[0].text).toBe("string");
    expect(called.result.content[0].text.length).toBeGreaterThan(0);
    const firstParty = await mcp(list, owner.accessToken.jwt);
    expect(firstParty.status).toBe(401);
    expect((await json(firstParty)).error_description).toContain("names no resource");
    const forged = await mcp(list, `${accessToken.slice(0, -2)}xx`);
    expect(forged.status).toBe(401);
    expect((await json(forged)).error_description).toContain("could not be verified");
  });

  it("rotates the refresh token, and honours a second use inside the grace window as a client holding it twice", async () => {
    const refreshed = await token({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
    expect(refreshed.status).toBe(200);
    const tokens = await json<TokenResponse>(refreshed);
    expect(tokens.refresh_token).not.toBe(refreshToken);
    expect(decode(tokens.access_token).aud).toBe(resource);
    // Claude Code refreshes from two connections within the same second; the second is not theft and gets its own
    // rotation. Reuse past the window revokes the family — `refreshSession.test.ts` pins that with a moved clock.
    const twice = await token({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
    expect(twice.status).toBe(200);
    const sibling = await json<TokenResponse>(twice);
    expect(sibling.refresh_token).not.toBe(tokens.refresh_token);
    for (const live of [tokens.refresh_token, sibling.refresh_token]) {
      const next = await token({ grant_type: "refresh_token", refresh_token: live, client_id: clientId });
      expect(next.status).toBe(200);
    }
  });

  it("refuses a refresh token presented by another client, and an unknown client outright", async () => {
    const fresh = await json<TokenResponse>(
      await token({
        grant_type: "authorization_code",
        code: await approvedCode(),
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    );
    const otherClient = (await json(await register({ redirect_uris: [redirectUri] }))).client_id;
    const crossed = await token({
      grant_type: "refresh_token",
      refresh_token: fresh.refresh_token,
      client_id: otherClient,
    });
    expect((await json(crossed)).error).toBe("invalid_grant");
    // The refusal is decided before the rotation, so the legitimate client's token is not spent by it.
    const own = await token({ grant_type: "refresh_token", refresh_token: fresh.refresh_token, client_id: clientId });
    expect(own.status).toBe(200);
    const unknown = await token({ grant_type: "refresh_token", refresh_token: "r", client_id: "dcr_nobody" });
    expect(unknown.status).toBe(401);
    expect((await json(unknown)).error).toBe("invalid_client");
  });

  it("lists the account's connected apps, one per grant, and marks the one asking", async () => {
    const fresh = await grant();
    const mine = await connections(fresh.access_token);
    const current = mine.filter((connection) => connection.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ clientId, clientName: "Probe" });
    expect(current[0].createdAt).toBeTruthy();
    // The browser session sees the same grants and is itself not among them.
    const fromBrowser = await connections(owner.accessToken.jwt);
    expect(fromBrowser.map((connection) => connection.sessionId)).toContain(current[0].sessionId);
    expect(fromBrowser.some((connection) => connection.isCurrent)).toBe(false);
    expect(fromBrowser.every((connection) => connection.clientId)).toBe(true);
    // Another account has none of them.
    expect(await connections(other.accessToken.jwt)).toEqual([]);
  });

  it("revokes a grant through RFC 7009 for its own client only, and answers 200 either way", async () => {
    const fresh = await grant();
    const otherClient = (await json(await register({ redirect_uris: [redirectUri] }))).client_id;
    // Another client handing over a token it does not own: 200, and nothing happens.
    expect((await revoke({ token: fresh.refresh_token, client_id: otherClient })).status).toBe(200);
    const rotated = await token({
      grant_type: "refresh_token",
      refresh_token: fresh.refresh_token,
      client_id: clientId,
    });
    expect(rotated.status).toBe(200);
    const live = await json<TokenResponse>(rotated);
    // The owner revoking with the refresh token closes the lineage: the refresh dies and so does the access token.
    expect(
      (await revoke({ token: live.refresh_token, token_type_hint: "refresh_token", client_id: clientId })).status,
    ).toBe(200);
    const dead = await token({ grant_type: "refresh_token", refresh_token: live.refresh_token, client_id: clientId });
    expect((await json(dead)).error).toBe("invalid_grant");
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    expect((await mcp(list, live.access_token)).status).toBe(401);
    expect((await mcp(list, fresh.access_token)).status).toBe(401);
    // A REST call on the revoked token is anonymous again.
    const rest = await fetch(`${base}${getApiPrefix()}/listOAuthConnections`, {
      headers: { authorization: `Bearer ${live.access_token}` },
    });
    expect(rest.status).toBe(401);
    // An unknown token and an unknown client are told apart only by client authentication, as the RFC asks.
    expect((await revoke({ token: "nothing", client_id: clientId })).status).toBe(200);
    expect((await revoke({ token: "nothing", client_id: "dcr_nobody" })).status).toBe(401);
  });

  it("revokes a grant by its access token too", async () => {
    const fresh = await grant();
    expect(
      (await revoke({ token: fresh.access_token, token_type_hint: "access_token", client_id: clientId })).status,
    ).toBe(200);
    expect((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, fresh.access_token)).status).toBe(401);
    const dead = await token({ grant_type: "refresh_token", refresh_token: fresh.refresh_token, client_id: clientId });
    expect((await json(dead)).error).toBe("invalid_grant");
  });

  it("lets the account's owner disconnect an app from the browser, and nobody else", async () => {
    const fresh = await grant();
    const [connection] = (await connections(fresh.access_token)).filter((c) => c.isCurrent);
    expect(connection).toBeDefined();
    await expect(other.fetch.revokeOAuthConnection(connection.sessionId)).resolves.toBe(false);
    expect((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, fresh.access_token)).status).toBe(200);
    await expect(owner.fetch.revokeOAuthConnection(connection.sessionId)).resolves.toBe(true);
    await expect(owner.fetch.revokeOAuthConnection(connection.sessionId)).resolves.toBe(false);
    expect((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, fresh.access_token)).status).toBe(401);
    expect((await connections(owner.accessToken.jwt)).some((c) => c.sessionId === connection.sessionId)).toBe(false);
    // The browser session that did the disconnecting is untouched.
    await expect(owner.fetch.listOAuthConnections()).resolves.toBeDefined();
  });

  it("refuses a consent decision or a disconnect made with an agent's own token", async () => {
    const fresh = await grant();
    const requestId = requestIdOf(await authorize(owner.accessToken.jwt));
    expect((await decide("approveOAuthConsent", requestId, fresh.access_token)).status).toBe(403);
    expect((await decide("denyOAuthConsent", requestId, fresh.access_token)).status).toBe(403);
    const [connection] = (await connections(fresh.access_token)).filter((c) => c.isCurrent);
    const cut = await fetch(`${base}${getApiPrefix()}/revokeOAuthConnection/${connection.sessionId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${fresh.access_token}` },
    });
    expect(cut.status).toBe(403);
  });
});
