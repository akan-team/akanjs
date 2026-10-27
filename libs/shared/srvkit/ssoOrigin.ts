import { getEnv } from "akanjs/base";
import { AppHosts } from "akanjs/common";
import { SignalContext } from "akanjs/signal";

import { Err } from "../lib/dict";

// The provider sends the authorization code to this origin, so it never comes from a cookie or a parameter: a sibling
// subdomain or a page script could set either.
export class SsoOrigin {
  static of(req: Request, appHost?: string): string {
    const isTrustedHop = SignalContext.isTrustedHop(req);
    const forwarded = (name: string) =>
      isTrustedHop ? req.headers.get(name)?.split(",")[0]?.trim() || undefined : undefined;
    const own = URL.parse(req.url);
    const host = forwarded("x-forwarded-host") ?? own?.host;
    const proto = forwarded("x-forwarded-proto") ?? own?.protocol.slice(0, -1);
    const url = host && proto ? URL.parse(`${proto}://${host}`) : null;
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || url.href !== `${url.origin}/`)
      throw new Err("shared.error.invalidSsoOrigin");
    //? Local is a developer's machine, reached through loopback, a LAN address or a tunnel that it never declares.
    if (getEnv().operationMode !== "local" && !AppHosts.allows(url.host, appHost ? [appHost] : []))
      throw new Err("shared.error.invalidSsoOrigin");
    return url.origin;
  }
}
