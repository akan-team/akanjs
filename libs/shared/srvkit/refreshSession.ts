import { dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";

import { Err } from "../lib/dict";
import { RevokedSessions } from "./revokedSessions";
import { emitSecuritySignal } from "./securitySignalHook";
import type { SigninDevice } from "./signinClient";

interface RefreshSessionCache {
  get(namespace: string, key: string): Promise<unknown>;
  set(
    namespace: string,
    key: string,
    value: object,
    option?: { expireAt?: ReturnType<typeof dayjs> },
  ): Promise<unknown>;
  setIfAbsent(
    namespace: string,
    key: string,
    value: string,
    option?: { expireAt?: ReturnType<typeof dayjs> },
  ): Promise<boolean>;
  hset(
    namespace: string,
    key: string,
    subKey: string,
    value: number,
    option?: { expireAt?: ReturnType<typeof dayjs> },
  ): Promise<unknown>;
  hkeys(namespace: string, key: string): Promise<string[]>;
  hdelete(namespace: string, key: string, subKey: string): Promise<unknown>;
}

export type RefreshSessionKind = "browser" | "native" | "cli" | "signinAs";

export interface RefreshSession {
  id: string;
  subject: "user" | "admin";
  subjectId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  rotatedAt?: string;
  replacedBy?: string;
  userAgent?: string;
  /** The OAuth client the session was issued to; a refresh presented by any other client, or by none, is refused. */
  clientId?: string;
  /** Absent on sessions written before it was recorded. */
  createdAt?: string;
  kind?: RefreshSessionKind;
  //? An IPv4 /24 or IPv6 /48 prefix: the full address is never kept. Absent, like `kind`, on older sessions.
  network?: string;
  lastUsedAt?: string;
}

interface CreateRefreshSessionInput {
  subject: RefreshSession["subject"];
  subjectId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  clientId?: string;
  kind?: RefreshSessionKind;
  network?: string;
}

const logger = new Logger("RefreshSession");

const sessionNamespace = "refreshSessionByTokenHash";
const claimNamespace = "refreshSessionClaimByTokenHash";
const ownerNamespace = "refreshSessionHashes";
const revokedLineageNamespace = "refreshSessionRevokedById";

const getOwnerKey = (subject: RefreshSession["subject"], subjectId: string) => `${subject}:${subjectId}`;

const getSession = async (cache: RefreshSessionCache, refreshTokenHash: string) => {
  return (await cache.get(sessionNamespace, refreshTokenHash)) as RefreshSession | undefined;
};

const setSession = async (cache: RefreshSessionCache, session: RefreshSession) => {
  await cache.set(sessionNamespace, session.refreshTokenHash, session, { expireAt: dayjs(session.expiresAt) });
};

// One hash field per session, so two sign-ins at once cannot overwrite each other's entry in the owner's list.
const addOwnerSessionHash = async (cache: RefreshSessionCache, session: RefreshSession) => {
  const ownerKey = getOwnerKey(session.subject, session.subjectId);
  await cache.hset(ownerNamespace, ownerKey, session.refreshTokenHash, 1, { expireAt: dayjs(session.expiresAt) });
};

const getOwnerSessionHashes = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
) => {
  const ownerKey = getOwnerKey(subject, subjectId);
  const [hashes, listed] = await Promise.all([
    cache.hkeys(ownerNamespace, ownerKey),
    cache.get(ownerNamespace, ownerKey),
  ]);
  // Sessions signed in while the list was one array value; the array expires with the last session written to it.
  return [...new Set([...hashes, ...(Array.isArray(listed) ? (listed as string[]) : [])])];
};

const loadOwnerSessions = async (cache: RefreshSessionCache, subject: RefreshSession["subject"], subjectId: string) => {
  const sessionHashes = await getOwnerSessionHashes(cache, subject, subjectId);
  const sessions = await Promise.all(sessionHashes.map(async (sessionHash) => await getSession(cache, sessionHash)));
  return sessions.filter((session): session is RefreshSession => !!session);
};

const isLineageRevoked = async (cache: RefreshSessionCache, sessionId: string) =>
  !!(await cache.get(revokedLineageNamespace, sessionId));

//? Outlives the lineage's newest entry: a rotation drops the superseded one from the list, so only this refuses it.
const markLineagesRevoked = async (cache: RefreshSessionCache, sessionIds: string[], sessions: RefreshSession[]) => {
  const now = dayjs();
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const expireAt = sessions
        .filter((session) => session.id === sessionId)
        .reduce(
          (latest, session) => (dayjs(session.expiresAt).isAfter(latest) ? dayjs(session.expiresAt) : latest),
          now.add(RevokedSessions.deniedSeconds, "second"),
        );
      await cache.set(revokedLineageNamespace, sessionId, { revokedAt: now.toISOString() }, { expireAt });
    }),
  );
  await RevokedSessions.markRevoked(sessionIds);
};

//? A rotation the first pass missed is listed before the second pass, or else finds the mark once it is listed.
const revokeLineagesWhere = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
  isRevoked: (session: RefreshSession) => boolean,
  knownIds: string[] = [],
) => {
  const seen = (await loadOwnerSessions(cache, subject, subjectId)).filter(
    (session) => !session.revokedAt && isRevoked(session),
  );
  const markedIds = [...new Set([...knownIds, ...seen.map((session) => session.id)])];
  await markLineagesRevoked(cache, markedIds, seen);
  const current = await loadOwnerSessions(cache, subject, subjectId);
  const revokedIds = new Set<string>();
  await Promise.all(
    current.map(async (session) => {
      if (session.revokedAt || !isRevoked(session)) return;
      await setSession(cache, { ...session, revokedAt: dayjs().toISOString() });
      revokedIds.add(session.id);
    }),
  );
  const lateIds = [...revokedIds].filter((sessionId) => !markedIds.includes(sessionId));
  if (lateIds.length) await markLineagesRevoked(cache, lateIds, current);
  return [...revokedIds];
};

export const createRefreshSession = async (cache: RefreshSessionCache, input: CreateRefreshSessionInput) => {
  const session: RefreshSession = {
    id: crypto.randomUUID(),
    subject: input.subject,
    subjectId: input.subjectId,
    refreshTokenHash: input.refreshTokenHash,
    expiresAt: input.expiresAt.toISOString(),
    userAgent: input.userAgent,
    clientId: input.clientId,
    createdAt: dayjs().toISOString(),
    kind: input.kind,
    network: input.network,
  };
  await setSession(cache, session);
  await addOwnerSessionHash(cache, session);
  return session;
};

export const getRefreshSession = async (cache: RefreshSessionCache, refreshTokenHash: string) =>
  await getSession(cache, refreshTokenHash);

/**
 * The subject's live sessions: not revoked, not expired, and not a token that has already been rotated away. Two
 * live entries may share an `id` — a rotation inside the grace window leaves siblings — and both belong to the one
 * grant that id names.
 */
export const listRefreshSessions = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
  now = dayjs(),
) => {
  const sessions = await loadOwnerSessions(cache, subject, subjectId);
  return sessions.filter(
    (session) => !session.revokedAt && !session.replacedBy && !dayjs(session.expiresAt).isBefore(now),
  );
};

/**
 * How long a rotated token is still honoured when a caller asks for a grace window. An OAuth client that holds one
 * token in two places — Claude Code opens its MCP connection twice at startup — refreshes twice within a second,
 * and the second refresh is not theft: inside the window it is answered with a rotation of its own, past it the
 * reuse revokes the family (OAuth 2.1 §6.1 leaves detection to the server; Auth0's reuse interval and Okta's grace
 * period make the same trade). Off by default, so a browser session keeps strict single-use; the window is measured
 * from the first rotation, so it cannot be kept open by re-presenting.
 */
export const refreshRotationGraceMs = 30_000;
// One browser can still race itself (no Web Locks, a lost response); a few seconds of grace answers the second request
// with a sibling session instead of reading it as theft and signing the account out everywhere.
export const browserRefreshGraceMs = 10_000;

export interface RotateRefreshSessionOptions {
  graceMs?: number;
  now?: ReturnType<typeof dayjs>;
  /**
   * What a detected reuse revokes. `account` (the default, and the browser session's policy) signs the subject out
   * everywhere. `lineage` revokes only the sessions sharing the reused token's `id` — the one grant, in OAuth 2.1
   * §6.1's sense — so a stale token replayed by one MCP client cannot log the browser and every other client out.
   */
  reuseRevokes?: "account" | "lineage";
  /**
   * The OAuth client presenting the token, unset at a first-party refresh. A session issued to anyone else is answered
   * as an unknown token before anything is written: an MCP client's token traded at `refreshJwt` would come back
   * without `aud` / `client_id`, and `Person` would read the model as the account's owner.
   */
  clientId?: string;
  device?: SigninDevice;
}

export const rotateRefreshSession = async (
  cache: RefreshSessionCache,
  refreshTokenHash: string,
  nextRefreshTokenHash: string,
  nextExpiresAt: Date,
  { graceMs = 0, now = dayjs(), reuseRevokes = "account", clientId, device }: RotateRefreshSessionOptions = {},
) => {
  const session = await getSession(cache, refreshTokenHash);
  if (!session) throw new Err("shared.error.invalidRefreshToken");
  if ((session.clientId ?? "") !== (clientId ?? "")) {
    const owner = session.clientId ? `OAuth client ${session.clientId}` : "a first-party sign-in";
    const presenter = clientId ? `OAuth client ${clientId}` : "a first-party refresh endpoint";
    logger.warn(
      `Refresh refused for ${session.subject}:${session.subjectId}: a token issued to ${owner} was presented by ${presenter}`,
    );
    throw new Err("shared.error.invalidRefreshToken");
  }
  if (session.revokedAt || (await isLineageRevoked(cache, session.id)))
    throw new Err("shared.error.revokedRefreshToken");
  if (dayjs(session.expiresAt).isBefore(now)) throw new Err("shared.error.expiredRefreshToken");
  // With no window no clock is read: a presentation whose `now` is earlier than the claim it lost is still a reuse.
  const isPastGrace = (rotatedAt: string) => graceMs <= 0 || now.diff(dayjs(rotatedAt)) >= graceMs;
  const reuseDetected = async () => {
    if (reuseRevokes === "lineage")
      await revokeRefreshSessionBySid(cache, session.subject, session.subjectId, session.id);
    else await revokeRefreshSessions(cache, session.subject, session.subjectId);
    emitSecuritySignal({
      kind: "refreshReuse",
      subject: session.subject,
      subjectId: session.subjectId,
      revokes: reuseRevokes,
      ...(session.clientId ? { clientId: session.clientId } : {}),
    });
    return new Err("shared.error.refreshTokenReuseDetected");
  };
  if (session.rotatedAt && isPastGrace(session.rotatedAt)) throw await reuseDetected();

  //? Recording it here retires the legacy session, which otherwise keeps every sign-in from reading as a new device.
  const recorded =
    session.kind || session.clientId || !device?.kind
      ? {}
      : { kind: device.kind, userAgent: device.userAgent ?? session.userAgent, network: device.network };
  const nextSession = {
    ...session,
    ...recorded,
    refreshTokenHash: nextRefreshTokenHash,
    expiresAt: nextExpiresAt.toISOString(),
    lastUsedAt: now.toISOString(),
  };
  delete nextSession.rotatedAt;
  delete nextSession.replacedBy;
  // Listed before the claim, so the revocation a presentation that loses the claim sets off reaches this one too.
  await setSession(cache, nextSession);
  await addOwnerSessionHash(cache, nextSession);
  if (await isLineageRevoked(cache, session.id)) {
    await setSession(cache, { ...nextSession, revokedAt: now.toISOString() });
    throw new Err("shared.error.revokedRefreshToken");
  }

  // Two presentations can both read `rotatedAt` unset before either writes it; only one can take the claim.
  const claimed = await cache.setIfAbsent(claimNamespace, refreshTokenHash, now.toISOString(), {
    expireAt: dayjs(session.expiresAt),
  });
  const rotatedAt =
    session.rotatedAt ??
    (claimed ? now.toISOString() : ((await cache.get(claimNamespace, refreshTokenHash)) as string | undefined));
  if (!rotatedAt || (!claimed && isPastGrace(rotatedAt))) throw await reuseDetected();

  await setSession(cache, { ...session, rotatedAt, replacedBy: nextRefreshTokenHash });
  await cache.hdelete(ownerNamespace, getOwnerKey(session.subject, session.subjectId), refreshTokenHash);
  return nextSession;
};

export const revokeRefreshSessionBySid = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
  sessionId?: string,
) => {
  if (!sessionId) return;
  await revokeLineagesWhere(cache, subject, subjectId, (session) => session.id === sessionId, [sessionId]);
};

export const revokeRefreshSessions = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
) => {
  await revokeLineagesWhere(cache, subject, subjectId, () => true);
};

export const revokeRefreshSessionsBut = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
  isKept: (session: RefreshSession) => boolean,
) => await revokeLineagesWhere(cache, subject, subjectId, (session) => !isKept(session));
