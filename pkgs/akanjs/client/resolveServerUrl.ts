import { getEnv } from "akanjs/base";

//? A stored file URL is relative to the server that wrote it (`/api/localFile/getBlob/…`). A CSR page served from
//? another origin, such as a native shell's app://localhost, would resolve it against itself instead.
export const resolveServerUrl = (url: string): string => {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const env = getEnv();
  if (env.side !== "client" || env.renderMode !== "csr") return url;
  if (url !== env.apiPrefix && !url.startsWith(`${env.apiPrefix}/`)) return url;
  const server = new URL(env.serverHttpUri);
  const serverOrigin = `${server.protocol}//${server.host}`;
  return serverOrigin === `${window.location.protocol}//${window.location.host}` ? url : `${serverOrigin}${url}`;
};
