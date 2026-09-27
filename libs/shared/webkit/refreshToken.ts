import { getEnv } from "akanjs/base";
import { secretStorage } from "akanjs/client";

type RefreshScope = "user" | "admin";

// A CSR client is cross-origin to the API, so the HttpOnly refresh cookie is neither kept nor sent: it holds the token
// the sign-in answer carries and hands it back in the refresh body instead.
const isCsrClient = () => {
  const env = getEnv();
  return env.side === "client" && env.renderMode === "csr";
};

const refreshTokenKey = (scope: RefreshScope) => `${scope}RefreshToken:${getEnv().appName}`;

export const saveRefreshToken = async (scope: RefreshScope, refreshToken?: string | null) => {
  if (!isCsrClient()) return;
  if (refreshToken) await secretStorage.setItem(refreshTokenKey(scope), refreshToken);
  else await secretStorage.removeItem(refreshTokenKey(scope));
};

export const loadRefreshToken = async (scope: RefreshScope): Promise<string | null> => {
  if (!isCsrClient()) return null;
  return (await secretStorage.getItem(refreshTokenKey(scope))) ?? null;
};
