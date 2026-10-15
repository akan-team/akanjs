import { safeRedirectPath, withRedirectQuery } from "@libs/shared/common";
import type { option as utilOption } from "@libs/util/server";
import { createOpaqueToken } from "@libs/util/srvkit";
import type { Account } from "akanjs/fetch";

import { Err } from "../lib/dict";
import type { SerAccount } from "./account";
import { NativeSso, type NativeSsoIdentity, type NativeSsoResult, type NativeSsoStart } from "./nativeSso";
import { expireCookie, getSsoOrigin, makeSsoRedirectResponse, type SsoCookie, setHttpOnlyCookie } from "./ssoHelper";
import { type SsoIdentity, SsoProvider } from "./ssoProvider";

type SsoType = utilOption.SSOType;
type SsoRequest = Bun.BunRequest & { account?: SerAccount };
type NativeHandoff = NativeSsoStart & { ssoType: SsoType };

/** What the flow needs from the user service; declared here so srvkit does not import the service. */
export interface SsoFlowService {
  startNativeSso(ssoType: SsoType, start: NativeSsoStart): Promise<string>;
  takeNativeSso(state: string | null): Promise<NativeHandoff | null>;
  handOffNativeSso(start: NativeHandoff, identify: () => Promise<NativeSsoIdentity>): Promise<NativeSsoResult>;
  handleSsoCallback(
    identity: SsoIdentity,
    ssoType: SsoType,
    cookie: SsoCookie,
    account?: Account,
  ): Promise<{ cookie?: { [key: string]: string }; redirect: string }>;
}

export class SsoFlow {
  static readonly #stateCookie = "ssoState";
  static readonly #stateSeconds = 600;
  static readonly #errorKeyPattern = /^[a-z][A-Za-z]*\.error\.[A-Za-z]+$/;

  // The web sign-in binds its `state` to this browser through an HttpOnly cookie; without it, a callback URL
  // finished in an attacker's browser could be opened in the victim's and sign them in as the attacker (RFC 6749 §10.12).
  static async start(type: SsoType, req: Bun.BunRequest, service: SsoFlowService): Promise<Response> {
    const native = NativeSso.parseStart(req);
    if (native)
      return Response.redirect(
        SsoProvider.authorizeUrl(type, native.origin, await service.startNativeSso(type, native)),
        302,
      );
    const state = createOpaqueToken();
    const headers = new Headers({ Location: SsoProvider.authorizeUrl(type, getSsoOrigin(req), state) });
    headers.append("Set-Cookie", setHttpOnlyCookie(SsoFlow.#stateCookie, state, SsoFlow.#stateSeconds));
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 302, headers });
  }

  static async callback(type: SsoType, req: SsoRequest, service: SsoFlowService): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const native = await service.takeNativeSso(params.get("state"));
    if (native)
      return NativeSso.respond(
        native,
        await service.handOffNativeSso(native, async () => {
          if (params.get("error")) throw new Err("user.error.ssoCancelled");
          return await SsoProvider.identify(type, SsoFlow.#codeOf(params), native.origin);
        }),
      );
    const cookie = req.cookies.toJSON() as unknown as SsoCookie;
    const errorRedirect = safeRedirectPath(cookie.errorRedirect, "/");
    const clearState = [expireCookie(SsoFlow.#stateCookie, true)];
    const fail = (error: string) =>
      makeSsoRedirectResponse(withRedirectQuery(errorRedirect, { error }), undefined, clearState);
    if (!cookie.ssoState || cookie.ssoState !== params.get("state")) return fail("user.error.ssoStateMismatch");
    if (params.get("error")) return fail("user.error.ssoCancelled");
    try {
      const identity = await SsoProvider.identify(type, SsoFlow.#codeOf(params), getSsoOrigin(req));
      const { cookie: sessionCookie, redirect } = await service.handleSsoCallback(identity, type, cookie, req.account);
      return makeSsoRedirectResponse(redirect, sessionCookie, clearState);
    } catch (error) {
      //? The error travels in the URL, so it is a dictionary key the page translates, never the raw message.
      const key = error instanceof Error ? error.message : "";
      return fail(SsoFlow.#errorKeyPattern.test(key) ? key : "user.error.ssoProviderFailed");
    }
  }

  static #codeOf(params: URLSearchParams) {
    const code = params.get("code");
    if (!code) throw new Err("shared.error.invalidSsoCallbackMissingCode");
    return code;
  }
}
