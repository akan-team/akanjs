import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { RevokedSessions, refreshRotationGraceMs, rotateRefreshSession } from "@libs/shared/srvkit";
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
      signAccessToken: async () => ({ jwt: "jwt", expiresAt: dayjs().add(7, "day") }),
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
}

describe("UserService push devices", () => {
  const deviceOf = (token: string, deviceId?: string): db.DeviceToken => ({
    token,
    provider: "apns",
    platform: "ios",
    deviceId,
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
