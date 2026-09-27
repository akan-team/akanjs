import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { refreshRotationGraceMs } from "@libs/shared/srvkit";
import { dayjs } from "akanjs/base";
import { CacheDatabase } from "akanjs/document";
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
