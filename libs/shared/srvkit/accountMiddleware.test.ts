import { afterEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import * as utilSrvkit from "@libs/util/srvkit";
import { dayjs, getEnv } from "akanjs/base";
import { authTokenKey } from "akanjs/common";
import type { SignalContext } from "akanjs/signal";
import type { ModulesOptions } from "../lib/option";
import { AccountMiddleware } from "./accountMiddleware";
import { Every } from "./guards";
import { RevokedSessions } from "./revokedSessions";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const jwtSecret = "account-middleware-test-secret";
const env = { security: { jwtSecret } } as unknown as ModulesOptions;

const accessToken = async (sid: string, expiresAt = dayjs().add(1, "hour")) => {
  const { appName, environment } = getEnv();
  const jwt = await utilSrvkit.jwtSign({ appName, environment, tokenType: "access", sid, me: { id: sid } }, jwtSecret, {
    expiresAt,
  });
  return `Bearer ${jwt}`;
};

const frame = async (socket: { headers: Headers; cookies: Bun.CookieMap; account?: unknown }) => {
  const context = {
    transport: "websocket",
    getWebSocketContext: () => ({ ws: { data: socket } }),
  } as unknown as SignalContext;
  await (await new AccountMiddleware().use(env))(context, async () => undefined);
  return socket.account as { me?: { id: string } };
};

const httpCall = async (headers: Record<string, string>) => {
  const req = new Request("https://app.example.com/api/user/me", { headers }) as Request & { account?: unknown };
  const context = { transport: "http", getHttpContext: () => ({ req }) } as unknown as SignalContext;
  await (await new AccountMiddleware().use(env))(context, async () => undefined);
  return req.account as { me?: { id: string } };
};
const tokenOf = async (sid: string) => (await accessToken(sid)).slice("Bearer ".length);

afterEach(() => {
  RevokedSessions.use(null);
  setSystemTime();
});

describe("AccountMiddleware", () => {
  test("verifies a socket's token once until it changes or lapses, and checks revocation on every frame", async () => {
    const resolve = spyOn(utilSrvkit, "resolveJwt");
    try {
      const socket = { headers: new Headers({ authorization: await accessToken("s1") }), cookies: new Bun.CookieMap() };
      expect((await frame(socket)).me?.id).toBe("s1");
      expect((await frame(socket)).me?.id).toBe("s1");
      expect(resolve).toHaveBeenCalledTimes(1);

      RevokedSessions.use(async (sid) => sid === "s1");
      expect((await frame(socket)).me).toBeUndefined();
      RevokedSessions.use(null);

      socket.headers.set("authorization", await accessToken("s2", dayjs().add(1, "minute")));
      expect((await frame(socket)).me?.id).toBe("s2");
      expect(resolve).toHaveBeenCalledTimes(2);
      setSystemTime(dayjs().add(2, "minute").toDate());
      expect((await frame(socket)).me).toBeUndefined();
      expect(resolve).toHaveBeenCalledTimes(3);
    } finally {
      resolve.mockRestore();
    }
  });

  test("an HTTP call takes the session cookie only when it arrives once", async () => {
    const key = authTokenKey();
    const mine = await tokenOf("mine");
    const planted = await tokenOf("planted");

    expect((await httpCall({ cookie: `${key}=${mine}` })).me?.id).toBe("mine");
    expect((await httpCall({ cookie: `${key}=${mine}; ${key}=${planted}` })).me).toBeUndefined();
    expect((await httpCall({ cookie: `${key}=${planted}; ${key}=${mine}` })).me).toBeUndefined();
    expect((await httpCall({ cookie: `jwt=${mine}` })).me).toBeUndefined();
  });

  test("a socket whose handshake sent the session cookie twice is anonymous until a frame carries a token", async () => {
    const key = authTokenKey();
    const cookie = `${key}=${await tokenOf("mine")}; ${key}=${await tokenOf("planted")}`;
    const socket: { headers: Headers; cookies: Bun.CookieMap; account?: unknown } = {
      headers: new Headers({ cookie }),
      cookies: new Bun.CookieMap(cookie),
    };
    const guarded = () =>
      new Every().canPass({ key: "guardedCall", get: () => socket.account ?? null } as unknown as SignalContext);

    expect((await frame(socket)).me).toBeUndefined();
    expect(guarded).toThrow(
      expect.objectContaining({ statusCode: 401, message: "shared.error.noAuthenticationAccount" }),
    );

    socket.headers.set("authorization", await accessToken("mine"));
    expect((await frame(socket)).me?.id).toBe("mine");
  });

  test("an Authorization header outranks the cookies, duplicated or not", async () => {
    const key = authTokenKey();
    const cookie = `${key}=${await tokenOf("planted")}; ${key}=${await tokenOf("other")}`;

    expect((await httpCall({ cookie, authorization: await accessToken("bearer") })).me?.id).toBe("bearer");
  });
});
