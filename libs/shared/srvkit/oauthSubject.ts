import { getEnv } from "akanjs/base";

import type { AuthTokenMeta, SerAccount } from "./account";
import type { OauthLineage, OauthSubject } from "./oauthGrant";

export type OauthAccessClaims = AuthTokenMeta & {
  appName?: string;
  environment?: string;
  client_id?: string;
  sub?: string;
};

export const oauthSubjectOf = (
  account: SerAccount | null,
  { allowAdmin = true }: { allowAdmin?: boolean } = {},
): OauthSubject | null => {
  const { self, me } = (account ?? {}) as SerAccount<{ self?: { id?: string }; me?: { id?: string } }>;
  if (self?.id) return { type: "user", id: self.id };
  if (me?.id && allowAdmin) return { type: "admin", id: me.id };
  return null;
};

/** An access token carries its lineage as `sid` and its subject as `sub`; believed only with this app and environment on it. */
export const oauthLineageOfAccessClaims = (claims: OauthAccessClaims | null): OauthLineage | null => {
  const { appName, environment } = getEnv();
  if (!claims || claims.appName !== appName || claims.environment !== environment) return null;
  if (claims.tokenType !== "access" || typeof claims.sid !== "string" || typeof claims.client_id !== "string")
    return null;
  const [subject, subjectId] = (claims.sub ?? "").split(":");
  if ((subject !== "user" && subject !== "admin") || !subjectId) return null;
  return { id: claims.sid, subject, subjectId, clientId: claims.client_id };
};
