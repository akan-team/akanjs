import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import {
  RevokedSessions,
  refreshRotationGraceMs,
  rotateRefreshSession,
  type SecuritySignal,
  SigninClient,
  setSecuritySignalHook,
} from "@libs/shared/srvkit";
import { dayjs } from "akanjs/base";
import { CacheDatabase } from "akanjs/document";
import { ConformanceEnv } from "akanjs/test";

import * as cnst from "../cnst";
import type * as db from "../db";
import { UserModel } from "./user.document";
import { UserService } from "./user.service";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const cloudRotation = { graceMs: refreshRotationGraceMs, reuseRevokes: "lineage" } as const;
const user = {
  id: "u1",
  nickname: "cli",
  roles: ["user"],
  images: [],
  profileStatus: "prepare",
  status: "active",
} as unknown as db.User;
const refreshTokenOf = ({ refreshToken }: db.util.AccessToken) => {
  if (!refreshToken) throw new Error("answered without a refresh token");
  return refreshToken;
};

const serviceOn = (cache: CacheDatabase) => {
  const userModel = new UserModel();
  Object.defineProperty(userModel, "userCache", { value: cache });
  Object.defineProperty(userModel, "getActiveUser", { value: async () => user });
  const service = new UserService();
  Object.defineProperty(service, "userModel", { value: userModel });
  Object.defineProperty(service, "getUser", { value: async () => user });
  Object.defineProperty(service, "securityService", {
    value: {
      createRefreshToken: () => {
        const refreshToken = crypto.randomUUID();
        return {
          refreshToken,
          refreshTokenHash: `hash:${refreshToken}`,
          refreshTokenExpiresAt: dayjs().add(30, "day").toDate(),
        };
      },
      hashRefreshToken: (refreshToken: string) => `hash:${refreshToken}`,
      signAccessToken: async () => ({ jwt: "jwt", expiresAt: dayjs().add(1, "hour") }),
    },
  });
  return service;
};

for (const kind of ConformanceEnv.cacheKinds("user refresh token")) {
  describe(`UserService.refreshUserToken on the ${kind} cache`, () => {
    let opened: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let service: UserService;
    beforeEach(async () => {
      opened = await ConformanceEnv.openCache(kind);
      service = serviceOn(new CacheDatabase("user", opened.cache));
    });
    afterEach(async () => {
      setSystemTime();
      await opened.close();
    });

    test("without an option, a token presented again after its rotation signs the account out everywhere", async () => {
      const cli = refreshTokenOf(await service._issueUserToken(user));
      const browser = refreshTokenOf(await service._issueUserToken(user));
      const rotated = refreshTokenOf(await service.refreshUserToken(cli));
      await expect(service.refreshUserToken(cli)).rejects.toThrow("shared.error.refreshTokenReuseDetected");
      await expect(service.refreshUserToken(rotated)).rejects.toThrow("shared.error.revokedRefreshToken");
      await expect(service.refreshUserToken(browser)).rejects.toThrow("shared.error.revokedRefreshToken");
    });

    test("with the grace option, a token refreshed twice in a row gives both callers a live session", async () => {
      const cli = refreshTokenOf(await service._issueUserToken(user));
      const first = refreshTokenOf(await service.refreshUserToken(cli, undefined, cloudRotation));
      const second = refreshTokenOf(await service.refreshUserToken(cli, undefined, cloudRotation));
      expect(second).not.toBe(first);
      expect((await service.refreshUserToken(first, undefined, cloudRotation)).refreshToken).toBeTruthy();
      expect((await service.refreshUserToken(second, undefined, cloudRotation)).refreshToken).toBeTruthy();
    });

    test("past the window, the reuse revokes only that token's lineage and the other sessions live on", async () => {
      const cli = refreshTokenOf(await service._issueUserToken(user));
      const browser = refreshTokenOf(await service._issueUserToken(user));
      const rotated = refreshTokenOf(await service.refreshUserToken(cli, undefined, cloudRotation));
      setSystemTime(Date.now() + refreshRotationGraceMs + 1000);
      await expect(service.refreshUserToken(cli, undefined, cloudRotation)).rejects.toThrow(
        "shared.error.refreshTokenReuseDetected",
      );
      await expect(service.refreshUserToken(rotated, undefined, cloudRotation)).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      expect((await service.refreshUserToken(browser)).refreshToken).toBeTruthy();
    });

    test("an OAuth client's refresh token is refused as unknown, and still rotates for that client", async () => {
      const oauthToken = crypto.randomUUID();
      const issued = await service.userModel.createRefreshSession(
        user.id,
        `hash:${oauthToken}`,
        dayjs().add(30, "day").toDate(),
        "Claude Code",
        "dcr_claude",
      );
      await expect(service.refreshUserToken(oauthToken)).rejects.toThrow("shared.error.invalidRefreshToken");
      await expect(service.refreshUserToken(oauthToken, undefined, cloudRotation)).rejects.toThrow(
        "shared.error.invalidRefreshToken",
      );
      const rotated = await rotateRefreshSession(
        service.userModel.userCache,
        `hash:${oauthToken}`,
        "hash:next",
        dayjs().add(30, "day").toDate(),
        { clientId: "dcr_claude" },
      );
      expect(rotated.id).toBe(issued.id);
    });
  });

  describe(`UserService sign-in sessions on the ${kind} cache`, () => {
    const chromeOnMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
    let opened: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let service: UserService;
    let signals: SecuritySignal[];
    let revokedIds: Set<string>;
    const callerFrom = (ip: string, userAgent = chromeOnMac, origin?: string) => {
      const account = { appName: "shared", environment: "testing" };
      SigninClient.remember(account, new Headers({ "user-agent": userAgent, ...(origin ? { origin } : {}) }), ip);
      return account as never;
    };
    const signinFrom = async (ip: string, userAgent?: string, origin?: string) =>
      await service._issueUserToken(user, callerFrom(ip, userAgent, origin));
    const settle = async () => await new Promise((resolve) => setTimeout(resolve, 0));
    beforeEach(async () => {
      opened = await ConformanceEnv.openCache(kind);
      service = serviceOn(new CacheDatabase("user", opened.cache));
      Object.defineProperty(service.userModel, "keepDeviceTokens", { value: async () => true });
      signals = [];
      revokedIds = new Set();
      setSecuritySignalHook({ onSignal: (signal) => void signals.push(signal) });
      RevokedSessions.use(
        async (sessionId) => revokedIds.has(sessionId),
        async (sessionId) => void revokedIds.add(sessionId),
      );
    });
    afterEach(async () => {
      setSecuritySignalHook({});
      RevokedSessions.use(null);
      await opened.close();
    });

    test("records each sign-in's device and network, and tells a new device apart from a repeat", async () => {
      await service._issueUserToken(user, callerFrom("203.0.113.7"), undefined, { isSignup: true });
      await signinFrom("203.0.113.99");
      await signinFrom("198.51.100.4", undefined, "app://localhost");
      await settle();
      const sessions = await service.listSigninSessions(user.id);
      const devices = sessions.map(({ kind, network }) => ({ kind, network: network ?? "" }));
      expect(devices.sort((a, b) => a.network.localeCompare(b.network))).toEqual([
        { kind: "native", network: "198.51.100.0/24" },
        { kind: "browser", network: "203.0.113.0/24" },
        { kind: "browser", network: "203.0.113.0/24" },
      ]);
      expect(sessions.every((session) => session.userAgent === chromeOnMac && !!session.createdAt)).toBe(true);
      expect(JSON.stringify(sessions)).not.toContain("203.0.113.7");
      expect(signals).toEqual([
        expect.objectContaining({
          kind: "newDeviceSignin",
          subjectId: user.id,
          device: expect.objectContaining({ kind: "native", network: "198.51.100.0/24" }),
        }),
      ]);
    });

    test("never reads an operator's sign-in-as or a CLI approval's browser as the member's device", async () => {
      Object.defineProperty(service.userModel, "getUser", { value: async () => user });
      await service._issueUserToken(user, callerFrom("203.0.113.7"), undefined, { isSignup: true });
      await service.getAccessTokenByAdmin(user.id);
      await service._issueUserToken(user, callerFrom("203.0.113.7"), undefined, { kind: "cli" });
      await signinFrom("203.0.113.8");
      await settle();
      const sessions = await service.listSigninSessions(user.id);
      expect(sessions.map(({ kind }) => kind ?? "").sort((a, b) => a.localeCompare(b))).toEqual([
        "browser",
        "browser",
        "cli",
        "signinAs",
      ]);
      const cli = sessions.find(({ kind }) => kind === "cli");
      expect([cli?.userAgent, cli?.network]).toEqual([undefined, undefined]);
      expect(signals.map((signal) => signal.kind === "newDeviceSignin" && signal.device.kind)).toEqual(["cli"]);
    });

    test("an account whose live sessions predate device records reads no sign-in as new", async () => {
      await service.userModel.createRefreshSession(user.id, "hash:legacy", dayjs().add(30, "day").toDate());
      await signinFrom("192.0.2.1");
      await settle();
      expect(signals).toEqual([]);
    });

    test("a session from before device records takes the refreshing device's, so a later sign-in can read as new", async () => {
      await service.userModel.createRefreshSession(user.id, "hash:legacy", dayjs().add(30, "day").toDate());
      await service.refreshUserToken("legacy", callerFrom("203.0.113.7"));
      expect(await service.listSigninSessions(user.id)).toEqual([
        expect.objectContaining({ kind: "browser", userAgent: chromeOnMac, network: "203.0.113.0/24" }),
      ]);
      await signinFrom("203.0.113.9");
      await signinFrom("198.51.100.4", undefined, "app://localhost");
      await settle();
      expect(signals.map((signal) => signal.kind === "newDeviceSignin" && signal.device.kind)).toEqual(["native"]);
    });

    test("signs one session out with its access tokens, or every other one, keeping connected apps", async () => {
      const current = await signinFrom("203.0.113.7");
      const other = await signinFrom("198.51.100.4");
      await service.userModel.createRefreshSession(user.id, "hash:legacy", dayjs().add(30, "day").toDate());
      const app = await service.userModel.createRefreshSession(
        user.id,
        "hash:app",
        dayjs().add(30, "day").toDate(),
        "Claude Code",
        "dcr_claude",
      );
      const idOf = async (refreshToken: string) =>
        (await service.listSigninSessions(user.id)).find(
          (session) => session.refreshTokenHash === `hash:${refreshToken}`,
        )?.id ?? "";
      const [currentId, otherId, legacyId] = [
        await idOf(refreshTokenOf(current)),
        await idOf(refreshTokenOf(other)),
        await idOf("legacy"),
      ];
      const byId = (a: string, b: string) => a.localeCompare(b);
      expect((await service.listSigninSessions(user.id)).map(({ id }) => id).sort(byId)).toEqual(
        [currentId, otherId, legacyId].sort(byId),
      );
      expect(await service.revokeSigninSession(user.id, legacyId)).toBe(true);
      expect(await service.revokeSigninSession(user.id, legacyId)).toBe(false);
      expect(await service.revokeSigninSession(user.id, app.id)).toBe(false);
      expect(await service.revokeSigninSession("u2", otherId)).toBe(false);
      expect(await RevokedSessions.has(legacyId)).toBe(true);
      expect(await RevokedSessions.has(otherId)).toBe(false);
      expect(await service.revokeOtherSigninSessions(user.id, currentId)).toBe(1);
      expect(await RevokedSessions.has(otherId)).toBe(true);
      await expect(service.refreshUserToken(refreshTokenOf(other))).rejects.toThrow("shared.error.revokedRefreshToken");
      expect((await service.listSigninSessions(user.id)).map(({ id }) => id)).toEqual([currentId]);
      expect(await RevokedSessions.has(currentId)).toBe(false);
      expect(await RevokedSessions.has(app.id)).toBe(false);
      const renewed = await service.refreshUserToken(refreshTokenOf(current));
      const [head] = await service.listSigninSessions(user.id);
      expect(head).toMatchObject({ id: currentId, refreshTokenHash: `hash:${refreshTokenOf(renewed)}` });
      expect(head?.lastUsedAt).toBeTruthy();
    });
  });
}

describe("UserService push devices", () => {
  const deviceOf = (token: string, deviceId?: string, sessionId?: string): db.DeviceToken => ({
    token,
    provider: "apns",
    platform: "ios",
    deviceId,
    sessionId,
    updatedAt: dayjs(),
  });
  //? A row stored in memory the way the table stores it: `pickById` answers what the last `updateOne` wrote.
  const pushServiceOn = (stored: unknown[], others: { [userId: string]: unknown[] } = {}) => {
    const rows = new Map<string, unknown>(
      [[user.id, stored] as const, ...Object.entries(others)].map(([id, deviceTokens]) => [
        id,
        { setting: "normal", deviceTokens },
      ]),
    );
    const notiInfoOf = (id: string) => new cnst.NotiInfo().set(rows.get(id) as cnst.NotiInfo);
    const writes: string[] = [];
    const userModel = new UserModel();
    Object.defineProperty(userModel, "User", {
      value: {
        pickById: async () => ({ notiInfo: notiInfoOf(user.id) }),
        updateOne: async (_query: unknown, update: { notiInfo: unknown }) => {
          rows.set(user.id, JSON.parse(JSON.stringify(update.notiInfo)));
          writes.push("updateOne");
          return { modifiedCount: 1 };
        },
        find: async (query: { id: { oneOf: string[] } }) =>
          query.id.oneOf.map((id) => ({ id, notiInfo: notiInfoOf(id) })),
        bulkWrite: async (operations: { updateOne: { filter: { id: string }; update: { notiInfo: unknown } } }[]) => {
          for (const { updateOne } of operations)
            rows.set(updateOne.filter.id, JSON.parse(JSON.stringify(updateOne.update.notiInfo)));
          writes.push("bulkWrite");
        },
      },
    });
    Object.defineProperty(userModel, "revokeRefreshSession", { value: async () => true });
    const locks = new Map<string, string>();
    Object.defineProperty(userModel, "userCache", {
      value: {
        setIfAbsent: async (_topic: string, key: string, value: string) => {
          if (locks.has(key)) return false;
          locks.set(key, value);
          return true;
        },
        get: async (_topic: string, key: string) => locks.get(key),
        delete: async (_topic: string, key: string) => {
          locks.delete(key);
        },
      },
    });
    const service = new UserService();
    Object.defineProperty(service, "userModel", { value: userModel });
    Object.defineProperty(service, "getUser", { value: async () => user });
    const tokensOf = async () => ((await userModel.getNotiInfo(user.id))?.deviceTokens ?? []).map((each) => each.token);
    const tokensOfUser = (id: string) =>
      ((rows.get(id) as cnst.NotiInfo | undefined)?.deviceTokens ?? []).map((each) => each.token);
    return { service, tokensOf, tokensOfUser, writes };
  };

  test("a new token from the same installation replaces the one it had", async () => {
    const { service, tokensOf } = pushServiceOn([deviceOf("old", "phone"), deviceOf("tablet-token", "tablet")]);
    await service.addNotiDeviceTokenOfUser(user.id, deviceOf("new", "phone"));
    expect(await tokensOf()).toEqual(["tablet-token", "new"]);
  });

  test("two devices registering at once both stay registered", async () => {
    const { service, tokensOf } = pushServiceOn([]);
    await Promise.all([
      service.addNotiDeviceTokenOfUser(user.id, deviceOf("phone-token", "phone")),
      service.addNotiDeviceTokenOfUser(user.id, deviceOf("tablet-token", "tablet")),
    ]);
    expect((await tokensOf()).sort()).toEqual(["phone-token", "tablet-token"]);
  });

  test("a stored token with no provider, from before tokens carried one, is dropped on read", async () => {
    const { tokensOf } = pushServiceOn(["legacy-string", deviceOf("routable", "phone")]);
    expect(await tokensOf()).toEqual(["routable"]);
  });

  test("signing out removes this installation's token and keeps the account's other devices", async () => {
    const { service, tokensOf } = pushServiceOn([deviceOf("phone-token", "phone"), deviceOf("tablet-token", "tablet")]);
    await service.signoutUser({ self: { id: user.id } } as never, "phone");
    expect(await tokensOf()).toEqual(["tablet-token"]);
  });

  test("a token is filed under the session that registered it, whatever session the client names", async () => {
    const { service } = pushServiceOn([]);
    const account = { self: { id: user.id }, sid: "s-token", selfSid: "s-self" } as never;
    await service.addNotiDeviceTokenOfUser(user.id, deviceOf("phone-token", "phone", "s-forged"), account);
    await service.addNotiDeviceTokenOfUser(user.id, deviceOf("tablet-token", "tablet", "s-forged"));
    const stored = (await service.userModel.getNotiInfo(user.id))?.deviceTokens ?? [];
    expect(stored.map(({ token, sessionId }) => [token, sessionId ?? null])).toEqual([
      ["phone-token", "s-self"],
      ["tablet-token", null],
    ]);
  });

  test("signing a session out remotely drops the push tokens it registered", async () => {
    const { service, tokensOf } = pushServiceOn([
      deviceOf("stolen", "attacker", "s-stolen"),
      deviceOf("own", "phone", "s-own"),
      deviceOf("unlabelled", "tablet"),
    ]);
    const expiresAt = dayjs().add(1, "day").toISOString();
    Object.defineProperty(service.userModel, "listRefreshSessions", {
      value: async () => [
        { id: "s-stolen", expiresAt },
        { id: "s-own", expiresAt },
      ],
    });
    expect(await service.revokeSigninSession(user.id, "s-stolen")).toBe(true);
    expect(await tokensOf()).toEqual(["own", "unlabelled"]);
  });

  test("signing out everywhere else keeps this session's tokens and this installation's unlabelled one", async () => {
    const devices = [
      deviceOf("stolen", "attacker", "s-stolen"),
      deviceOf("own", "phone", "s-own"),
      deviceOf("own-unlabelled", "browser"),
      deviceOf("other-unlabelled", "tablet"),
      deviceOf("stale", "laptop", "s-expired"),
    ];
    for (const [pushDeviceId, kept] of [
      ["browser", ["own", "own-unlabelled"]],
      [null, ["own"]],
    ] as const) {
      const { service, tokensOf } = pushServiceOn(devices);
      Object.defineProperty(service.userModel, "revokeRefreshSessionsBut", { value: async () => ["s-stolen"] });
      expect(await service.revokeOtherSigninSessions(user.id, "s-own", pushDeviceId)).toBe(1);
      expect(await tokensOf()).toEqual([...kept]);
    }
  });

  test("dead tokens of several owners leave in one write, each owner keeping its live devices", async () => {
    const { service, tokensOfUser, writes } = pushServiceOn(
      [deviceOf("dead-1", "phone"), deviceOf("live-1", "tablet")],
      {
        u2: [deviceOf("dead-2", "phone"), deviceOf("dead-3", "tablet")],
      },
    );
    await service.subNotiDeviceTokensOfUsers(
      new Map([
        [user.id, ["dead-1"]],
        ["u2", ["dead-2", "dead-3"]],
      ]),
    );
    expect(tokensOfUser(user.id)).toEqual(["live-1"]);
    expect(tokensOfUser("u2")).toEqual([]);
    expect(writes).toEqual(["bulkWrite"]);
  });
});

describe("UserService email checks", () => {
  const serviceWith = ({
    verifies = ["email"],
    accountId = "ann@client.example.com",
    verifiedEmails = [],
  }: {
    verifies?: string[];
    accountId?: string | null;
    verifiedEmails?: string[];
  }) => {
    const userModel = new UserModel();
    Object.defineProperty(userModel, "getAccountId", { value: async () => accountId });
    Object.defineProperty(userModel, "getVerifiedEmails", { value: async () => verifiedEmails });
    const service = new UserService();
    Object.defineProperty(service, "userModel", { value: userModel });
    Object.defineProperty(service, "getUser", { value: async () => ({ ...user, verifies }) });
    return { service };
  };

  test("only an address an email-proving verify vouches for counts as verified", async () => {
    expect(await serviceWith({ verifies: ["email"] }).service.listVerifiedEmails(user.id)).toEqual([
      "ann@client.example.com",
    ]);
    expect(await serviceWith({ verifies: ["phone", "google"] }).service.listVerifiedEmails(user.id)).toEqual([
      "ann@client.example.com",
    ]);
    expect(await serviceWith({ verifies: ["phone", "password"] }).service.listVerifiedEmails(user.id)).toEqual([]);
    expect(await serviceWith({ verifies: [] }).service.listVerifiedEmails(user.id)).toEqual([]);
    expect(
      await serviceWith({ verifies: ["github"], accountId: "github:12345" }).service.listVerifiedEmails(user.id),
    ).toEqual([]);
    expect(await serviceWith({ verifies: ["email"], accountId: null }).service.listVerifiedEmails(user.id)).toEqual([]);
  });

  test("lists an address proven after sign-up beside the account ID, once each", async () => {
    const proven = ["bob@client.example.com", "ann@client.example.com"];
    expect(
      await serviceWith({ verifies: ["email"], verifiedEmails: proven }).service.listVerifiedEmails(user.id),
    ).toEqual(["ann@client.example.com", "bob@client.example.com"]);
    expect(
      await serviceWith({ verifies: ["phone"], accountId: null, verifiedEmails: proven }).service.listVerifiedEmails(
        user.id,
      ),
    ).toEqual(proven);
  });
});

describe("UserService admin identity carried on a user sign-in", () => {
  afterEach(() => RevokedSessions.use(null));

  test("carries no admin identity when the revocation check cannot answer", async () => {
    const service = new UserService();
    let looked = false;
    Object.defineProperty(service, "adminService", {
      value: {
        findMe: async () => {
          looked = true;
          return { id: "a1" };
        },
      },
    });
    const account = { me: { id: "a1" }, meSid: "s1" } as unknown as Parameters<UserService["_carryAdminIdentity"]>[0];
    RevokedSessions.use(async () => {
      throw new Error("cache unreachable");
    });
    expect(await service._carryAdminIdentity(account)).toEqual({});
    expect(looked).toBe(false);
    RevokedSessions.use(async () => false);
    expect((await service._carryAdminIdentity(account)).meSid).toBe("s1");
  });
});

describe("UserService.renewPageSession", () => {
  const jwtOf = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  const adminToken = { jwt: jwtOf({ me: { id: "a1" }, meSid: "s-admin" }), refreshToken: "next-admin" };
  const userToken = { jwt: jwtOf({ self: { id: "u1" } }), refreshToken: "next-user" };
  const serviceWith = (answers: { admin?: object | Error; user?: object | Error }) => {
    const service = new UserService();
    const calls: unknown[][] = [];
    const answer = (kind: "admin" | "user", args: unknown[]) => {
      calls.push([kind, ...args]);
      const answered = answers[kind];
      if (answered instanceof Error) throw answered;
      return answered;
    };
    Object.defineProperty(service, "logger", { value: { verbose: () => undefined } });
    Object.defineProperty(service, "adminService", {
      value: { refreshAdminToken: async (...args: unknown[]) => answer("admin", args) },
    });
    Object.defineProperty(service, "refreshUserToken", { value: async (...args: unknown[]) => answer("user", args) });
    return { service, calls };
  };

  test("renews the admin identity first and hands it to the user renewal, each on its own refresh token", async () => {
    const { service, calls } = serviceWith({ admin: adminToken, user: userToken });
    const renewed = await service.renewPageSession({ user: "held-user", admin: "held-admin" });
    expect(renewed).toEqual({ jwt: userToken.jwt, refreshTokens: { user: "next-user", admin: "next-admin" } });
    expect(calls).toEqual([
      ["admin", "held-admin", undefined, undefined, { graceMs: expect.any(Number) }],
      ["user", "held-user", { me: { id: "a1" }, meSid: "s-admin" }, { graceMs: expect.any(Number) }],
    ]);
  });

  test("renews the one identity whose refresh token the page load carries", async () => {
    const onlyUser = serviceWith({ admin: adminToken, user: userToken });
    expect(await onlyUser.service.renewPageSession({ user: "held-user" })).toEqual({
      jwt: userToken.jwt,
      refreshTokens: { user: "next-user" },
    });
    expect(onlyUser.calls).toEqual([["user", "held-user", undefined, { graceMs: expect.any(Number) }]]);
    const onlyAdmin = serviceWith({ admin: adminToken, user: userToken });
    expect(await onlyAdmin.service.renewPageSession({ admin: "held-admin" })).toEqual({
      jwt: adminToken.jwt,
      refreshTokens: { admin: "next-admin" },
    });
  });

  test("keeps the identity that renewed when the other's refresh token is refused, and answers none when both are", async () => {
    const refused = new Error("shared.error.expiredRefreshToken");
    const adminOnly = serviceWith({ admin: adminToken, user: refused });
    expect(await adminOnly.service.renewPageSession({ user: "held-user", admin: "held-admin" })).toEqual({
      jwt: adminToken.jwt,
      refreshTokens: { admin: "next-admin" },
    });
    const userOnly = serviceWith({ admin: refused, user: userToken });
    expect(await userOnly.service.renewPageSession({ user: "held-user", admin: "held-admin" })).toEqual({
      jwt: userToken.jwt,
      refreshTokens: { user: "next-user" },
    });
    expect(userOnly.calls[1]).toEqual(["user", "held-user", undefined, { graceMs: expect.any(Number) }]);
    const neither = serviceWith({ admin: refused, user: refused });
    expect(await neither.service.renewPageSession({ user: "held-user", admin: "held-admin" })).toBeNull();
  });
});
