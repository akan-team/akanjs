import { type HostSource, resolveJwtSecret } from "@libs/util/srvkit";
import { getEnv } from "akanjs/base";
import { RemoteFetch } from "akanjs/server";
import { resolveOAuthOptions } from "./oauthServer";
import { RemoteVault } from "./remoteVault";

export interface RemoteOptions {
  /** Off by default: on, a signed-in user may make this server call an address they name. */
  enabled?: boolean;
  /** The page a remote's authorization server sends the browser back to. */
  callbackPath?: string;
  /** What the remote's consent page calls this app. */
  clientName?: string;
  /** Reaches loopback and private addresses, over plain http too; on only for a local run unless set. */
  allowPrivate?: boolean;
  /** Narrows which addresses may be connected, on top of the private-network check. */
  allowUrl?: (url: URL) => boolean;
}

export interface ResolvedRemoteOptions {
  enabled: boolean;
  redirectUri: string;
  clientName: string;
  allowUrl: (url: URL) => boolean;
  fetcher: RemoteFetch;
  vault: RemoteVault;
}

export const resolveRemoteOptions = (
  options: HostSource & { remote?: RemoteOptions; security?: { jwtSecret?: string } },
): ResolvedRemoteOptions => {
  const { remote = {} } = options;
  const { appName, environment, operationMode } = getEnv();
  const { issuer } = resolveOAuthOptions(options);
  return {
    enabled: remote.enabled ?? false,
    redirectUri: `${issuer}${remote.callbackPath ?? "/remote/callback"}`,
    clientName: remote.clientName ?? appName,
    allowUrl: remote.allowUrl ?? (() => true),
    fetcher: new RemoteFetch({ allowPrivate: remote.allowPrivate ?? operationMode === "local" }),
    vault: new RemoteVault(resolveJwtSecret(appName, environment, options.security?.jwtSecret)),
  };
};
