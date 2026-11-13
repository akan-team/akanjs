import { beforeAll, describe, expect, it } from "bun:test";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import type { SerAccount } from "@libs/shared/srvkit";
import { dayjs, getApiPrefix } from "akanjs/base";
import { RemoteFetch } from "akanjs/server";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import { RemoteService } from "./remote.service";

interface Connection {
  sessionId: string;
  clientName: string;
}

// The test server is both ends: the app whose agent calls out, and the other server it connects to.
describe("Remote Signal", () => {
  let owner: userSpec.UserAgent, other: userSpec.UserAgent;
  let base = "";
  let service: RemoteService;
  let account: SerAccount;

  const liveService = async () => {
    const { listConnections } = RemoteService.prototype;
    const reached: { service?: RemoteService } = {};
    RemoteService.prototype.listConnections = async function (this: RemoteService, ...args) {
      reached.service = this;
      return await listConnections.apply(this, args);
    };
    try {
      await owner.fetch.listRemoteConnections();
    } finally {
      RemoteService.prototype.listConnections = listConnections;
    }
    return reached.service as RemoteService;
  };
  // What the person does in the window that opened: reach the other server's consent page signed in, and approve.
  const signInAt = async (authorizeUrl: string, jwt: string, decision = "approveOAuthConsent") => {
    const headers = { authorization: `Bearer ${jwt}` };
    const asked = await fetch(authorizeUrl, { redirect: "manual", headers });
    const requestId = new URL(asked.headers.get("location") ?? "", base).searchParams.get("request") ?? "";
    const decided = await fetch(`${base}${getApiPrefix()}/${decision}/${requestId}`, {
      method: "POST",
      redirect: "manual",
      headers,
    });
    return new URL(decided.headers.get("location") ?? "");
  };
  const grantedApps = async (jwt: string) =>
    (await (
      await fetch(`${base}${getApiPrefix()}/listOAuthConnections`, { headers: { authorization: `Bearer ${jwt}` } })
    ).json()) as Connection[];
  const sourceOf = (as: SerAccount = account) =>
    service.sources(as, [{ name: "self", url: base, description: "This server." }])[0];
  const keyOf = () => `${owner.user.id} ${base}/mcp`;

  beforeAll(async () => {
    await getOrSetupSignalTestFetch();
    owner = await userSpec.getUserAgentWithPassword();
    other = await userSpec.getUserAgentWithPassword();
    base = `http://localhost:${process.env.PORT}`;
    service = await liveService();
    account = { self: { id: owner.user.id } } as unknown as SerAccount;
  });

  it("connects nothing until the app turns it on", async () => {
    expect(service.remoteOption.enabled).toBe(false);
    await expect(other.fetch.connectRemote(base)).rejects.toThrow(/remote\.error\.disabled/);
    Object.assign(service.remoteOption, { enabled: true });
  });

  it("refuses an address that is no https URL, and a private one unless the app allows it", async () => {
    await expect(other.fetch.connectRemote("ftp://files.example.com")).rejects.toThrow(/remote\.error\.urlRejected/);
    const { fetcher } = service.remoteOption;
    Object.assign(service.remoteOption, { fetcher: new RemoteFetch() });
    await expect(other.fetch.connectRemote(base)).rejects.toThrow(/remote\.error\.urlRejected/);
    await expect(other.fetch.connectRemote("https://127.0.0.1")).rejects.toThrow(/remote\.error\.urlRejected/);
    Object.assign(service.remoteOption, { fetcher, allowUrl: (url: URL) => url.hostname !== "blocked.example.com" });
    await expect(other.fetch.connectRemote("https://blocked.example.com")).rejects.toThrow(
      /remote\.error\.urlRejected/,
    );
  });

  it("sends the person to the other server's sign-in, registered as this app with a secret", async () => {
    const authorizeUrl = new URL(await owner.fetch.connectRemote(base));
    expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe(`${base}/oauth/authorize`);
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(`${base}/remote/callback`);
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("resource")).toBe(`${base}/mcp`);
    const again = new URL(await owner.fetch.connectRemote(base));
    expect(again.searchParams.get("client_id")).toBe(authorizeUrl.searchParams.get("client_id"));
    expect(again.searchParams.get("state")).not.toBe(authorizeUrl.searchParams.get("state"));
  });

  it("answers a sign-in once, and only to the account that started it", async () => {
    const callback = await signInAt(await owner.fetch.connectRemote(base), owner.accessToken.jwt);
    const state = callback.searchParams.get("state") ?? "";
    const code = callback.searchParams.get("code") ?? "";
    await expect(other.fetch.completeRemoteConnection(state, code, base)).rejects.toThrow(
      /authorizationBoundToAnotherAccount/,
    );
    await expect(owner.fetch.completeRemoteConnection(state, code, base)).rejects.toThrow(/authorizationNotFound/);
    expect(await owner.fetch.listRemoteConnections()).toEqual([]);
  });

  it("refuses an answer from another authorization server, and one with no code", async () => {
    const mixed = await signInAt(await owner.fetch.connectRemote(base), owner.accessToken.jwt);
    const state = mixed.searchParams.get("state") ?? "";
    await expect(
      owner.fetch.completeRemoteConnection(state, mixed.searchParams.get("code") ?? "", "https://evil.example.net"),
    ).rejects.toThrow(/issuerMismatch/);
    const denied = await signInAt(await owner.fetch.connectRemote(base), owner.accessToken.jwt, "denyOAuthConsent");
    expect(denied.searchParams.get("error")).toBe("access_denied");
    await expect(
      owner.fetch.completeRemoteConnection(denied.searchParams.get("state") ?? "", "", base),
    ).rejects.toThrow(/authorizationRefused/);
  });

  it("connects, and lists the connection without anything a caller could act with", async () => {
    expect(await sourceOf().list()).toBeNull();
    const callback = await signInAt(await owner.fetch.connectRemote(base), owner.accessToken.jwt);
    const connection = await owner.fetch.completeRemoteConnection(
      callback.searchParams.get("state") ?? "",
      callback.searchParams.get("code") ?? "",
      callback.searchParams.get("iss"),
    );
    expect(connection.url).toBe(`${base}/mcp`);
    const listed = await owner.fetch.listRemoteConnections();
    expect(listed.map(({ url, host }) => ({ url, host }))).toEqual([{ url: `${base}/mcp`, host: new URL(base).host }]);
    expect(JSON.stringify(listed)).not.toMatch(/access|refresh|secret|clientId/i);
    expect(await other.fetch.listRemoteConnections()).toEqual([]);
    const stored = await service.grants.get(keyOf());
    expect(stored?.access).not.toContain("eyJ");
    expect(service.remoteOption.vault.open(stored?.access ?? "")).toContain("eyJ");
    expect(
      (await grantedApps(owner.accessToken.jwt)).some((app) => app.clientName === service.remoteOption.clientName),
    ).toBe(true);
  });

  it("lists and calls the other server's tools as the connected user's agent", async () => {
    const source = sourceOf();
    const tools = (await source.list()) ?? [];
    expect(tools.length).toBeGreaterThan(0);
    const names = tools.map((tool) => tool.name);
    for (const hidden of ["connectRemote", "disconnectRemote", "listRemoteConnections", "listOAuthConnections"])
      expect(names).not.toContain(hidden);
    const unknown = await source.call("noSuchTool", {});
    expect(unknown.code).toBe("unknownTool");
    expect(await owner.fetch.remoteScreen(base, "noSuchTool", "{}")).toBe("");
    await expect(owner.fetch.remoteScreen(base, "noSuchTool", "[1]")).rejects.toThrow(/badArguments/);
    expect(await other.fetch.remoteScreen(base, "noSuchTool", "{}")).toBe("");
    expect(await sourceOf({ self: { id: other.user.id } } as unknown as SerAccount).list()).toBeNull();
  });

  it("keeps an agent's own token from connecting or disconnecting a server", async () => {
    const stored = await service.grants.get(keyOf());
    const agentToken = service.remoteOption.vault.open(stored?.access ?? "");
    const asAgent = async (endpoint: string) =>
      await fetch(`${base}${getApiPrefix()}/${endpoint}`, {
        method: "POST",
        headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json" },
        body: JSON.stringify({ url: base }),
      });
    expect((await asAgent("connectRemote")).status).toBe(403);
    expect((await asAgent("disconnectRemote")).status).toBe(403);
    expect(await owner.fetch.listRemoteConnections()).toHaveLength(1);
  });

  it("renews a lapsed access token, one renewal for callers that ask together", async () => {
    const stored = await service.grants.get(keyOf());
    if (!stored) throw new Error("the connection is missing");
    const before = service.remoteOption.vault.open(stored.access);
    stored.accessExpiresAt = dayjs().subtract(1, "minute");
    await service.grants.set(keyOf(), stored);
    const [first, second] = await Promise.all([sourceOf().list(), sourceOf().list()]);
    expect(first?.length).toBeGreaterThan(0);
    expect(second?.length).toBe(first?.length);
    const after = await service.grants.get(keyOf());
    expect(service.remoteOption.vault.open(after?.access ?? "")).not.toBe(before);
    expect(after?.refresh).not.toBe(stored.refresh);
  });

  it("closes the connection when the other server refuses to renew it", async () => {
    const stored = await service.grants.get(keyOf());
    if (!stored) throw new Error("the connection is missing");
    stored.refresh = service.remoteOption.vault.seal("not-a-refresh-token");
    stored.accessExpiresAt = dayjs().subtract(1, "minute");
    await service.grants.set(keyOf(), stored);
    expect(await sourceOf().list()).toBeNull();
    expect(await owner.fetch.listRemoteConnections()).toEqual([]);
  });

  it("hands the grant back on disconnect, so the other server no longer lists this app", async () => {
    const callback = await signInAt(await owner.fetch.connectRemote(base), owner.accessToken.jwt);
    await owner.fetch.completeRemoteConnection(
      callback.searchParams.get("state") ?? "",
      callback.searchParams.get("code") ?? "",
      callback.searchParams.get("iss"),
    );
    const { clientName } = service.remoteOption;
    const live = (await grantedApps(owner.accessToken.jwt)).filter((app) => app.clientName === clientName).length;
    expect(await owner.fetch.disconnectRemote(base)).toBe(true);
    expect(await owner.fetch.disconnectRemote(base)).toBe(false);
    expect(await sourceOf().list()).toBeNull();
    expect((await grantedApps(owner.accessToken.jwt)).filter((app) => app.clientName === clientName)).toHaveLength(
      live - 1,
    );
  });
});
