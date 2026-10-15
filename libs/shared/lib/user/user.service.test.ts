import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { type NativeSsoResult, refreshRotationGraceMs } from "@libs/shared/srvkit";
import { createOpaqueToken } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import { CacheDatabase } from "akanjs/document";
import { OAuthPkce } from "akanjs/server";
import { ConformanceEnv } from "akanjs/test";

import * as cnst from "../cnst";
import type * as db from "../db";
import { UserModel } from "./user.document";
import { UserService } from "./user.service";

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
  const pushServiceOn = (stored: unknown[]) => {
    let notiInfo: unknown = { setting: "normal", deviceTokens: stored };
    const userModel = new UserModel();
    Object.defineProperty(userModel, "User", {
      value: {
        pickById: async () => ({ notiInfo: new cnst.NotiInfo().set(notiInfo as cnst.NotiInfo) }),
        updateOne: async (_query: unknown, update: { notiInfo: unknown }) => {
          notiInfo = JSON.parse(JSON.stringify(update.notiInfo));
          return { modifiedCount: 1 };
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
    return { service, tokensOf };
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
});

describe("UserService native SSO handoff", () => {
  const prepareUserId = "65f0c0ffee0123456789abcd";
  const memoryMap = () => {
    const map = new Map<string, cnst.SsoHandoff>();
    return {
      set: async (key: string, value: cnst.SsoHandoff) => {
        map.set(key, value);
      },
      getDel: async (key: string) => {
        const value = map.get(key);
        map.delete(key);
        return value;
      },
    };
  };
  const nativeServiceOn = ({ knownAccountId }: { knownAccountId?: string } = {}) => {
    const prepared: { accountId?: string; nickname?: string } = {};
    const userModel = new UserModel();
    Object.defineProperty(userModel, "findIdByAccountId", {
      value: async (accountId: string) => (accountId === knownAccountId ? user.id : null),
    });
    Object.defineProperty(userModel, "getActiveUserBySso", { value: async () => user });
    Object.defineProperty(userModel, "createPrepareUser", {
      value: async () => ({ id: prepareUserId, nickname: "" }),
    });
    Object.defineProperty(userModel, "getPrepareUser", {
      value: async () => ({ id: prepareUserId, nickname: "" }),
    });
    Object.defineProperty(userModel, "setSsoInPrepareUser", {
      value: async (_userId: string, accountId: string) => {
        prepared.accountId = accountId;
      },
    });
    Object.defineProperty(userModel, "makeUniqueNickname", { value: async (nickname: string) => nickname });
    Object.defineProperty(userModel, "setNickname", {
      value: async (_userId: string, nickname: string) => {
        prepared.nickname = nickname;
      },
    });
    const service = new UserService();
    Object.defineProperty(service, "userModel", { value: userModel });
    Object.defineProperty(service, "issueSignupToken", { value: async () => "signup-token" });
    Object.defineProperty(service, "summaryService", { value: { incValue: async () => true } });
    Object.defineProperty(service, "nativeSsoPolicy", { value: { callbackSchemes: ["angelo"] } });
    Object.defineProperty(service, "ssoStarts", { value: memoryMap() });
    Object.defineProperty(service, "ssoCodes", { value: memoryMap() });
    Object.defineProperty(service, "_issueUserToken", { value: async () => ({ jwt: "jwt", refreshToken: "refresh" }) });
    return { service, prepared };
  };
  const startOf = (verifier: string) => ({
    callbackScheme: "angelo",
    codeChallenge: OAuthPkce.challengeOf(verifier),
    nonce: "app-nonce",
    origin: "https://office.akanjs.com",
    lang: "ko",
    returnPage: true,
  });
  const handOff = async (service: UserService, verifier: string, accountId = "ann@example.com") => {
    const state = await service.startNativeSso("google", startOf(verifier));
    const start = await service.takeNativeSso(state);
    if (!start) throw new Error("the start was not stored");
    return await service.handOffNativeSso(start, async () => ({ accountId, nickname: "Ann" }));
  };
  const codeOf = (result: NativeSsoResult) => ("code" in result ? result.code : "");

  test("a callback scheme outside the allowed list is refused", async () => {
    const { service } = nativeServiceOn();
    const start = { ...startOf(createOpaqueToken()), callbackScheme: "otherapp" };
    await expect(service.startNativeSso("google", start)).rejects.toThrow();
  });

  test("the start is consumed by the first callback that names its state", async () => {
    const { service } = nativeServiceOn();
    const state = await service.startNativeSso("google", startOf(createOpaqueToken()));
    expect(await service.takeNativeSso(state)).not.toBeNull();
    expect(await service.takeNativeSso(state)).toBeNull();
  });

  test("the provider's answer becomes a one-time code, never a token", async () => {
    const { service } = nativeServiceOn({ knownAccountId: "ann@example.com" });
    const result = await handOff(service, createOpaqueToken());
    expect(Object.keys(result)).toEqual(["code"]);
    expect(codeOf(result)).not.toBe("");
  });

  test("the start keeps what the browser's last page needs", async () => {
    const { service } = nativeServiceOn();
    const start = await service.takeNativeSso(await service.startNativeSso("google", startOf(createOpaqueToken())));
    expect(start?.lang).toBe("ko");
    expect(start?.returnPage).toBe(true);
  });

  test("a known account exchanges the code and its verifier for a session, once", async () => {
    const { service } = nativeServiceOn({ knownAccountId: "ann@example.com" });
    const verifier = createOpaqueToken();
    const code = codeOf(await handOff(service, verifier));
    const signin = await service.exchangeNativeSsoCode(code, verifier);
    expect(signin.jwt).toBe("jwt");
    expect(signin.refreshToken).toBe("refresh");
    expect(signin.prepareUserId).toBeFalsy();
    await expect(service.exchangeNativeSsoCode(code, verifier)).rejects.toThrow();
  });

  test("a wrong verifier spends the code, so the right one cannot follow", async () => {
    const { service } = nativeServiceOn({ knownAccountId: "ann@example.com" });
    const verifier = createOpaqueToken();
    const code = codeOf(await handOff(service, verifier));
    await expect(service.exchangeNativeSsoCode(code, createOpaqueToken())).rejects.toThrow();
    await expect(service.exchangeNativeSsoCode(code, verifier)).rejects.toThrow();
  });

  test("a new account comes back as a prepare user named after the provider profile", async () => {
    const { service, prepared } = nativeServiceOn();
    const verifier = createOpaqueToken();
    const signin = await service.exchangeNativeSsoCode(codeOf(await handOff(service, verifier)), verifier);
    expect(signin.prepareUserId).toBe(prepareUserId);
    expect(signin.signupToken).toBeTruthy();
    expect(signin.jwt).toBeFalsy();
    expect(prepared).toEqual({ accountId: "ann@example.com", nickname: "Ann" });
  });

  test("a provider failure returns to the app as an error, not a code", async () => {
    const { service } = nativeServiceOn();
    const state = await service.startNativeSso("google", startOf(createOpaqueToken()));
    const start = await service.takeNativeSso(state);
    if (!start) throw new Error("the start was not stored");
    const result = await service.handOffNativeSso(start, async () => {
      throw new Error("access_denied");
    });
    expect(result).toEqual({ error: "access_denied" });
  });
});
