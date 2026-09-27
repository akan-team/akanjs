import {
  type AuthTokenMeta,
  getRefreshSession,
  listRefreshSessions,
  type RefreshSession,
  type ResolvedOAuthOptions,
  RevokedSessions,
  refreshRotationGraceMs,
  revokeRefreshSessionBySid,
  rotateRefreshSession,
  type SerAccount,
} from "@libs/shared/srvkit";
import { createOpaqueToken, hashToken } from "@libs/util/srvkit";
import { dayjs, getEnv, Int } from "akanjs/base";
import {
  OAuthAuthorize,
  OAuthClientIdMetadata,
  type OAuthClientRecord,
  OAuthErrors,
  OAuthMetadata,
  OAuthPkce,
  OAuthRedirect,
  OAuthRegistration,
  OAuthRevocation,
  OAuthToken,
  type OAuthTokenParams,
} from "akanjs/server";
import { serve } from "akanjs/service";

import * as cnst from "../cnst";
import { Err } from "../dict";
import type * as srv from "../srv";

type Subject = { type: cnst.OauthSubjectType["value"]; id: string };
type CodeGrantParams = Extract<OAuthTokenParams, { grantType: "authorization_code" }>;
type RefreshParams = Extract<OAuthTokenParams, { grantType: "refresh_token" }>;
/** What a token names about its grant: enough to find the lineage and to check the client presenting it owns it. */
type Lineage = Pick<RefreshSession, "id" | "subject" | "subjectId" | "clientId">;

export class OauthService extends serve("oauth" as const, ({ use, service, memory }) => ({
  securityService: service<srv.util.SecurityService>(),
  userService: service<srv.UserService>(),
  adminService: service<srv.AdminService>(),
  oauthOption: use<ResolvedOAuthOptions>(),
  clients: memory(Map, { of: cnst.OauthClient }),
  requests: memory(Map, { of: cnst.OauthRequest }),
  grants: memory(Map, { of: cnst.OauthGrant }),
  registrations: memory(Map, { of: Int }),
  revokedSessions: memory(Map, { of: Int }),
})) {
  readonly codeSeconds = 60;
  readonly requestMinutes = 10;
  readonly clientDays = 90;
  readonly registrationsPerHour = 20;

  override onInit() {
    RevokedSessions.use(async (sessionId) => !!(await this.revokedSessions.get(sessionId)));
  }

  metadata(): Response {
    if (!this.oauthOption.enabled) return this.disabled();
    const { issuer, dynamicRegistration, clientIdMetadata } = this.oauthOption;
    return OAuthMetadata.response({
      issuer,
      authorizationEndpoint: `${issuer}/oauth/authorize`,
      tokenEndpoint: `${issuer}/oauth/token`,
      registrationEndpoint: dynamicRegistration ? `${issuer}/oauth/register` : undefined,
      revocationEndpoint: `${issuer}/oauth/revoke`,
      clientIdMetadataDocumentSupported: clientIdMetadata.enabled,
    });
  }

  async register(body: unknown, ip: string | null): Promise<Response> {
    if (!this.oauthOption.enabled || !this.oauthOption.dynamicRegistration) return this.disabled();
    const address = ip ?? "unknown";
    const count = (await this.registrations.get(address)) ?? 0;
    // Callers whose address could not be resolved share one bucket, so it is wider: a deployment whose proxy
    // headers are misconfigured should degrade to a looser limit, not lock every client out at once.
    const limit = ip ? this.registrationsPerHour : this.registrationsPerHour * 5;
    if (count >= limit)
      return Response.json(
        { error: "invalid_client_metadata", error_description: "Too many registrations from this address." },
        { status: 429, headers: OAuthErrors.noStore },
      );
    await this.registrations.set(address, count + 1, { expireAt: dayjs().add(1, "hour") });
    const parsed = OAuthRegistration.parse(body, { allowedSchemes: this.oauthOption.allowedRedirectSchemes });
    if (!parsed.ok) return parsed.response;
    const clientSecret = parsed.client.tokenEndpointAuthMethod === "none" ? undefined : createOpaqueToken(32);
    const client = OauthService.constant({
      ...parsed.client,
      clientId: `dcr_${createOpaqueToken(24)}`,
      clientSecretHash: clientSecret ? hashToken(clientSecret) : undefined,
      source: "dynamic",
    });
    await this.clients.set(client.clientId, client, { expireAt: dayjs().add(this.clientDays, "day") });
    this.logger.info(
      `OAuth client registered from ${address}: ${client.clientName || client.clientId} → ${client.redirectUris.join(", ")}`,
    );
    return OAuthRegistration.response(OauthService.record(client), { clientSecret });
  }

  async resolveClient(clientId: string): Promise<OAuthClientRecord | null> {
    const configured = this.oauthOption.clients.find((client) => client.clientId === clientId);
    if (configured)
      return {
        clientId,
        clientName: configured.clientName,
        redirectUris: configured.redirectUris,
        grantTypes: ["authorization_code", "refresh_token"],
        tokenEndpointAuthMethod: configured.clientSecret
          ? (configured.tokenEndpointAuthMethod ?? "client_secret_post")
          : "none",
        clientSecretHash: configured.clientSecret ? hashToken(configured.clientSecret) : undefined,
        source: "static",
      };
    const known = await this.clients.get(clientId);
    if (known) return OauthService.record(known);
    const { clientIdMetadata } = this.oauthOption;
    if (!clientIdMetadata.enabled || !OAuthClientIdMetadata.isDocumentUrl(clientId)) return null;
    const fetched = await OAuthClientIdMetadata.fetch(clientId, {
      allowedSchemes: this.oauthOption.allowedRedirectSchemes,
      ...(clientIdMetadata.refusePrivateAddresses ? {} : { resolve: false }),
    });
    if (!fetched) return null;
    await this.clients.set(clientId, OauthService.constant(fetched.client), {
      expireAt: dayjs().add(fetched.ttlMs, "millisecond"),
    });
    return fetched.client;
  }

  async authorize(req: Request, account: SerAccount | null): Promise<Response> {
    if (!this.oauthOption.enabled) return this.disabled();
    const { issuer, resource, consentPath, consentRoute, signinPath } = this.oauthOption;
    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");
    const client = clientId ? await this.resolveClient(clientId) : null;
    const parsed = OAuthAuthorize.parse(url, { client, issuer, resource });
    if (!parsed.ok) return parsed.response;
    const { params } = parsed;
    const redirect = OAuthRedirect.parse(params.redirectUri);
    const subject = OauthService.subjectOf(account);
    const request = new cnst.OauthRequest({
      requestId: createOpaqueToken(32),
      clientId: params.clientId,
      clientName: client?.clientName ?? "",
      redirectUri: params.redirectUri,
      redirectHost: OAuthRedirect.hostOf(params.redirectUri),
      isLoopbackRedirect: !!redirect && OAuthRedirect.isLoopback(redirect),
      codeChallenge: params.codeChallenge,
      state: params.state ?? "",
      resource: params.resource,
      scope: params.scope ?? "",
      subjectType: subject?.type ?? "user",
      subjectId: subject?.id ?? "",
      status: "pending",
    });
    await this.requests.set(request.requestId, request, { expireAt: this.requestExpiry(request) });
    const query = `?request=${request.requestId}`;
    return OauthService.redirect(
      subject ? `${consentPath}${query}` : `${signinPath}?redirect=${encodeURIComponent(`${consentRoute}${query}`)}`,
    );
  }

  async viewRequest(requestId: string, account: SerAccount | null): Promise<cnst.OauthRequest> {
    const request = await this.requests.get(requestId);
    if (request?.status !== "pending") throw new Err("oauth.error.requestNotFound");
    const subject = OauthService.subjectOf(account);
    if (!subject) throw new Err("oauth.error.notSignedIn", undefined, { statusCode: 401 });
    if (!request.subjectId) {
      request.subjectType = subject.type;
      request.subjectId = subject.id;
      await this.requests.set(requestId, request, { expireAt: this.requestExpiry(request) });
    } else if (request.subjectId !== subject.id || request.subjectType !== subject.type)
      throw new Err("oauth.error.requestBoundToAnotherAccount", undefined, { statusCode: 403 });
    return request;
  }

  async decide(
    requestId: string,
    account: SerAccount | null,
    approved: boolean,
    userAgent?: string,
  ): Promise<Response> {
    const request = await this.viewRequest(requestId, account);
    if (!request.subjectId) throw new Err("oauth.error.requestNotFound");
    // Written before the code exists, so a second decision on the same request finds it already decided.
    request.status = approved ? "approved" : "denied";
    await this.requests.set(requestId, request, { expireAt: this.requestExpiry(request) });
    const { issuer } = this.oauthOption;
    if (!approved)
      return OAuthErrors.redirect(request.redirectUri, {
        error: "access_denied",
        description: "The user denied the request.",
        state: request.state || undefined,
        iss: issuer,
      });
    const code = createOpaqueToken(32);
    const grant = new cnst.OauthGrant({
      codeHash: hashToken(code),
      requestId,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      resource: request.resource,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
      userAgent: userAgent ?? "",
      expiresAt: dayjs().add(this.codeSeconds, "second"),
    });
    await this.grants.set(grant.codeHash, grant, { expireAt: grant.expiresAt });
    return OAuthErrors.redirectWithCode(request.redirectUri, {
      code,
      state: request.state || undefined,
      iss: issuer,
    });
  }

  async exchange(req: Request): Promise<Response> {
    if (!this.oauthOption.enabled) return this.disabled();
    const parsed = await OAuthToken.parse(req);
    if (!parsed.ok) return parsed.response;
    const { params } = parsed;
    this.logger.debug(`OAuth token request grant_type=${params.grantType} client_id=${params.client.clientId ?? "-"}`);
    if (!params.client.clientId)
      return OAuthErrors.token("invalid_client", "The request names no client_id.", params.client);
    const client = await this.resolveClient(params.client.clientId);
    // 401 `invalid_client` is also the signal claude.ai reads to re-register a client this server has forgotten.
    if (!client || !OAuthToken.authenticate(client, params.client, hashToken))
      return OAuthErrors.token("invalid_client", "Unknown client or wrong client credential.", params.client);
    return params.grantType === "authorization_code"
      ? await this.exchangeCode(client, params)
      : await this.refresh(client, params);
  }

  /**
   * RFC 7009. The client that holds a token may hand it back; the answer is the same empty 200 whether the token was
   * live, already gone, never ours, or another client's — the endpoint must not double as a token oracle. A refresh
   * token or an access token both name one grant, and revoking the grant is what "revoke" means here: the refresh
   * lineage is closed and the lineage id is denylisted for as long as an access token minted from it can still be valid.
   */
  async revoke(req: Request): Promise<Response> {
    if (!this.oauthOption.enabled) return this.disabled();
    const parsed = await OAuthRevocation.parse(req);
    if (!parsed.ok) return parsed.response;
    const { params } = parsed;
    if (!params.client.clientId)
      return OAuthErrors.token("invalid_client", "The request names no client_id.", params.client);
    const client = await this.resolveClient(params.client.clientId);
    if (!client || !OAuthToken.authenticate(client, params.client, hashToken))
      return OAuthErrors.token("invalid_client", "Unknown client or wrong client credential.", params.client);
    const lineage = await this.lineageOf(params.token);
    if (lineage && lineage.clientId === client.clientId) {
      await this.revokeLineage(lineage);
      this.logger.info(`OAuth client ${client.clientId} revoked its grant for ${lineage.subject}:${lineage.subjectId}`);
    }
    return OAuthRevocation.success();
  }

  /** The account's live grants, one per lineage, for a connected-apps list. Browser sessions are not among them. */
  async listConnections(account: SerAccount | null): Promise<cnst.OauthConnection[]> {
    const subject = OauthService.subjectOf(account);
    if (!subject) throw new Err("oauth.error.notSignedIn", undefined, { statusCode: 401 });
    const currentSid = (account as SerAccount<AuthTokenMeta> | null)?.sid;
    const heads = new Map<string, RefreshSession>();
    for (const session of await listRefreshSessions(this.cacheOf(subject.type), subject.type, subject.id)) {
      if (!session.clientId) continue;
      const known = heads.get(session.id);
      if (!known || dayjs(known.expiresAt).isBefore(dayjs(session.expiresAt))) heads.set(session.id, session);
    }
    return await Promise.all(
      [...heads.values()].map(
        async (session) =>
          new cnst.OauthConnection({
            sessionId: session.id,
            clientId: session.clientId ?? "",
            clientName: await this.clientNameOf(session.clientId ?? ""),
            userAgent: session.userAgent ?? "",
            createdAt: session.createdAt
              ? dayjs(session.createdAt)
              : dayjs(session.expiresAt).subtract(this.securityService.refreshTokenDays, "day"),
            expiresAt: dayjs(session.expiresAt),
            isCurrent: session.id === currentSid,
          }),
      ),
    );
  }

  /** The account's owner disconnecting one application. `false` when the id names no live grant of theirs. */
  async revokeConnection(sessionId: string, account: SerAccount | null): Promise<boolean> {
    const subject = OauthService.subjectOf(account);
    if (!subject) throw new Err("oauth.error.notSignedIn", undefined, { statusCode: 401 });
    const sessions = await listRefreshSessions(this.cacheOf(subject.type), subject.type, subject.id);
    const lineage = sessions.find((session) => session.id === sessionId && session.clientId);
    if (!lineage) return false;
    await this.revokeLineage(lineage);
    this.logger.info(`${subject.type}:${subject.id} disconnected OAuth client ${lineage.clientId}`);
    return true;
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    return !!(await this.revokedSessions.get(sessionId));
  }

  /**
   * A refresh token is found by its hash in either subject's cache; an access token carries its lineage as `sid` and
   * its subject as `sub`, and is believed only with this app's signature, app and environment on it.
   */
  private async lineageOf(token: string): Promise<Lineage | null> {
    const hash = hashToken(token);
    const refresh =
      (await getRefreshSession(this.userService.userModel.userCache, hash)) ??
      (await getRefreshSession(this.adminService.adminModel.adminCache, hash));
    if (refresh) return refresh;
    const claims = await this.securityService
      .verify<AuthTokenMeta & { appName?: string; environment?: string; client_id?: string; sub?: string }>(token)
      .catch(() => null);
    const { appName, environment } = getEnv();
    if (!claims || claims.appName !== appName || claims.environment !== environment) return null;
    if (claims.tokenType !== "access" || typeof claims.sid !== "string" || typeof claims.client_id !== "string")
      return null;
    const [subject, subjectId] = (claims.sub ?? "").split(":");
    if ((subject !== "user" && subject !== "admin") || !subjectId) return null;
    return { id: claims.sid, subject, subjectId, clientId: claims.client_id };
  }

  private async revokeLineage({ id, subject, subjectId }: Lineage) {
    await revokeRefreshSessionBySid(this.cacheOf(subject), subject, subjectId, id);
    // Access tokens are stateless, so the lineage id every one of them carries as `sid` is denied for the longest
    // one could still be valid; `AccountMiddleware` and the `/mcp` verifier both ask `RevokedSessions`.
    await this.revokedSessions.set(id, 1, {
      expireAt: dayjs().add(this.oauthOption.accessTokenSeconds, "second"),
    });
  }

  private cacheOf(subject: RefreshSession["subject"]) {
    return subject === "user" ? this.userService.userModel.userCache : this.adminService.adminModel.adminCache;
  }

  /** Configured and registered clients only: a listing must not fetch a metadata document on the account's behalf. */
  private async clientNameOf(clientId: string) {
    const configured = this.oauthOption.clients.find((client) => client.clientId === clientId);
    if (configured) return configured.clientName ?? "";
    return (await this.clients.get(clientId))?.clientName ?? "";
  }

  private async exchangeCode(client: OAuthClientRecord, params: CodeGrantParams): Promise<Response> {
    const codeHash = hashToken(params.code);
    const grant = await this.grants.get(codeHash);
    // Consumed before it is judged: a code that fails any check below is spent, so a second attempt cannot fish for
    // the one thing it lacked.
    if (grant) await this.grants.delete(codeHash);
    const invalid = (description: string) => OAuthErrors.token("invalid_grant", description, params.client);
    if (!grant || dayjs(grant.expiresAt).isBefore(dayjs()))
      return invalid("The authorization code is unknown, expired or already used.");
    if (grant.clientId !== client.clientId) return invalid("The authorization code belongs to another client.");
    if (params.redirectUri && params.redirectUri !== grant.redirectUri)
      return invalid("redirect_uri does not match the authorization request.");
    if (!OAuthPkce.verify(params.codeVerifier, grant.codeChallenge)) return invalid("PKCE verification failed.");
    if (params.resource && !OAuthAuthorize.sameResource(params.resource, grant.resource))
      return OAuthErrors.token(
        "invalid_target",
        `This server issues tokens for ${grant.resource} only.`,
        params.client,
      );
    try {
      return await this.issue(client, { type: grant.subjectType, id: grant.subjectId }, grant.userAgent || undefined);
    } catch (error) {
      // A client retries a failed exchange at once and shows its user the second answer, which is "code already
      // used" — so the first refusal's reason survives only here.
      this.logger.warn(
        `OAuth code exchange for ${grant.subjectType}:${grant.subjectId} failed: ${OauthService.reason(error)}`,
      );
      return invalid("The account this code was issued for is no longer available.");
    }
  }

  private async refresh(client: OAuthClientRecord, params: RefreshParams): Promise<Response> {
    const next = this.securityService.createRefreshToken();
    const presented = hashToken(params.refreshToken);
    const invalid = (description: string) => OAuthErrors.token("invalid_grant", description, params.client);
    // User and admin sessions live in their own model's cache; the token says nothing about which minted it.
    const session =
      (await this.rotate(this.userService.userModel.userCache, presented, next, client)) ??
      (await this.rotate(this.adminService.adminModel.adminCache, presented, next, client));
    if (!session) return invalid("The refresh token is unknown, expired, revoked or already used.");
    if (session.clientId !== client.clientId) return invalid("The refresh token belongs to another client.");
    if (params.resource && !OAuthAuthorize.sameResource(params.resource, this.oauthOption.resource))
      return OAuthErrors.token("invalid_target", `This server issues tokens for ${this.oauthOption.resource} only.`);
    try {
      return await this.mint(client, { type: session.subject, id: session.subjectId }, session.id, next.refreshToken);
    } catch (error) {
      this.logger.warn(
        `OAuth refresh for ${session.subject}:${session.subjectId} failed: ${OauthService.reason(error)}`,
      );
      return invalid("The account this token was issued for is no longer available.");
    }
  }

  /**
   * A reuse past the grace window revokes that token's lineage, never the account: another MCP client, the browser
   * and every other grant keep their sessions, and the client whose stale token this was is named in the log.
   */
  private async rotate(
    cache: Parameters<typeof rotateRefreshSession>[0],
    presented: string,
    next: ReturnType<srv.util.SecurityService["createRefreshToken"]>,
    client: OAuthClientRecord,
  ) {
    try {
      return await rotateRefreshSession(cache, presented, next.refreshTokenHash, next.refreshTokenExpiresAt, {
        graceMs: refreshRotationGraceMs,
        reuseRevokes: "lineage",
      });
    } catch (error) {
      const reason = OauthService.reason(error);
      // An unknown hash is the normal miss on the first of the two caches; anything else is worth a line.
      if (reason !== "shared.error.invalidRefreshToken")
        this.logger.warn(`OAuth refresh refused for client ${client.clientId}: ${reason}`);
      return null;
    }
  }

  private async issue(client: OAuthClientRecord, subject: Subject, userAgent?: string): Promise<Response> {
    const refresh = this.securityService.createRefreshToken();
    const session =
      subject.type === "user"
        ? await this.userService.userModel.createRefreshSession(
            subject.id,
            refresh.refreshTokenHash,
            refresh.refreshTokenExpiresAt,
            userAgent,
            client.clientId,
          )
        : await this.adminService.adminModel.createRefreshSession(
            subject.id,
            refresh.refreshTokenHash,
            refresh.refreshTokenExpiresAt,
            userAgent,
            client.clientId,
          );
    return await this.mint(client, subject, session.id, refresh.refreshToken);
  }

  /**
   * The same claims a browser session carries, plus the OAuth ones: `AccountMiddleware` reads `self`/`me` as before,
   * `McpAuth` reads `aud`. Minted from the live account, not from a snapshot, so a role change reaches the next token.
   */
  private async mint(client: OAuthClientRecord, subject: Subject, sid: string, refreshToken: string) {
    const identity =
      subject.type === "user"
        ? { self: await this.userService.makeSelf(await this.userService.getActiveUser(subject.id)) }
        : { me: await this.adminService.getMe(subject.id) };
    const { issuer, resource } = this.oauthOption;
    const { jwt } = await this.securityService.signAccessToken(
      { ...identity, iss: issuer, aud: resource, client_id: client.clientId, sub: `${subject.type}:${subject.id}` },
      { sid, jti: crypto.randomUUID(), expiresAt: dayjs().add(this.oauthOption.accessTokenSeconds, "second") },
    );
    return OAuthToken.success({ accessToken: jwt, expiresIn: this.oauthOption.accessTokenSeconds, refreshToken });
  }

  private requestExpiry(request: cnst.OauthRequest) {
    return dayjs(request.createdAt).add(this.requestMinutes, "minute");
  }

  private disabled() {
    return Response.json(
      { error: "not_found", error_description: "OAuth is disabled on this server." },
      { status: 404 },
    );
  }

  private static constant(client: OAuthClientRecord): cnst.OauthClient {
    return new cnst.OauthClient({
      ...client,
      clientName: client.clientName ?? "",
      clientSecretHash: client.clientSecretHash ?? "",
    });
  }

  private static record(client: cnst.OauthClient): OAuthClientRecord {
    return {
      clientId: client.clientId,
      clientName: client.clientName || undefined,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      clientSecretHash: client.clientSecretHash || undefined,
      source: client.source,
    };
  }

  private static subjectOf(account: SerAccount | null): Subject | null {
    const { self, me } = (account ?? {}) as SerAccount<{ self?: { id?: string }; me?: { id?: string } }>;
    if (self?.id) return { type: "user", id: self.id };
    if (me?.id) return { type: "admin", id: me.id };
    return null;
  }

  private static reason(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private static redirect(location: string) {
    return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
  }
}
