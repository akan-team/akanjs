import { describe, expect, spyOn, test } from "bun:test";
import type { NativeSsoResult } from "@libs/shared/srvkit";
import { createOpaqueToken } from "@libs/util/srvkit";
import * as base from "akanjs/base";
import { OAuthPkce } from "akanjs/server";

import type * as cnst from "../cnst";
import type * as db from "../db";
import { UserModel } from "../user/user.document";
import { UserService } from "../user/user.service";
import { SignService } from "./sign.service";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const user = {
  id: "u1",
  nickname: "cli",
  roles: ["user"],
  images: [],
  profileStatus: "prepare",
  status: "active",
} as unknown as db.User;

const signServiceOf = (userModel: UserModel, userService = new UserService()) => {
  Object.defineProperty(userService, "userModel", { value: userModel });
  const service = new SignService();
  Object.defineProperty(service, "userService", { value: userService });
  return service;
};

describe("SignService native SSO handoff", () => {
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
  const nativeServiceOn = ({
    knownAccountId,
    resignupDays = 0,
  }: {
    knownAccountId?: string;
    resignupDays?: number;
  } = {}) => {
    const prepared: { accountId?: string; nickname?: string } = {};
    const checkedResignupDays: number[] = [];
    const prepareUser = {
      id: prepareUserId,
      nickname: "",
      rename(nickname: string) {
        prepared.nickname = nickname;
        return this;
      },
      save: async () => prepareUser,
    };
    const userModel = new UserModel();
    Object.defineProperty(userModel, "findIdByAccountId", {
      value: async (accountId: string) => (accountId === knownAccountId ? user.id : null),
    });
    Object.defineProperty(userModel, "pickByAccountId", { value: async () => ({ id: user.id, verifies: ["google"] }) });
    Object.defineProperty(userModel, "getUser", { value: async () => user });
    Object.defineProperty(userModel, "createPrepareUser", { value: async () => prepareUser });
    Object.defineProperty(userModel, "getPrepareUser", { value: async () => prepareUser });
    Object.defineProperty(userModel, "setSsoInPrepareUser", {
      value: async (_userId: string, accountId: string, _ssoType: string, days = 0) => {
        prepared.accountId = accountId;
        checkedResignupDays.push(days);
      },
    });
    Object.defineProperty(userModel, "makeUniqueNickname", { value: async (nickname: string) => nickname });
    const userService = new UserService();
    Object.defineProperty(userService, "issueSignupToken", { value: async () => "signup-token" });
    Object.defineProperty(userService, "summaryService", { value: { incValue: async () => true } });
    Object.defineProperty(userService, "_issueUserToken", {
      value: async () => ({ jwt: "jwt", refreshToken: "refresh" }),
    });
    const service = signServiceOf(userModel, userService);
    Object.defineProperty(service, "nativeSsoPolicy", { value: { callbackSchemes: ["angelo"] } });
    Object.defineProperty(service, "ssoStarts", { value: memoryMap() });
    Object.defineProperty(service, "ssoCodes", { value: memoryMap() });
    Object.defineProperty(service, "settingService", { value: { getActiveSetting: async () => ({ resignupDays }) } });
    return { service, prepared, checkedResignupDays };
  };
  const startOf = (verifier: string) => ({
    callbackScheme: "angelo",
    codeChallenge: OAuthPkce.challengeOf(verifier),
    nonce: "app-nonce",
    origin: "https://office.akanjs.com",
    lang: "ko",
    returnPage: true,
  });
  const handOff = async (service: SignService, verifier: string, accountId = "ann@example.com") => {
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

  test("a new account waits out the re-signup days, like an email or phone sign-up", async () => {
    const { service, checkedResignupDays } = nativeServiceOn({ resignupDays: 7 });
    const verifier = createOpaqueToken();
    await service.exchangeNativeSsoCode(codeOf(await handOff(service, verifier)), verifier);
    expect(checkedResignupDays).toEqual([7]);
  });

  test("a web sign-up hands its token over under the `__Host-` name outside local", async () => {
    const { service } = nativeServiceOn();
    const ssoCookie = { ssoFor: "user", signinRedirect: "/", signupRedirect: "/signup" } as const;
    const env = base.getEnv();
    const getEnv = spyOn(base, "getEnv").mockReturnValue({ ...env, operationMode: "cloud" });
    try {
      const cloud = await service.handleSsoCallback(
        { accountId: "new@example.com", nickname: "New" },
        "google",
        ssoCookie,
      );
      getEnv.mockReturnValue({ ...env, operationMode: "local" });
      const local = await service.handleSsoCallback(
        { accountId: "new@example.com", nickname: "New" },
        "google",
        ssoCookie,
      );
      expect(cloud.cookie).toEqual({ "__Host-signupToken": "signup-token" });
      expect(local.cookie).toEqual({ signupToken: "signup-token" });
    } finally {
      getEnv.mockRestore();
    }
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

describe("SignService email codes", () => {
  const serviceWith = ({ isSent = true }: { isSent?: boolean }) => {
    const sentTo: string[] = [];
    const userModel = new UserModel();
    Object.defineProperty(userModel, "getAccountId", { value: async () => "ann@client.example.com" });
    Object.defineProperty(userModel, "signChallenge", { value: { registerEmailCode: async () => undefined } });
    Object.defineProperty(userModel, "findIdByAccountId", { value: async () => user.id });
    const userService = new UserService();
    Object.defineProperty(userService, "getPrepareUser", { value: async () => ({ ...user, status: "prepare" }) });
    const service = signServiceOf(userModel, userService);
    Object.defineProperty(service, "masterEmailCode", { value: undefined });
    Object.defineProperty(service, "host", { value: "svc.test" });
    Object.defineProperty(service, "emailApi", {
      value: {
        sendVerificationCodeMail: async (to: string) => {
          sentTo.push(to);
          return isSent;
        },
      },
    });
    return { service, sentTo };
  };

  test("a signup code whose mail failed answers the failure", async () => {
    const { service, sentTo } = serviceWith({ isSent: false });
    await expect(service.requestEmailCodeInPrepareUser(user.id)).rejects.toThrow("user.error.emailCodeMailFailed");
    expect(sentTo).toEqual(["ann@client.example.com"]);
    await expect(serviceWith({ isSent: true }).service.requestEmailCodeInPrepareUser(user.id)).resolves.toBeUndefined();
  });

  test("a password-reset code answers the same whether or not its mail left", async () => {
    const { service, sentTo } = serviceWith({ isSent: false });
    await expect(service.requestEmailCodeForResetPassword("ann@client.example.com")).resolves.toBeUndefined();
    expect(sentTo).toEqual(["ann@client.example.com"]);
  });
});

describe("SignService password sign-in", () => {
  const serviceFindingAccount = (stored: { id: string; password?: string } | null) => {
    const failed: string[] = [];
    const userModel = new UserModel();
    Object.defineProperty(userModel, "findIdByAccountId", { value: async () => null });
    Object.defineProperty(userModel, "findByAccountId", { value: async () => stored });
    Object.defineProperty(userModel, "signChallenge", {
      value: {
        isSigninLocked: async () => false,
        failSignin: async (accountId: string) => {
          failed.push(accountId);
        },
      },
    });
    return { service: signServiceOf(userModel), failed };
  };

  test("an unknown account and one without a password each still pay for one bcrypt verify", async () => {
    for (const stored of [null, { id: user.id }]) {
      const { service, failed } = serviceFindingAccount(stored);
      const verify = spyOn(Bun.password, "verify");
      try {
        await expect(service.signinWithPassword("ann@client.example.com", "guess", {} as never)).rejects.toThrow(
          "user.error.invalidCredentials",
        );
        expect(verify).toHaveBeenCalledTimes(1);
      } finally {
        verify.mockRestore();
      }
      expect(failed).toEqual(["ann@client.example.com"]);
    }
  });
});

describe("SignService master phones", () => {
  const phone = "010-9999-0005";
  const masterPhoneCode = String(1_000_000 + Math.floor(Math.random() * 9_000_000));
  const serviceTexting = () => {
    const registered: string[] = [];
    const texted: string[] = [];
    const userModel = new UserModel();
    Object.defineProperty(userModel, "findIdByPhone", { value: async () => user.id });
    Object.defineProperty(userModel, "getUser", { value: async () => user });
    Object.defineProperty(userModel, "signChallenge", {
      value: {
        takeSendSlot: async () => true,
        registerPhoneCode: async (_userId: string, _phone: string, _purpose: string, phoneCode: string) => {
          registered.push(phoneCode);
        },
      },
    });
    const service = signServiceOf(userModel);
    Object.defineProperty(service, "masterPhones", { value: [phone] });
    Object.defineProperty(service, "masterPhoneCode", { value: masterPhoneCode });
    Object.defineProperty(service, "purpleApi", {
      value: {
        sendPhoneCode: async (to: string) => {
          texted.push(to);
        },
      },
    });
    return { service, registered, texted };
  };
  const inEnv = (environment: "testing" | "main" | "develop", operationMode: "local" | "cloud" | "edge") =>
    spyOn(base, "getEnv").mockReturnValue({ ...base.getEnv(), environment, operationMode });

  test("a master number takes the fixed code and no text only in a local or testing run", async () => {
    for (const [environment, operationMode] of [
      ["testing", "cloud"],
      ["main", "local"],
    ] as const) {
      const getEnv = inEnv(environment, operationMode);
      try {
        const { service, registered, texted } = serviceTexting();
        await service.requestPhoneCodeForSignin(phone, "hash");
        expect([registered, texted]).toEqual([[masterPhoneCode], []]);
      } finally {
        getEnv.mockRestore();
      }
    }
  });

  test("a master number is texted a fresh code like any other on a deployed server", async () => {
    for (const [environment, operationMode] of [
      ["main", "cloud"],
      ["develop", "edge"],
    ] as const) {
      const getEnv = inEnv(environment, operationMode);
      try {
        const { service, registered, texted } = serviceTexting();
        await service.requestPhoneCodeForSignin(phone, "hash");
        expect(registered).toHaveLength(1);
        expect(registered[0]).not.toBe(masterPhoneCode);
        expect(texted).toEqual([phone]);
        expect(SignService.honoursMasterPhones()).toBe(false);
      } finally {
        getEnv.mockRestore();
      }
    }
  });
});
