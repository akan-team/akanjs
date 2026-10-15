import { DictionaryLookup } from "akanjs/dictionary";
import { OAuthPkce } from "akanjs/server";

import { Err } from "../lib/dict";

export interface NativeSsoStart {
  callbackScheme: string;
  codeChallenge: string;
  nonce: string;
  origin: string;
  lang: string;
  returnPage: boolean;
}

export interface NativeSsoIdentity {
  accountId: string;
  nickname?: string;
  legacyAccountId?: string;
}

export type NativeSsoResult = { code: string } | { error: string };

type NativeSsoReturn = Pick<NativeSsoStart, "callbackScheme" | "nonce" | "lang" | "returnPage">;

export class NativeSso {
  static readonly startMinutes = 10;
  static readonly codeSeconds = 60;
  static readonly #langPattern = /^[a-z]{2,3}$/;

  static parseStart(req: Request): NativeSsoStart | null {
    const params = new URL(req.url).searchParams;
    const callbackScheme = params.get("callbackScheme");
    if (!callbackScheme) return null;
    const codeChallenge = params.get("codeChallenge");
    const nonce = params.get("state");
    if (!OAuthPkce.isChallenge(codeChallenge) || !nonce) throw new Err("shared.error.invalidNativeSsoStart");
    return {
      callbackScheme,
      codeChallenge,
      nonce,
      origin: NativeSso.publicOrigin(req),
      lang: NativeSso.#langOf(params.get("lang"), req.headers.get("accept-language")),
      returnPage: params.get("returnPage") === "1",
    };
  }

  //* The akan gateway stamps x-forwarded-host/proto, so behind an edge this is the browser's origin, not the pod's.
  static publicOrigin(req: Request) {
    const proto = NativeSso.#first(req.headers.get("x-forwarded-proto"));
    const host = NativeSso.#first(req.headers.get("x-forwarded-host")) ?? req.headers.get("host");
    return proto && host ? `${proto}://${host}` : new URL(req.url).origin;
  }

  static stateOf(req: Request) {
    return new URL(req.url).searchParams.get("state");
  }

  static callbackUrl(start: Pick<NativeSsoStart, "callbackScheme" | "nonce">, result: NativeSsoResult) {
    const params = new URLSearchParams({ ...result, state: start.nonce });
    return `${start.callbackScheme}://sso/callback?${params.toString()}`;
  }

  //* iOS and Android close their auth sheet on the redirect; a desktop browser tab stays behind, stuck on the provider.
  static respond(start: NativeSsoReturn, result: NativeSsoResult): Response {
    const deepLink = NativeSso.callbackUrl(start, result);
    if (!start.returnPage)
      return new Response(null, { status: 302, headers: { Location: deepLink, "Cache-Control": "no-store" } });
    return new Response(NativeSso.returnPage(deepLink, start.lang, "code" in result), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  static returnPage(deepLink: string, lang: string, isDone: boolean) {
    const lookup = new DictionaryLookup(lang);
    const t = (key: string) => NativeSso.#escape(lookup.text(`shared.${key}`) ?? key);
    const title = t(isDone ? "ssoReturnDoneTitle" : "ssoReturnFailedTitle");
    return `<!doctype html>
<html lang="${NativeSso.#escape(lookup.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:Canvas;color:CanvasText}
main{max-width:24rem;padding:2rem;text-align:center}
h1{margin:0 0 .75rem;font-size:1.375rem}
p{margin:0 0 1.75rem;line-height:1.6;opacity:.7}
a{display:inline-block;padding:.75rem 1.75rem;border-radius:.625rem;background:CanvasText;color:Canvas;font-weight:600;text-decoration:none}
small{display:block;margin-top:1.5rem;opacity:.5}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${t(isDone ? "ssoReturnDoneDesc" : "ssoReturnFailedDesc")}</p>
<a href="${NativeSso.#escape(deepLink)}">${t("ssoReturnOpenApp")}</a>
<small>${t("ssoReturnCloseTab")}</small>
</main>
<script>location.replace(${JSON.stringify(deepLink).replace(/</g, "\\u003c")});</script>
</body>
</html>`;
  }

  static #langOf(requested: string | null, acceptLanguage: string | null) {
    const lang = requested ?? acceptLanguage?.split(",")[0]?.split("-")[0]?.trim().toLowerCase() ?? "";
    return NativeSso.#langPattern.test(lang) ? lang : "en";
  }

  static #escape(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static #first(value: string | null) {
    return value?.split(",")[0]?.trim() || undefined;
  }
}
