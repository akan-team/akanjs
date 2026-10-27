import { getEnv } from "akanjs/base";

// `__Host-` needs the Secure that local drops; elsewhere a browser refuses the name from a sibling subdomain.
export const hostOnlyCookieKey = (key: string) => (getEnv().operationMode === "local" ? key : `__Host-${key}`);
