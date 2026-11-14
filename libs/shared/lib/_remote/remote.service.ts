import { oauthSubjectOf, type RemoteVault, type ResolvedRemoteOptions, type SerAccount } from "@libs/shared/srvkit";
import { dayjs } from "akanjs/base";
import {
  type RemoteAuthServer,
  type RemoteClient,
  RemoteError,
  RemoteMcp,
  RemoteOAuth,
  RemoteSource,
  type RemoteTokens,
} from "akanjs/server";
import { serve } from "akanjs/service";

import * as cnst from "../cnst";
import { Err } from "../dict";

export interface RemoteRef {
  name: string;
  url: string;
  description: string;
  allow?: readonly string[];
}

export class RemoteService extends serve("remote" as const, ({ use, memory }) => ({
  remoteOption: use<ResolvedRemoteOptions>(),
  grants: memory(Map, { of: cnst.RemoteGrant }),
  authorizations: memory(Map, { of: cnst.RemoteAuthorization }),
  clients: memory(Map, { of: String }),
})) {
  readonly authorizationMinutes = 10;
  readonly grantDays = 90;
  readonly clientDays = 60;
  //? A remote that names no lifetime is asked again within the hour, as an akan server's own tokens last.
  readonly defaultAccessSeconds = 3600;
  readonly renewAheadSeconds = 60;
  readonly #renewals = new Map<string, Promise<string | null>>();

  sources(account: SerAccount | null, remotes: readonly RemoteRef[]): RemoteSource[] {
    const subjectId = this.subjectOf(account);
    return remotes.map((remote) => this.source(subjectId, remote));
  }

  /** The address to send the browser to, or `""` when the remote asked for no sign-in and is connected already. */
  async connect(account: SerAccount | null, input: string): Promise<string> {
    const subjectId = this.subjectOf(account);
    const url = this.endpointOf(input);
    const { fetcher, redirectUri, vault } = this.remoteOption;
    const challenge = await this.challengeOf(url);
    if (challenge === null) {
      await this.store(new cnst.RemoteGrant({ subjectId, url, accessExpiresAt: dayjs(), connectedAt: dayjs() }));
      return "";
    }
    const server = await this.reached(() => RemoteOAuth.discover(fetcher, url, challenge));
    const client = await this.clientOf(server);
    const { verifier, challenge: codeChallenge, state } = RemoteOAuth.pkce();
    const authorization = new cnst.RemoteAuthorization({
      state,
      subjectId,
      url,
      verifier,
      redirectUri,
      issuer: server.issuer,
      tokenEndpoint: server.tokenEndpoint,
      revocationEndpoint: server.revocationEndpoint ?? "",
      resource: server.resource,
      clientId: client.clientId,
      clientSecret: vault.seal(client.clientSecret ?? "", RemoteService.registrationOf(server.issuer, redirectUri)),
    });
    await this.authorizations.set(state, authorization, {
      expireAt: dayjs().add(this.authorizationMinutes, "minute"),
    });
    return RemoteOAuth.authorizeUrl(server, {
      clientId: client.clientId,
      redirectUri,
      state,
      challenge: codeChallenge,
    });
  }

  async complete(
    account: SerAccount | null,
    { state, code, iss }: { state: string; code: string; iss?: string | null },
  ): Promise<cnst.RemoteConnection> {
    const subjectId = this.subjectOf(account);
    //? Taken out before anything is checked, so one `state` is answered once whatever the answer.
    const authorization = state ? await this.authorizations.getDel(state) : null;
    if (!authorization) throw new Err("remote.error.authorizationNotFound", undefined, { statusCode: 400 });
    if (authorization.subjectId !== subjectId)
      throw new Err("remote.error.authorizationBoundToAnotherAccount", undefined, { statusCode: 403 });
    //? Without the iss check a response from one authorization server can be replayed at another.
    if (iss && iss !== authorization.issuer)
      throw new Err("remote.error.issuerMismatch", undefined, { statusCode: 400 });
    if (!code) throw new Err("remote.error.authorizationRefused", undefined, { statusCode: 400 });
    const { fetcher, vault } = this.remoteOption;
    const client = this.client(
      authorization,
      RemoteService.registrationOf(authorization.issuer, authorization.redirectUri),
    );
    const tokens = await this.reached(() =>
      RemoteOAuth.exchange(fetcher, authorization, {
        code,
        verifier: authorization.verifier,
        redirectUri: authorization.redirectUri,
        client,
      }),
    );
    const grant = new cnst.RemoteGrant({
      subjectId,
      url: authorization.url,
      tokenEndpoint: authorization.tokenEndpoint,
      revocationEndpoint: authorization.revocationEndpoint,
      resource: authorization.resource,
      clientId: authorization.clientId,
      clientSecret: vault.seal(
        client.clientSecret ?? "",
        RemoteService.sealedAt({ subjectId, url: authorization.url }, "clientSecret"),
      ),
      ...this.sealed({ subjectId, url: authorization.url }, tokens, ""),
      connectedAt: dayjs(),
    });
    await this.store(grant);
    this.logger.info(`remote connected: user ${subjectId} → ${new URL(grant.url).host}`);
    return RemoteService.connectionOf(grant);
  }

  async disconnect(account: SerAccount | null, input: string): Promise<boolean> {
    const subjectId = this.subjectOf(account);
    const key = RemoteService.keyOf(subjectId, this.endpointOf(input));
    const grant = await this.grants.getDel(key);
    if (!grant) return false;
    const { fetcher, vault } = this.remoteOption;
    const token =
      vault.open(grant.refresh, RemoteService.sealedAt(grant, "refresh")) ||
      vault.open(grant.access, RemoteService.sealedAt(grant, "access"));
    if (grant.revocationEndpoint && token)
      await RemoteOAuth.revoke(
        fetcher,
        grant.revocationEndpoint,
        token,
        this.client(grant, RemoteService.sealedAt(grant, "clientSecret")),
      );
    return true;
  }

  async listConnections(account: SerAccount | null): Promise<cnst.RemoteConnection[]> {
    const subjectId = this.subjectOf(account);
    const prefix = RemoteService.keyOf(subjectId, "");
    const keys = (await this.grants.keys()).filter((key) => key.startsWith(prefix));
    const grants = await Promise.all(keys.map(async (key) => await this.grants.get(key)));
    return grants.flatMap((grant) => (grant ? [RemoteService.connectionOf(grant)] : []));
  }

  /** A static app's screen as the remote drew it for this account, or `""` when it sent none. */
  async screen(account: SerAccount | null, input: string, tool: string, args: string): Promise<string> {
    const source = this.source(this.subjectOf(account), { name: "screen", url: input, description: "" });
    const parsed = RemoteService.argumentsOf(args);
    const screen = await this.reached(() => source.screen(tool, parsed));
    return screen?.html ?? "";
  }

  /** An app's view document, framed for a sandboxed frame, or `""` when the remote lists no such view. */
  async view(account: SerAccount | null, input: string, uri: string): Promise<string> {
    const source = this.source(this.subjectOf(account), { name: "view", url: input, description: "" });
    return (await this.reached(() => source.view(uri))) ?? "";
  }

  /** A call the framed view makes at its own server, as JSON: raw values, which go to that frame and nowhere else. */
  async viewCall(account: SerAccount | null, input: string, tool: string, args: string): Promise<string> {
    const source = this.source(this.subjectOf(account), { name: "view", url: input, description: "" });
    const parsed = RemoteService.argumentsOf(args);
    const answer = await this.reached(() => source.viewCall(tool, parsed));
    if (!answer) throw new Err("remote.error.viewCallRefused", undefined, { statusCode: 400 });
    const { content, structuredContent, _meta, isError } = answer;
    return JSON.stringify({
      content,
      ...(structuredContent ? { structuredContent } : {}),
      ...(_meta ? { _meta } : {}),
      isError,
    });
  }

  endpointOf(input: string): string {
    const { enabled, fetcher, allowUrl } = this.remoteOption;
    if (!enabled) throw new Err("remote.error.disabled", undefined, { statusCode: 404 });
    try {
      const url = RemoteSource.endpointOf(fetcher, input);
      if (!allowUrl(new URL(url)))
        throw new RemoteError("remoteUrlRejected", "This app does not connect that address.");
      return url;
    } catch (error) {
      throw RemoteService.refusal(error);
    }
  }

  private source(subjectId: string, { name, url: input, description, allow }: RemoteRef): RemoteSource {
    const { fetcher, clientName } = this.remoteOption;
    const url = this.endpointOf(input);
    const key = RemoteService.keyOf(subjectId, url);
    return new RemoteSource({
      name,
      url,
      description,
      ...(allow ? { allow } : {}),
      fetcher,
      clientName,
      access: { token: () => this.token(key), renew: () => this.renew(key) },
    });
  }

  //? `""` is a connection that carries no credential; `null` is no connection.
  private async token(key: string): Promise<string | null> {
    const grant = await this.grants.get(key);
    if (!grant) return null;
    if (!grant.tokenEndpoint) return "";
    const access = this.remoteOption.vault.open(grant.access, RemoteService.sealedAt(grant, "access"));
    const fresh = dayjs(grant.accessExpiresAt).isAfter(dayjs().add(this.renewAheadSeconds, "second"));
    return access && fresh ? access : await this.renew(key);
  }

  //? One flight per connection in this process: a refresh token spent twice closes the grant at an akan remote once
  //? its thirty-second rotation grace is over. Another instance's rotation is met by reading the grant again first.
  private renew(key: string): Promise<string | null> {
    const flying = this.#renewals.get(key);
    if (flying) return flying;
    const flight = this.rotate(key).finally(() => this.#renewals.delete(key));
    this.#renewals.set(key, flight);
    return flight;
  }

  private async rotate(key: string): Promise<string | null> {
    const { fetcher, vault } = this.remoteOption;
    const grant = await this.grants.get(key);
    if (!grant?.tokenEndpoint) return grant ? "" : null;
    const refreshToken = vault.open(grant.refresh, RemoteService.sealedAt(grant, "refresh"));
    if (!refreshToken) return await this.drop(key, grant, "it holds no refresh token");
    const { access, refresh } = grant;
    try {
      const client = this.client(grant, RemoteService.sealedAt(grant, "clientSecret"));
      const tokens = await RemoteOAuth.refresh(fetcher, grant, { refreshToken, client });
      Object.assign(grant, this.sealed(grant, tokens, grant.refresh));
      await this.store(grant);
      return tokens.accessToken;
    } catch (error) {
      //? Only a refusal ends the connection: a remote that is down for a minute keeps its grant.
      if (!(error instanceof RemoteError) || error.code !== "remoteOAuth") throw error;
      //? A server that rotates refuses the second use of a refresh token another instance has just spent; that
      //? instance's stored renewal stands.
      const current = await this.grants.get(key);
      const renewed = current && (current.refresh !== refresh || current.access !== access) ? current.access : "";
      const renewedAccess = vault.open(renewed, RemoteService.sealedAt(grant, "access"));
      if (renewedAccess) return renewedAccess;
      return await this.drop(key, grant, error.message);
    }
  }

  private async drop(key: string, grant: cnst.RemoteGrant, reason: string): Promise<null> {
    await this.grants.delete(key);
    this.logger.warn(`remote connection closed: user ${grant.subjectId} → ${new URL(grant.url).host}: ${reason}`);
    return null;
  }

  private sealed(
    at: Pick<cnst.RemoteGrant, "subjectId" | "url">,
    { accessToken, refreshToken, expiresAt }: RemoteTokens,
    keptRefresh: string,
  ) {
    const { vault } = this.remoteOption;
    return {
      access: vault.seal(accessToken, RemoteService.sealedAt(at, "access")),
      //? A server that rotates sends the next refresh token; one that does not leaves the stored one standing.
      refresh: refreshToken ? vault.seal(refreshToken, RemoteService.sealedAt(at, "refresh")) : keptRefresh,
      accessExpiresAt: expiresAt ? dayjs(expiresAt) : dayjs().add(this.defaultAccessSeconds, "second"),
    };
  }

  private async store(grant: cnst.RemoteGrant) {
    await this.grants.set(RemoteService.keyOf(grant.subjectId, grant.url), grant, {
      expireAt: dayjs().add(this.grantDays, "day"),
    });
  }

  /** `null`: the remote lists its tools to a caller with no credential, so there is nothing to sign in to. */
  private async challengeOf(url: string): Promise<string | null> {
    try {
      await new RemoteMcp(this.remoteOption.fetcher, url, null, {
        clientName: this.remoteOption.clientName,
      }).listTools();
      return null;
    } catch (error) {
      if (error instanceof RemoteError && error.code === "remoteUnauthorized") return error.data?.challenge ?? "";
      throw RemoteService.refusal(error);
    }
  }

  //? One registration per authorization server and callback, shared by every account: the client is this app.
  private async clientOf(server: RemoteAuthServer): Promise<RemoteClient> {
    const { fetcher, redirectUri, clientName, vault } = this.remoteOption;
    const key = `${server.issuer} ${redirectUri}`;
    const registration = RemoteService.registrationOf(server.issuer, redirectUri);
    const known = RemoteService.parseClient(await this.clients.get(key), vault, registration);
    if (known) return known;
    const client = await this.reached(() => RemoteOAuth.register(fetcher, server, { redirectUri, clientName }));
    const clientSecret = vault.seal(client.clientSecret ?? "", registration);
    const stored = JSON.stringify({ clientId: client.clientId, clientSecret });
    await this.clients.set(key, stored, { expireAt: dayjs().add(this.clientDays, "day") });
    return client;
  }

  private client(record: { clientId: string; clientSecret: string }, context: readonly string[]): RemoteClient {
    const clientSecret = this.remoteOption.vault.open(record.clientSecret, context);
    return { clientId: record.clientId, ...(clientSecret ? { clientSecret } : {}) };
  }

  private async reached<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw RemoteService.refusal(error);
    }
  }

  private subjectOf(account: SerAccount | null): string {
    const subject = oauthSubjectOf(account, { allowAdmin: false });
    if (!subject) throw new Err("remote.error.notSignedIn", undefined, { statusCode: 401 });
    return subject.id;
  }

  private static parseClient(
    stored: string | undefined,
    vault: RemoteVault,
    context: readonly string[],
  ): RemoteClient | null {
    if (!stored) return null;
    try {
      const { clientId, clientSecret } = JSON.parse(stored) as { clientId?: string; clientSecret?: string };
      if (!clientId) return null;
      const secret = vault.open(clientSecret ?? "", context);
      //? A secret that no longer opens would sign every user in as a public client, which the server refuses.
      if (clientSecret && !secret) return null;
      return { clientId, ...(secret ? { clientSecret: secret } : {}) };
    } catch {
      return null;
    }
  }

  private static refusal(error: unknown): unknown {
    if (!(error instanceof RemoteError)) return error;
    if (error.code === "remoteUrlRejected")
      return new Err("remote.error.urlRejected", { reason: error.message }, { statusCode: 400 });
    if (error.code === "remoteOAuth")
      return new Err("remote.error.signInRefused", { reason: error.message }, { statusCode: 502 });
    return new Err("remote.error.unreachable", { reason: error.message }, { statusCode: 502 });
  }

  private static argumentsOf(args: string): Record<string, unknown> {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(args || "{}");
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Err("remote.error.badArguments", undefined, { statusCode: 400 });
    return parsed as Record<string, unknown>;
  }

  private static sealedAt(
    { subjectId, url }: Pick<cnst.RemoteGrant, "subjectId" | "url">,
    field: "access" | "refresh" | "clientSecret",
  ): string[] {
    return [subjectId, url, field];
  }

  private static registrationOf(issuer: string, redirectUri: string): string[] {
    return [issuer, redirectUri, "clientSecret"];
  }

  private static keyOf(subjectId: string, url: string): string {
    return `${subjectId} ${url}`;
  }

  private static connectionOf({ url, connectedAt }: cnst.RemoteGrant): cnst.RemoteConnection {
    return new cnst.RemoteConnection({ url, host: new URL(url).host, connectedAt });
  }
}
