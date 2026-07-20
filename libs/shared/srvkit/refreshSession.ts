import { dayjs } from "akanjs/base";

import { Err } from "../lib/dict";

interface RefreshSessionCache {
  get(namespace: string, key: string): Promise<unknown>;
  set(
    namespace: string,
    key: string,
    value: unknown,
    option?: { expireAt?: Date | ReturnType<typeof dayjs> },
  ): Promise<unknown>;
}

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
}

interface CreateRefreshSessionInput {
  subject: RefreshSession["subject"];
  subjectId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
}

const sessionNamespace = "refreshSessionByTokenHash";
const ownerNamespace = "refreshSessionHashes";

const getOwnerKey = (subject: RefreshSession["subject"], subjectId: string) => `${subject}:${subjectId}`;

const getSession = async (cache: RefreshSessionCache, refreshTokenHash: string) => {
  return (await cache.get(sessionNamespace, refreshTokenHash)) as RefreshSession | undefined;
};

const setSession = async (cache: RefreshSessionCache, session: RefreshSession) => {
  await cache.set(sessionNamespace, session.refreshTokenHash, session, { expireAt: dayjs(session.expiresAt) });
};

const addOwnerSessionHash = async (cache: RefreshSessionCache, session: RefreshSession) => {
  const ownerKey = getOwnerKey(session.subject, session.subjectId);
  const sessionHashes = ((await cache.get(ownerNamespace, ownerKey)) as string[] | undefined) ?? [];
  await cache.set(ownerNamespace, ownerKey, [...new Set([...sessionHashes, session.refreshTokenHash])], {
    expireAt: dayjs(session.expiresAt),
  });
};

export const createRefreshSession = async (cache: RefreshSessionCache, input: CreateRefreshSessionInput) => {
  const session: RefreshSession = {
    id: crypto.randomUUID(),
    subject: input.subject,
    subjectId: input.subjectId,
    refreshTokenHash: input.refreshTokenHash,
    expiresAt: input.expiresAt.toISOString(),
    userAgent: input.userAgent,
  };
  await setSession(cache, session);
  await addOwnerSessionHash(cache, session);
  return session;
};

export const rotateRefreshSession = async (
  cache: RefreshSessionCache,
  refreshTokenHash: string,
  nextRefreshTokenHash: string,
  nextExpiresAt: Date,
) => {
  const session = await getSession(cache, refreshTokenHash);
  if (!session) throw new Err("shared.error.invalidRefreshToken");
  if (session.revokedAt) throw new Err("shared.error.revokedRefreshToken");
  if (dayjs(session.expiresAt).isBefore(dayjs())) throw new Err("shared.error.expiredRefreshToken");
  if (session.rotatedAt) {
    await revokeRefreshSessions(cache, session.subject, session.subjectId);
    throw new Err("shared.error.refreshTokenReuseDetected");
  }

  const rotatedSession = {
    ...session,
    rotatedAt: dayjs().toISOString(),
    replacedBy: nextRefreshTokenHash,
  };
  const nextSession = {
    ...session,
    refreshTokenHash: nextRefreshTokenHash,
    expiresAt: nextExpiresAt.toISOString(),
  };
  delete nextSession.rotatedAt;
  delete nextSession.replacedBy;

  await setSession(cache, rotatedSession);
  await setSession(cache, nextSession);
  await addOwnerSessionHash(cache, nextSession);
  return nextSession;
};

export const revokeRefreshSessionBySid = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
  sessionId?: string,
) => {
  if (!sessionId) return;
  const ownerKey = getOwnerKey(subject, subjectId);
  const sessionHashes = ((await cache.get(ownerNamespace, ownerKey)) as string[] | undefined) ?? [];
  await Promise.all(
    sessionHashes.map(async (sessionHash) => {
      const session = await getSession(cache, sessionHash);
      if (session?.id !== sessionId || session.revokedAt) return;
      await setSession(cache, { ...session, revokedAt: dayjs().toISOString() });
    }),
  );
};

export const revokeRefreshSessions = async (
  cache: RefreshSessionCache,
  subject: RefreshSession["subject"],
  subjectId: string,
) => {
  const ownerKey = getOwnerKey(subject, subjectId);
  const sessionHashes = ((await cache.get(ownerNamespace, ownerKey)) as string[] | undefined) ?? [];
  await Promise.all(
    sessionHashes.map(async (sessionHash) => {
      const session = await getSession(cache, sessionHash);
      if (!session || session.revokedAt) return;
      await setSession(cache, { ...session, revokedAt: dayjs().toISOString() });
    }),
  );
};
