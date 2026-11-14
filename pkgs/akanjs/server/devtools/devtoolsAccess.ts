import { createHmac } from "node:crypto";
import type { BaseEnv } from "akanjs/base";
import { isLocalDevRuntime, sameSecret } from "../../signal/trace";
import { FailureLimiter } from "../ops/failureLimiter";
import { DevSurfaces } from "../routing/devSurfaces";
import { DevtoolsUnlockPage } from "./devtoolsUnlockPage";

export type DevtoolsEnv = Partial<Pick<BaseEnv, "appName" | "environment" | "operationMode">>;
export type DevtoolsAccessMode = "closed" | "open" | "secret";

const cookieName = "akan-devtools";
const unlockMinutes = 15;
const unlockSeconds = unlockMinutes * 60;
const unlockFailuresPerMinute = 10;

export class DevtoolsAccess {
  static readonly unlockPath = "/_akan/devtools/unlock";
  static readonly minSecretLength = 32;
  static readonly #unlockFailures = new FailureLimiter({ limit: unlockFailuresPerMinute });

  static modeOf(env: DevtoolsEnv): DevtoolsAccessMode {
    const override = process.env.AKAN_DEVTOOLS;
    if (override === "false" || override === "0") return "closed";
    if (isLocalDevRuntime(env)) return "open";
    if (override !== "true" && override !== "1") return "closed";
    return DevtoolsAccess.#secret() ? "secret" : "closed";
  }

  static closedReason(env: DevtoolsEnv): string | null {
    const override = process.env.AKAN_DEVTOOLS;
    if ((override !== "true" && override !== "1") || DevtoolsAccess.modeOf(env) !== "closed") return null;
    if (process.env.AKAN_LOG_DEBUG_HEADER)
      return `AKAN_DEVTOOLS is on, but devtools stays closed outside a local runtime: AKAN_LOG_DEBUG_HEADER is shorter than ${DevtoolsAccess.minSecretLength} characters, too short to open devtools; set a random one at least that long`;
    return "AKAN_DEVTOOLS is on, but devtools stays closed outside a local runtime until AKAN_LOG_DEBUG_HEADER is set";
  }

  static refusalOf(req: Request, env: DevtoolsEnv, path: string): Response | null {
    const mode = DevtoolsAccess.modeOf(env);
    if (mode === "closed")
      return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (mode === "open" || path === DevtoolsAccess.unlockPath || DevtoolsAccess.#presents(req, env)) return null;
    const url = new URL(req.url);
    if (req.method === "GET" && req.headers.get("accept")?.includes("text/html"))
      return DevtoolsAccess.#page(`${url.pathname}${url.search}`, false);
    return Response.json(
      { error: "Send the AKAN_LOG_DEBUG_HEADER secret as x-akan-debug" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  static async unlock(req: Request, env: DevtoolsEnv, client: string | null): Promise<Response> {
    if (DevtoolsAccess.#unlockFailures.blocked(client))
      return new Response("Too many wrong secrets from this address; try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    const secret = DevtoolsAccess.#secret() ?? "";
    const form = await req.formData().catch(() => null);
    const presented = form?.get("secret");
    const next = DevtoolsAccess.#nextOf(form?.get("next"));
    const expiresAt = Math.floor(Date.now() / 1000) + unlockSeconds;
    const token = `${expiresAt}.${DevtoolsAccess.#sign(secret, env, expiresAt)}`;
    const matched = sameSecret(typeof presented === "string" ? presented : "", secret);
    if (!secret || !matched) {
      DevtoolsAccess.#unlockFailures.fail(client);
      return DevtoolsAccess.#page(next, true);
    }
    const headers = new Headers({ Location: next, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    for (const { path } of DevSurfaces.all.filter(({ gate }) => gate === "devtools"))
      headers.append(
        "Set-Cookie",
        `${cookieName}=${token}; Path=${path}; Max-Age=${unlockSeconds}; HttpOnly; Secure; SameSite=Strict`,
      );
    return new Response(null, { status: 303, headers });
  }

  static #page(next: string, failed: boolean): Response {
    return DevtoolsUnlockPage.render({ action: DevtoolsAccess.unlockPath, next, minutes: unlockMinutes, failed });
  }

  //? Request logging still takes a shorter secret (SignalTrace.applyDebugHeader); devtools reads the app's state.
  static #secret(): string | null {
    const secret = process.env.AKAN_LOG_DEBUG_HEADER;
    return secret && secret.length >= DevtoolsAccess.minSecretLength ? secret : null;
  }

  //? Security: both checks run whatever was sent, so a wrong secret costs what a right one does.
  static #presents(req: Request, env: DevtoolsEnv): boolean {
    const secret = DevtoolsAccess.#secret() ?? "";
    const header = req.headers.get("x-akan-debug");
    const [expires = "", signature = ""] = (
      new Bun.CookieMap(req.headers.get("cookie") ?? "").get(cookieName) ?? ""
    ).split(".");
    const expiresAt = Number(expires);
    const now = Date.now() / 1000;
    const fresh = Number.isSafeInteger(expiresAt) && expiresAt > now && expiresAt <= now + unlockSeconds;
    const headerMatches = sameSecret(header ?? "", secret);
    const cookieMatches = sameSecret(signature, DevtoolsAccess.#sign(secret, env, expiresAt));
    return !!secret && (header ? headerMatches : fresh && cookieMatches);
  }

  //? Signed rather than stored, so every replica accepts it and a new AKAN_LOG_DEBUG_HEADER ends every unlock; the
  //? app and environment are signed in, so apps or environments sharing one secret do not share an unlock.
  static #sign(secret: string, env: DevtoolsEnv, expiresAt: number): string {
    const appName = env.appName ?? process.env.AKAN_PUBLIC_APP_NAME ?? "";
    const environment = env.environment ?? process.env.AKAN_PUBLIC_ENV ?? "";
    const payload = JSON.stringify([cookieName, appName, environment, expiresAt]);
    return createHmac("sha256", secret).update(payload).digest("base64url");
  }

  //? Security: matched on the path as the browser will follow it, so `/..//x` cannot become a `//x` on another host.
  static #nextOf(value: unknown): string {
    const fallback = "/_akan/devtools";
    const base = "http://devtools.invalid";
    const url = typeof value === "string" ? URL.parse(value, base) : null;
    if (!url || url.origin !== base || url.pathname.startsWith("//") || url.pathname === DevtoolsAccess.unlockPath)
      return fallback;
    const { pathname } = url;
    const devtoolsPage = DevSurfaces.all.some(
      ({ path, gate }) => gate === "devtools" && (pathname === path || pathname.startsWith(`${path}/`)),
    );
    return devtoolsPage ? `${pathname}${url.search}` : fallback;
  }
}
