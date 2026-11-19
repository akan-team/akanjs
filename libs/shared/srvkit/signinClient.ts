import { DeviceLabel } from "@libs/shared/common";
import { CrossSiteGuard } from "akanjs/signal";

import type { RefreshSession, RefreshSessionKind } from "./refreshSession";

export interface SigninDevice {
  kind?: RefreshSessionKind;
  userAgent?: string;
  network?: string;
}

//? Sign-ins hand their service the caller's account, never the request, so the middleware leaves the device beside it.
export class SigninClient {
  static readonly #userAgentChars = 512;
  static readonly #byAccount = new WeakMap<object, SigninDevice>();

  static remember(account: object, headers: Headers | undefined, ip: string | null) {
    const origin = headers?.get("origin") ?? "";
    const isNative = (CrossSiteGuard.nativeOrigins as readonly string[]).includes(origin);
    const userAgent = headers?.get("user-agent")?.slice(0, SigninClient.#userAgentChars) || undefined;
    SigninClient.#byAccount.set(account, {
      kind: isNative ? "native" : "browser",
      userAgent,
      network: SigninClient.networkOf(ip),
    });
  }

  static of(account: unknown): SigninDevice {
    return (account && typeof account === "object" && SigninClient.#byAccount.get(account)) || {};
  }

  static networkOf(ip: string | null | undefined) {
    if (!ip) return undefined;
    const address = ip.split("%")[0]?.toLowerCase() ?? "";
    const octets = address.split(".");
    if (octets.length === 4) return `${octets.slice(0, 3).join(".")}.0/24`;
    if (!address.includes(":")) return undefined;
    const [head = "", tail] = address.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
    const groups = [
      ...headGroups,
      ...Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0"),
      ...tailGroups,
    ];
    return `${groups
      .slice(0, 3)
      .map((group) => group.replace(/^0+(?=.)/, ""))
      .join(":")}::/48`;
  }

  static keyOf({ kind, userAgent, network }: SigninDevice) {
    const { browser, os } = DeviceLabel.of(userAgent);
    return [kind ?? "", browser, os, network ?? ""].join("|");
  }

  //? A first-party session from before devices were recorded may be this very device, so it never reads as new.
  static isNewAmong(device: SigninDevice, sessions: RefreshSession[]) {
    const known = sessions.filter((session) => !session.clientId && session.kind !== "signinAs");
    if (known.some((session) => !session.kind)) return false;
    const key = SigninClient.keyOf(device);
    return !known.some((session) => SigninClient.keyOf(session) === key);
  }
}
