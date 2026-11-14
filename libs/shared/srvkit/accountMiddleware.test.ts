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

const oauthCall = async (
  clientId: string,
  signalOption: { mcp?: boolean | "agent"; guards?: unknown[] },
  { origin = "http", key = "x", callEnv = env }: { origin?: string; key?: string; callEnv?: ModulesOptions } = {},
) => {
  const { appName, environment } = getEnv();
  const jwt = await utilSrvkit.jwtSign(
    { appName, environment, tokenType: "access", sid: "s", self: { id: "u" }, aud: "x/mcp", client_id: clientId },
    jwtSecret,
    { expiresAt: dayjs().add(1, "hour") },
  );
  const req = new Request(`https://app.example.com/api/${key}`, { headers: { authorization: `Bearer ${jwt}` } });
  const context = {
    transport: "http",
    origin,
    key,
    endpointInfo: { signalOption },
    getHttpContext: () => ({ req }),
  } as unknown as SignalContext;
  await (await new AccountMiddleware().use(callEnv))(context, async () => undefined);
  return (req as Request & { account?: { self?: { id: string } } }).account;
};
const offShelfRefusal = expect.objectContaining({ statusCode: 403, message: "shared.error.agentTokenNotAllowed" });

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

  test("an OAuth client's token is refused off the MCP shelf, and a token an app mints for itself is not", async () => {
    await expect(oauthCall("dcr_client", { mcp: false })).rejects.toEqual(offShelfRefusal);
    await expect(oauthCall("https://client.example.com/meta.json", { mcp: false })).rejects.toEqual(offShelfRefusal);
    await expect(oauthCall("dcr_client", { mcp: "agent" })).rejects.toEqual(offShelfRefusal);
    expect((await oauthCall("dcr_client", {}))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", { mcp: true }))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", { mcp: "agent" }, { origin: "mcp" }))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", { mcp: false }, { origin: "mcp" }))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", { mcp: false, guards: [{ agents: false }] }))?.self?.id).toBe("u");
    expect((await oauthCall("app-own-runner", { mcp: false }))?.self?.id).toBe("u");
  });

  test("an endpoint an app names in offShelfEndpoints refuses an OAuth client's token like an mcp: false one", async () => {
    const excluding = { ...env, offShelfEndpoints: ["createAgentSession"] } as ModulesOptions;
    const at = (key: string, origin = "http") => ({ key, origin, callEnv: excluding });
    await expect(oauthCall("dcr_client", {}, at("createAgentSession"))).rejects.toEqual(offShelfRefusal);
    expect((await oauthCall("dcr_client", {}, at("ticketListInProject")))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", {}, at("createAgentSession", "mcp")))?.self?.id).toBe("u");
    expect((await oauthCall("akan-runner", {}, at("createAgentSession")))?.self?.id).toBe("u");
    expect((await oauthCall("dcr_client", { guards: [{ agents: false }] }, at("createAgentSession")))?.self?.id).toBe(
      "u",
    );
    expect((await oauthCall("dcr_client", {}, { key: "createAgentSession" }))?.self?.id).toBe("u");
  });

  test("a revocation check that fails drops an admin identity and keeps a user's", async () => {
    const { appName, environment } = getEnv();
    const signed = async (claims: Record<string, unknown>) =>
      `Bearer ${await utilSrvkit.jwtSign({ appName, environment, tokenType: "access", ...claims }, jwtSecret, {
        expiresAt: dayjs().add(1, "hour"),
      })}`;
    RevokedSessions.use(async () => {
      throw new Error("cache unreachable");
    });
    try {
      const both = (await httpCall({
        authorization: await signed({ self: { id: "u" }, selfSid: "s1", me: { id: "a" }, meSid: "s2" }),
      })) as { self?: { id: string }; me?: { id: string } };
      expect(both.self?.id).toBe("u");
      expect(both.me).toBeUndefined();
      expect((await httpCall({ authorization: await accessToken("legacy-admin") })).me).toBeUndefined();
      const user = (await httpCall({ authorization: await signed({ sid: "s3", self: { id: "u" } }) })) as {
        self?: { id: string };
      };
      expect(user.self?.id).toBe("u");
    } finally {
      RevokedSessions.use(null);
    }
  });
});
