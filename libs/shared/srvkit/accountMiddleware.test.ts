import { afterEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import * as utilSrvkit from "@libs/util/srvkit";
import { dayjs, getEnv } from "akanjs/base";
import type { SignalContext } from "akanjs/signal";
import type { ModulesOptions } from "../lib/option";
import { AccountMiddleware } from "./accountMiddleware";
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
});
