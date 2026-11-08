import { beforeAll, describe, expect, it, setSystemTime } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { dayjs, getApiPrefix } from "akanjs/base";
import type { Account } from "akanjs/fetch";
import { OAuthPkce } from "akanjs/server";
import { getOrSetupSignalTestFetch, sample } from "akanjs/test";

import * as cnst from "../cnst";
import type * as srv from "../srv";
import type { fetch as sharedFetch } from "../useServer";

const decodeJwtPayload = <Payload>(jwt: string): Payload => {
  return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as Payload;
};

//? The admin system initializes once per process, so every suite shares the first admin agent.
let adminAgentLoad: Promise<adminSpec.AdminAgent> | undefined;
const adminAgentOnce = async () => {
  adminAgentLoad ??= adminSpec.getAdminAgentWithInitialize();
  return await adminAgentLoad;
};

//? Imported after the harness boots: a value import of the module tree before it sets PORT pins fetch to 8282.
const liveUserService = async (agent: userSpec.UserAgent) => {
  const { UserService } = await import("./user.service");
  const original = UserService.prototype.getAccountId;
  const reached: { service?: srv.UserService } = {};
  UserService.prototype.getAccountId = async function (this: srv.UserService, ...args) {
    reached.service = this;
    return await original.apply(this, args);
  } as typeof original;
  try {
    await agent.fetch.myAccountId();
  } finally {
    UserService.prototype.getAccountId = original;
  }
  if (!reached.service) throw new Error("the live user service was not reached");
  return reached.service;
};

describe("User Signal", () => {
  describe("User Service", () => {
    let userAgent: userSpec.UserAgent;
    let user: cnst.User;
    beforeAll(async () => {});

    it("can create user with password", async () => {
      userAgent = await userSpec.getUserAgentWithPassword();
      user = userAgent.user;
      expect(user.status).toBe("active");
    });

    it("can refresh user jwt with refresh token rotation", async () => {
      const decodedJwt = decodeJwtPayload<Account<{ self?: { id: string } }> & { exp?: number; tokenType?: string }>(
        userAgent.accessToken.jwt,
      );
      expect(decodedJwt.self).toBeTruthy();
      expect(decodedJwt.exp).toBeTruthy();
      expect(decodedJwt.tokenType).toBe("access");
      expect(userAgent.accessToken.refreshToken).toBeTruthy();

      const refreshedToken = await userAgent.fetch.refreshJwt(userAgent.accessToken.refreshToken);
      expect(refreshedToken.jwt).toBeTruthy();
      expect(refreshedToken.refreshToken).toBeTruthy();
      expect(refreshedToken.refreshToken).not.toBe(userAgent.accessToken.refreshToken);

      // A browser racing itself inside the grace gets a sibling session, not a sign-out everywhere; the reuse past the
      // grace is pinned in user.service.test.ts.
      const sibling = await userAgent.fetch.refreshJwt(userAgent.accessToken.refreshToken);
      expect(sibling.refreshToken).toBeTruthy();
      expect((await userAgent.fetch.refreshJwt(refreshedToken.refreshToken)).jwt).toBeTruthy();
    });
  });
});

describe("User Credentials", () => {
  let fetch: typeof sharedFetch;
  let adminAgent: adminSpec.AdminAgent;
  const signupWithPassword = async (accountId: string, password: string) => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, signupToken);
    await fetch.setPasswordInPrepareUser(userId, accountId, password, signupToken);
    await fetch.activateUser(userId, signupToken);
    return userId;
  };
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    adminAgent = await adminAgentOnce();
  });

  it("keeps the current password working after someone asks for a reset", async () => {
    const accountId = userSpec.testEmail();
    const password = sample.string({ length: 12 });
    await signupWithPassword(accountId, password);
    await fetch.resetPassword(accountId).catch(() => false);
    const accessToken = await fetch.signinWithPassword(accountId, password);
    expect(accessToken.jwt).toBeTruthy();
  });

  it("answers an unknown account and a wrong password alike, and locks after ten misses", async () => {
    const accountId = userSpec.testEmail();
    const password = sample.string({ length: 12 });
    await signupWithPassword(accountId, password);
    await expect(fetch.signinWithPassword(userSpec.testEmail(), password)).rejects.toThrow(/invalidCredentials/);
    for (let miss = 0; miss < 10; miss++)
      await expect(fetch.signinWithPassword(accountId, "wrong-password")).rejects.toThrow(/invalidCredentials/);
    await expect(fetch.signinWithPassword(accountId, password)).rejects.toThrow(/tooManySigninAttempts/);
  });

  const missFrom = async (caller: typeof sharedFetch, accountId: string, missNum = 10) => {
    for (let miss = 0; miss < missNum; miss++)
      await expect(caller.signinWithPassword(accountId, "wrong-password")).rejects.toThrow(/invalidCredentials/);
  };

  it("locks password sign-in per caller address, so a stranger's misses leave the owner's address open", async () => {
    const accountId = userSpec.testEmail();
    const password = sample.string({ length: 12 });
    await signupWithPassword(accountId, password);
    const stranger = fetch.clone() as typeof sharedFetch;
    await missFrom(stranger, accountId);
    await expect(stranger.signinWithPassword(accountId, password)).rejects.toThrow(/tooManySigninAttempts/);
    expect((await (fetch.clone() as typeof sharedFetch).signinWithPassword(accountId, password)).jwt).toBeTruthy();
  });

  it("locks every address at the account cap, and leaves sign-token sign-in open", async () => {
    const accountId = userSpec.testEmail();
    const password = sample.string({ length: 12 });
    const userId = await signupWithPassword(accountId, password);
    await Promise.all(Array.from({ length: 5 }, () => missFrom(fetch.clone() as typeof sharedFetch, accountId)));
    const owner = fetch.clone() as typeof sharedFetch;
    await expect(owner.signinWithPassword(accountId, password)).rejects.toThrow(/tooManySigninAttempts/);
    const userService = await liveUserService(await userSpec.getUserAgentWithPassword());
    const signToken = await userService.userModel.signChallenge.setSignToken(userId, "signin");
    expect((await owner.signinWithSignToken(signToken)).jwt).toBeTruthy();
  });

  it("answers a reset for an unknown account, or one asked again within three minutes, as sent", async () => {
    expect(await fetch.resetPassword(userSpec.testEmail())).toBe(true);
    const accountId = userSpec.testEmail();
    await signupWithPassword(accountId, sample.string({ length: 12 }));
    expect(await fetch.resetPassword(accountId)).toBe(true);
    expect(await fetch.resetPassword(accountId)).toBe(true);
  });

  it("rehashes a password stored before hashing at its first sign-in, and keeps the sessions it had", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const userService = await liveUserService(agent);
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const legacy = sample.string({ length: 5 });
    await userService.userModel.User.updateOne({ id: agent.user.id }, { password: legacy, verifies: ["email"] });
    expect((await fetch.signinWithPassword(accountId, legacy)).jwt).toBeTruthy();
    const { password } = (await userService.userModel.User.pickById(agent.user.id, { password: true })) as {
      password?: string;
    };
    expect(password).toMatch(/^\$2[abxy]?\$\d{2}\$/);
    expect((await agent.fetch.getSelf())?.verifies).toContain("password");
    expect((await fetch.signinWithPassword(accountId, legacy)).jwt).toBeTruthy();
  });

  it("ends a user's sessions when an admin takes a role away", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    await adminAgent.fetch.addUserRole(agent.user.id, "business");
    expect((await agent.fetch.getSelf())?.id).toBe(agent.user.id);
    expect((await adminAgent.fetch.subUserRole(agent.user.id, "business")).roles).not.toContain("business");
    expect(await agent.fetch.getSelf()).toBeNull();
  });

  //? Re-signs a person's token for the same live session with a `client_id`, the claim the OAuth server gives an agent.
  const agentFetchOf = async (userService: srv.UserService, jwt: string) => {
    const { self, selfSid, me, meSid, sid } = decodeJwtPayload<{
      self?: unknown;
      selfSid?: string;
      me?: unknown;
      meSid?: string;
      sid: string;
    }>(jwt);
    const { jwt: agentJwt } = await userService.securityService.signAccessToken(
      { self, selfSid, me, meSid, client_id: `agent-${crypto.randomUUID()}` },
      { sid, jti: crypto.randomUUID() },
    );
    return fetch.clone({ jwt: agentJwt }) as typeof sharedFetch;
  };

  it("refuses an agent's token at every credential change, the operator's own included", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const userService = await liveUserService(agent);
    const accountId = await agent.fetch.myAccountId();
    const refusedAsAgent = /Person|noAuthenticationAccount/;
    const newPassword = sample.string({ length: 12 });
    await expect(agent.fetch.setPasswordWithSignToken(newPassword, "unissued")).rejects.toThrow(/invalidSignToken/);
    const userAgentFetch = await agentFetchOf(userService, agent.accessToken.jwt);
    await expect(userAgentFetch.setPasswordWithSignToken(newPassword, "unissued")).rejects.toThrow(refusedAsAgent);

    const operatorAgentFetch = await agentFetchOf(userService, adminAgent.accessToken.jwt);
    await expect(operatorAgentFetch.setPasswordByAdmin(agent.user.id, newPassword)).rejects.toThrow(refusedAsAgent);
    await expect(operatorAgentFetch.setPhoneByAdmin(agent.user.id, "010-9999-0004")).rejects.toThrow(refusedAsAgent);
    await expect(operatorAgentFetch.setAccountIdByAdmin(agent.user.id, userSpec.testEmail())).rejects.toThrow(
      refusedAsAgent,
    );
    await expect(operatorAgentFetch.getAccessTokenByAdmin(agent.user.id)).rejects.toThrow(refusedAsAgent);
    expect(await agent.fetch.myAccountId()).toBe(accountId);
    await expect(fetch.signinWithPassword(accountId ?? "", newPassword)).rejects.toThrow(/invalidCredentials/);
  });

  it("refuses a sign-up that proved no identity", async () => {
    const accountId = userSpec.testEmail();
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await fetch.setPasswordInPrepareUser(userId, accountId, sample.string({ length: 12 }), signupToken);
    await expect(fetch.activateUser(userId, signupToken)).rejects.toThrow(/signupNotVerified/);
    await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, signupToken);
    expect((await fetch.activateUser(userId, signupToken)).jwt).toBeTruthy();
  });

  it("keeps a restricted account out until the restriction ends or is released", async () => {
    const accountId = userSpec.testEmail();
    const password = sample.string({ length: 12 });
    const userId = await signupWithPassword(accountId, password);
    expect((await adminAgent.fetch.restrictUser(userId, "spam", dayjs().add(1, "day"))).status).toBe("restricted");
    expect((await fetch.user(userId)).status).toBe("restricted");
    await expect(fetch.signinWithPassword(accountId, password)).rejects.toThrow(/userRestricted/);
    expect((await adminAgent.fetch.releaseUser(userId)).status).toBe("active");
    expect(await adminAgent.fetch.getRestrictInfo(userId)).toBeFalsy();
    expect((await fetch.signinWithPassword(accountId, password)).jwt).toBeTruthy();

    await adminAgent.fetch.restrictUser(userId, "spam", dayjs().subtract(1, "minute"));
    expect((await fetch.signinWithPassword(accountId, password)).jwt).toBeTruthy();
    expect((await fetch.user(userId)).status).toBe("active");
  });

  it("stops an access token at once when its session signs out", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    expect((await agent.fetch.getSelf())?.id).toBe(agent.user.id);
    await agent.fetch.signoutUser(null);
    expect(await agent.fetch.getSelf()).toBeNull();
  });

  it("moves an account onto a new number only with the code sent to it", async () => {
    const passwordAgent = await userSpec.getUserAgentWithPassword();
    await expect(passwordAgent.fetch.setPhoneInActiveUser("010-9999-1111", "000000")).rejects.toThrow();
  });

  it("sends a sign-in code only to a number already on an account, and spends the sign token once", async () => {
    const phone = process.env.MASTER_PHONES?.split(",")[1];
    const phoneCode = process.env.MASTER_PHONECODE;
    if (!phone || !phoneCode) return;
    await userSpec.getUserAgentWithPhone(1);
    const otherPhone = "010-9999-0000";
    await expect(fetch.requestPhoneCodeForSignin(otherPhone, "signin")).rejects.toThrow();
    await expect(fetch.getSignTokenForSignin(otherPhone, phoneCode)).rejects.toThrow();
    await fetch.requestPhoneCodeForSignin(phone, "signin");
    const signToken = await fetch.getSignTokenForSignin(phone, phoneCode);
    const accessToken = await fetch.signinWithSignToken(signToken);
    expect(accessToken.jwt).toBeTruthy();
    await expect(fetch.signinWithSignToken(signToken)).rejects.toThrow();
  });

  it("verifies an email only with the code sent to that address", async () => {
    const emailCode = userSpec.testEmailCode;
    const email = userSpec.testEmail();
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await fetch.setAccountIdInPrepareUser(userId, email, signupToken);
    await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
    await expect(fetch.verifyEmailInPrepareUser(userId, "000000", signupToken)).rejects.toThrow();
    await fetch.verifyEmailInPrepareUser(userId, emailCode, signupToken);
    expect((await fetch.user(userId)).verifies).toContain("email");

    await fetch.setAccountIdInPrepareUser(userId, `other-${email}`, signupToken);
    expect((await fetch.user(userId)).verifies).not.toContain("email");
  });
});

describe("Leaving", () => {
  const survey = { type: "unsatisfied", reason: "too slow", satisfaction: 1, voc: "", at: dayjs() } as const;
  let userService: srv.UserService;
  const storedOf = async (userId: string) =>
    await userService.userModel.User.findById(userId, { leaveInfo: true }, { withRemoved: true });

  beforeAll(async () => {
    userService = await liveUserService(await userSpec.getUserAgentWithPassword());
  });

  it("removes the account, then keeps its survey and its leave record on the removed row", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const [leaveKey] = await userService.userModel.getLeaveKeys(agent.user.id);
    const removed = await agent.fetch.leaveSelf(survey);
    expect(removed.removedAt).toBeTruthy();
    await expect(userService.getUser(agent.user.id)).rejects.toThrow();
    const stored = await storedOf(agent.user.id);
    expect([stored?.leaveInfo?.type, stored?.leaveInfo?.reason, stored?.leaveInfo?.satisfaction]).toEqual([
      "unsatisfied",
      "too slow",
      1,
    ]);
    expect(stored?.leaveInfo?.at.isSame(survey.at, "second")).toBe(true);
    await expect(userService.userModel.assertResignable(leaveKey ?? "", 30)).rejects.toThrow(/resignupNotAvailable/);
  });

  it("removes an account that answered no survey and writes none", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    await agent.fetch.leaveSelf(null);
    await expect(userService.getUser(agent.user.id)).rejects.toThrow();
    expect((await storedOf(agent.user.id))?.leaveInfo ?? null).toBeNull();
  });

  it("answers the removal even when the survey cannot be written after it", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const model = userService.userModel;
    Object.defineProperty(model, "writeLeaveInfo", {
      value: async () => {
        throw new Error("survey store unavailable");
      },
      configurable: true,
    });
    try {
      const removed = await agent.fetch.leaveSelf(survey);
      expect(removed.removedAt).toBeTruthy();
    } finally {
      Reflect.deleteProperty(model, "writeLeaveInfo");
    }
    await expect(userService.getUser(agent.user.id)).rejects.toThrow();
    expect((await storedOf(agent.user.id))?.leaveInfo ?? null).toBeNull();
  });

  it("drops the leaving device, removes the account and ends its sessions in one call", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const device = {
      token: "dummy-leaving-token",
      provider: "fcm",
      platform: "web",
      deviceId: "leaving-device",
      updatedAt: dayjs(),
    } as const;
    expect(await agent.fetch.addNotiDeviceTokenOfSelf(device)).toBeTruthy();
    expect((await agent.fetch.leaveAndSignoutSelf(survey, device.deviceId)).jwt).toBeFalsy();
    await expect(userService.getUser(agent.user.id)).rejects.toThrow();
    const stored = await userService.userModel.User.findById(
      agent.user.id,
      { notiInfo: true, leaveInfo: true },
      { withRemoved: true },
    );
    expect((stored?.notiInfo?.deviceTokens ?? []).map((each) => each.deviceId)).not.toContain(device.deviceId);
    expect(stored?.leaveInfo?.type).toBe("unsatisfied");
    expect(await agent.fetch.getSelf()).toBeNull();
  });
});

describe("Email Verification of an Active Account", () => {
  const code = userSpec.testEmailCode ?? "";
  const wrongCode = code === "000000" ? "111111" : "000000";
  let anonFetch: typeof sharedFetch;
  let userService: srv.UserService;
  const verifiedOf = async (agent: userSpec.UserAgent) => await userService.listVerifiedEmails(agent.user.id);

  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    userService = await liveUserService(await userSpec.getUserAgentWithPassword());
  });

  it("proves a second address with the code mailed to it and leaves the sign-in ID where it was", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const address = userSpec.testEmail();
    expect(await agent.fetch.requestEmailCodeInActiveUser(` ${address.toUpperCase()} `)).toBe(true);
    expect(await agent.fetch.verifyEmailInActiveUser(address, code)).toBe(true);
    expect((await verifiedOf(agent)).sort()).toEqual([accountId, address].sort());
    expect(await agent.fetch.myAccountId()).toBe(accountId);
    expect((await agent.fetch.getSelf())?.verifies).toEqual(agent.user.verifies);
    await agent.fetch.requestEmailCodeInActiveUser(address);
    expect(await agent.fetch.verifyEmailInActiveUser(address, code)).toBe(true);
    expect((await verifiedOf(agent)).sort()).toEqual([accountId, address].sort());
  });

  it("keeps a verify code and a password-reset code apart, each refused by the other flow", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    await agent.fetch.requestEmailCodeInActiveUser(accountId);
    await expect(anonFetch.verifyEmailCodeForResetPassword(accountId, code)).rejects.toThrow(/invalidEmailCode/);
    expect(await agent.fetch.verifyEmailInActiveUser(accountId, code)).toBe(true);
    await anonFetch.requestEmailCodeForResetPassword(accountId);
    await expect(agent.fetch.verifyEmailInActiveUser(accountId, code)).rejects.toThrow(/invalidEmailCode/);
    expect(typeof (await anonFetch.verifyEmailCodeForResetPassword(accountId, code))).toBe("string");
  });

  it("counts wrong codes per flow, so misses on the public reset check never lock verification, nor the reverse", async () => {
    const resetTarget = await userSpec.getUserAgentWithPassword();
    const resetAccountId = (await resetTarget.fetch.myAccountId()) ?? "";
    const address = userSpec.testEmail();
    await resetTarget.fetch.requestEmailCodeInActiveUser(address);
    for (let missNum = 0; missNum < 10; missNum++)
      await expect(anonFetch.verifyEmailCodeForResetPassword(resetAccountId, wrongCode)).rejects.toThrow(
        /invalidEmailCode/,
      );
    await expect(anonFetch.verifyEmailCodeForResetPassword(resetAccountId, wrongCode)).rejects.toThrow(
      /tooManyCodeFailures/,
    );
    expect(await resetTarget.fetch.verifyEmailInActiveUser(address, code)).toBe(true);

    const verifier = await userSpec.getUserAgentWithPassword();
    const verifierAccountId = (await verifier.fetch.myAccountId()) ?? "";
    await anonFetch.requestEmailCodeForResetPassword(verifierAccountId);
    for (let missNum = 0; missNum < 10; missNum++)
      await expect(verifier.fetch.verifyEmailInActiveUser(address, wrongCode)).rejects.toThrow(/invalidEmailCode/);
    await expect(verifier.fetch.verifyEmailInActiveUser(address, wrongCode)).rejects.toThrow(/tooManyCodeFailures/);
    expect(typeof (await anonFetch.verifyEmailCodeForResetPassword(verifierAccountId, code))).toBe("string");
  });

  it("keeps a pending verify code when anyone asks to reset the account's password", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const address = userSpec.testEmail();
    await agent.fetch.requestEmailCodeInActiveUser(address);
    await anonFetch.requestEmailCodeForResetPassword(accountId);
    expect(await agent.fetch.verifyEmailInActiveUser(address, code)).toBe(true);
    expect(await verifiedOf(agent)).toContain(address);
  });

  //? Pins getAccountId to a stale answer, standing in for an admin moving the accountId between the read and the write.
  const withAccountIdRead = async (accountId: string | null, run: () => Promise<unknown>) => {
    const model = userService.userModel;
    Object.defineProperty(model, "getAccountId", { value: async () => accountId, configurable: true });
    try {
      await run();
    } finally {
      Reflect.deleteProperty(model, "getAccountId");
    }
  };

  it("lists the address beside the account ID when the account ID moved off it mid-verify", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const address = userSpec.testEmail();
    await agent.fetch.requestEmailCodeInActiveUser(address);
    await withAccountIdRead(address, () => agent.fetch.verifyEmailInActiveUser(address, code));
    expect((await verifiedOf(agent)).sort()).toEqual([accountId, address].sort());
  });

  it("refuses to report an address verified when nothing was stored", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    await agent.fetch.leaveSelf(null);
    await withAccountIdRead(null, async () => {
      await expect(userService.userModel.addVerifiedEmail(agent.user.id, userSpec.testEmail())).rejects.toThrow(
        /emailVerifyNotSaved/,
      );
    });
  });

  it("proves the account ID itself the way sign-up does once an admin moved it", async () => {
    const adminAgent = await adminAgentOnce();
    const agent = await userSpec.getUserAgentWithPassword();
    const moved = userSpec.testEmail();
    await adminAgent.fetch.setAccountIdByAdmin(agent.user.id, moved);
    expect(await verifiedOf(agent)).toEqual([]);
    await agent.fetch.requestEmailCodeInActiveUser(moved);
    await agent.fetch.verifyEmailInActiveUser(moved, code);
    expect((await adminAgent.fetch.user(agent.user.id)).verifies).toContain("email");
    expect(await verifiedOf(agent)).toEqual([moved]);
    expect(await userService.userModel.getVerifiedEmails(agent.user.id)).toEqual([]);
  });

  it("refuses a wrong code, then a used one", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    await agent.fetch.requestEmailCodeInActiveUser(address);
    await expect(agent.fetch.verifyEmailInActiveUser(address, wrongCode)).rejects.toThrow(/invalidEmailCode/);
    await agent.fetch.verifyEmailInActiveUser(address, code);
    await expect(agent.fetch.verifyEmailInActiveUser(address, code)).rejects.toThrow(/invalidEmailCode/);
  });

  it("refuses a code for another address, or one another account asked for", async () => {
    const asker = await userSpec.getUserAgentWithPassword();
    const other = await userSpec.getUserAgentWithPassword();
    const [asked, unasked] = [userSpec.testEmail(), userSpec.testEmail()];
    await asker.fetch.requestEmailCodeInActiveUser(asked);
    await expect(asker.fetch.verifyEmailInActiveUser(unasked, code)).rejects.toThrow(/invalidEmailCode/);
    await expect(other.fetch.verifyEmailInActiveUser(asked, code)).rejects.toThrow(/invalidEmailCode/);
    expect(await verifiedOf(other)).not.toContain(asked);
    expect(await verifiedOf(asker)).not.toContain(unasked);
  });

  it("refuses a code past its ten minutes", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    await agent.fetch.requestEmailCodeInActiveUser(address);
    setSystemTime(dayjs().add(11, "minute").toDate());
    try {
      await expect(agent.fetch.verifyEmailInActiveUser(address, code)).rejects.toThrow(/invalidEmailCode/);
    } finally {
      setSystemTime();
    }
    expect(await verifiedOf(agent)).not.toContain(address);
  });

  it("caps the codes per address and per account", async () => {
    const [first, second] = [await userSpec.getUserAgentWithPassword(), await userSpec.getUserAgentWithPassword()];
    const shared = userSpec.testEmail();
    for (let sendNum = 0; sendNum < 3; sendNum++) await first.fetch.requestEmailCodeInActiveUser(shared);
    for (let sendNum = 0; sendNum < 2; sendNum++) await second.fetch.requestEmailCodeInActiveUser(shared);
    await expect(second.fetch.requestEmailCodeInActiveUser(shared)).rejects.toThrow(/tooManyEmailCodes/);
    for (let sendNum = 0; sendNum < 2; sendNum++) await first.fetch.requestEmailCodeInActiveUser(userSpec.testEmail());
    await expect(first.fetch.requestEmailCodeInActiveUser(userSpec.testEmail())).rejects.toThrow(
      /base\.error\.tooManyRequests/,
    );
  });

  it("answers an address another account signs in with like any other, and proves it for the caller alone", async () => {
    const holder = await userSpec.getUserAgentWithPassword();
    const prover = await userSpec.getUserAgentWithPassword();
    const holderAddress = (await holder.fetch.myAccountId()) ?? "";
    const fresh = userSpec.testEmail();
    expect(await prover.fetch.requestEmailCodeInActiveUser(holderAddress)).toBe(true);
    expect(await prover.fetch.verifyEmailInActiveUser(holderAddress, code)).toBe(true);
    expect(await prover.fetch.requestEmailCodeInActiveUser(fresh)).toBe(true);
    expect(await verifiedOf(prover)).toContain(holderAddress);
    expect(await verifiedOf(holder)).toEqual([holderAddress]);
    expect(await holder.fetch.myAccountId()).toBe(holderAddress);
  });

  it("refuses a signed-out caller and an address that is not one", async () => {
    await expect(anonFetch.requestEmailCodeInActiveUser(userSpec.testEmail())).rejects.toThrow();
    await expect(anonFetch.verifyEmailInActiveUser(userSpec.testEmail(), code)).rejects.toThrow();
    const agent = await userSpec.getUserAgentWithPassword();
    await expect(agent.fetch.requestEmailCodeInActiveUser("not an address")).rejects.toThrow(/invalidAccountId/);
  });
});

describe("Removing a Verified Email", () => {
  const code = userSpec.testEmailCode ?? "";
  let anonFetch: typeof sharedFetch;
  let userService: srv.UserService;
  const proveEmail = async (agent: userSpec.UserAgent, address: string) => {
    await agent.fetch.requestEmailCodeInActiveUser(address);
    await agent.fetch.verifyEmailInActiveUser(address, code);
  };
  const listedOf = async (agent: userSpec.UserAgent) =>
    (await agent.fetch.verifiedEmailsOfSelf())
      .map(({ email, isAccountId }) => ({ email, isAccountId }))
      .sort((a, b) => a.email.localeCompare(b.email));

  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    userService = await liveUserService(await userSpec.getUserAgentWithPassword());
  });

  it("lists the sign-in address as such beside each address proven after sign-up", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const extra = userSpec.testEmail();
    expect(await listedOf(agent)).toEqual([{ email: accountId, isAccountId: true }]);
    await proveEmail(agent, extra);
    expect(await listedOf(agent)).toEqual(
      [
        { email: accountId, isAccountId: true },
        { email: extra, isAccountId: false },
      ].sort((a, b) => a.email.localeCompare(b.email)),
    );
  });

  it("removes an extra address however it is spelled, and leaves the sign-in ID and its verifies alone", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    const [kept, removed] = [userSpec.testEmail(), userSpec.testEmail()];
    await proveEmail(agent, kept);
    await proveEmail(agent, removed);
    const verifies = (await agent.fetch.getSelf())?.verifies;
    expect(await agent.fetch.removeVerifiedEmailOfSelf(` ${removed.toUpperCase()} `)).toBe(true);
    expect((await userService.listVerifiedEmails(agent.user.id)).sort()).toEqual([accountId, kept].sort());
    expect(await agent.fetch.myAccountId()).toBe(accountId);
    expect((await agent.fetch.getSelf())?.verifies).toEqual(verifies);
  });

  it("refuses an address that is not listed, including one already removed", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    await expect(agent.fetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow(/verifiedEmailNotFound/);
    await proveEmail(agent, address);
    await agent.fetch.removeVerifiedEmailOfSelf(address);
    await expect(agent.fetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow(/verifiedEmailNotFound/);
  });

  it("refuses the sign-in address however it is spelled, and keeps it listed", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = (await agent.fetch.myAccountId()) ?? "";
    await expect(agent.fetch.removeVerifiedEmailOfSelf(accountId.toUpperCase())).rejects.toThrow(
      /signinEmailNotRemovable/,
    );
    expect(await userService.listVerifiedEmails(agent.user.id)).toEqual([accountId]);
  });

  it("treats an address an admin moved the account ID onto as the sign-in address, proven or not", async () => {
    const adminAgent = await adminAgentOnce();
    const agent = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    await proveEmail(agent, address);
    await adminAgent.fetch.setAccountIdByAdmin(agent.user.id, address);
    expect((await adminAgent.fetch.user(agent.user.id)).verifies).not.toContain("email");
    expect(await listedOf(agent)).toEqual([{ email: address, isAccountId: true }]);
    await expect(agent.fetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow(/signinEmailNotRemovable/);
    expect(await userService.listVerifiedEmails(agent.user.id)).toEqual([address]);
  });

  it("shows the sign-in address once when its lowercase copy is also verified, and keeps the invite list as it was", async () => {
    const adminAgent = await adminAgentOnce();
    const agent = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    const spelled = address.replace(/[a-z]/, (letter) => letter.toUpperCase());
    await proveEmail(agent, address);
    await adminAgent.fetch.setAccountIdByAdmin(agent.user.id, spelled);
    await proveEmail(agent, spelled);
    expect((await adminAgent.fetch.user(agent.user.id)).verifies).toContain("email");
    expect(await userService.listVerifiedEmails(agent.user.id)).toEqual([spelled, address]);
    expect(await listedOf(agent)).toEqual([{ email: spelled, isAccountId: true }]);
    await expect(agent.fetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow(/signinEmailNotRemovable/);
  });

  it("removes only the caller's own address, and refuses a signed-out caller", async () => {
    const owner = await userSpec.getUserAgentWithPassword();
    const other = await userSpec.getUserAgentWithPassword();
    const address = userSpec.testEmail();
    await proveEmail(owner, address);
    await expect(other.fetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow(/verifiedEmailNotFound/);
    await expect(anonFetch.removeVerifiedEmailOfSelf(address)).rejects.toThrow();
    await expect(anonFetch.verifiedEmailsOfSelf()).rejects.toThrow();
    expect(await userService.listVerifiedEmails(owner.user.id)).toContain(address);
    expect((await listedOf(other)).map(({ email }) => email)).not.toContain(address);
  });
});

describe("Signup Token", () => {
  let fetch: typeof sharedFetch;
  let userService: srv.UserService;
  const agreedOf = async (userId: string) =>
    (await userService.userModel.User.findById(userId, { agreePolicies: true }))?.agreePolicies ?? [];
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    userService = await liveUserService(await userSpec.getUserAgentWithPassword());
  });

  it("refuses every sign-up step without the draft's own token", async () => {
    const victim = await fetch.generatePrepareUser(null);
    const attacker = await fetch.generatePrepareUser(null);
    const accountId = `${crypto.randomUUID().slice(0, 8)}@signup.test`;
    await expect(fetch.setAccountIdInPrepareUser(victim.userId, accountId, attacker.signupToken)).rejects.toThrow();
    await expect(fetch.setAccountIdInPrepareUser(victim.userId, accountId, "forged")).rejects.toThrow();
    await expect(fetch.activateUser(victim.userId, attacker.signupToken)).rejects.toThrow();
    await expect(
      fetch.activateUserWithAgreePolicies(victim.userId, ["privacy"], attacker.signupToken),
    ).rejects.toThrow();
    await fetch.setAccountIdInPrepareUser(victim.userId, accountId, victim.signupToken);
  });

  it("activates with the policies agreed on the same screen, and writes neither while the draft proved nothing", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    const accountId = userSpec.testEmail();
    const policies = ["privacy", "termsofservice"];
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await fetch.setPasswordInPrepareUser(userId, accountId, sample.string({ length: 12 }), signupToken);
    await expect(fetch.activateUserWithAgreePolicies(userId, policies, signupToken)).rejects.toThrow(
      /signupNotVerified/,
    );
    expect(await agreedOf(userId)).toEqual([]);
    await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, signupToken);
    expect((await fetch.activateUserWithAgreePolicies(userId, policies, signupToken)).jwt).toBeTruthy();
    expect(await agreedOf(userId)).toEqual(policies);
    expect((await fetch.user(userId)).status).toBe("active");
  });

  it("resumes the draft its token names and opens a new one once that draft is active", async () => {
    const opened = await fetch.generatePrepareUser(null);
    const resumed = await fetch.generatePrepareUser(opened.signupToken);
    expect(resumed.userId).toBe(opened.userId);
    await fetch.setAccountIdInPrepareUser(resumed.userId, userSpec.testEmail(), resumed.signupToken);
    await fetch.requestEmailCodeInPrepareUser(resumed.userId, resumed.signupToken);
    await fetch.verifyEmailInPrepareUser(resumed.userId, userSpec.testEmailCode, resumed.signupToken);
    await fetch.activateUser(resumed.userId, resumed.signupToken);
    const reopened = await fetch.generatePrepareUser(resumed.signupToken);
    expect(reopened.userId).not.toBe(opened.userId);
    await expect(fetch.activateUser(opened.userId, resumed.signupToken)).rejects.toThrow();
  });

  //? An SSR page can read neither cookie, so it sends the token argument empty and the browser's cookie carries the draft.
  it("hands the token over as an HttpOnly cookie, takes it in place of an empty argument and expires it at activation", async () => {
    const post = (path: string, body: object, cookie?: string) =>
      globalThis.fetch(`http://localhost:${process.env.PORT}${getApiPrefix()}/user/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    const signupCookieOf = (response: Response) =>
      response.headers.getSetCookie().find((entry) => /^(__Host-)?signupToken=/.test(entry));
    const opened = await post("generatePrepareUser", { signupToken: null });
    const issued = signupCookieOf(opened);
    expect(issued).toContain("HttpOnly");
    const { userId } = (await opened.json()) as { userId: string };
    const cookie = issued?.split(";")[0] ?? "";
    const accountId = userSpec.testEmail();
    expect((await post("setAccountIdInPrepareUser", { userId, accountId, signupToken: "" })).ok).toBe(false);
    expect((await post("setAccountIdInPrepareUser", { userId, accountId, signupToken: "" }, cookie)).ok).toBe(true);
    const resumed = await post("generatePrepareUser", { signupToken: null }, cookie);
    expect(((await resumed.json()) as { userId: string }).userId).toBe(userId);
    await fetch.requestEmailCodeInPrepareUser(userId, cookie.slice(cookie.indexOf("=") + 1));
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, cookie.slice(cookie.indexOf("=") + 1));
    const activated = await globalThis.fetch(
      `http://localhost:${process.env.PORT}${getApiPrefix()}/user/activateUser/${userId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ signupToken: "" }),
      },
    );
    expect(activated.ok).toBe(true);
    expect(signupCookieOf(activated)).toContain("Max-Age=0");
    expect(activated.headers.getSetCookie().some((entry) => entry.includes("HttpOnly") && /jwt:/.test(entry))).toBe(
      true,
    );
  });

  it("refuses a typed accountId that is not an email address, or that is shaped like an SSO id", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    for (const accountId of ["plain-name", `github:${Date.now()}`])
      await expect(fetch.setAccountIdInPrepareUser(userId, accountId, signupToken)).rejects.toThrow(
        /signupAccountIdNotEmail/,
      );
  });

  //? The harness boots with no `signup` option, so the default applies until the test swaps the live policy's set.
  it("activates an unproven address with a phone verify only when the app takes any identity verify", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await fetch.setAccountIdInPrepareUser(userId, userSpec.testEmail(), signupToken);
    const digits = () => String(Math.floor(Math.random() * 1e4)).padStart(4, "0");
    const phone = `010-${digits()}-${digits()}`;
    await userService.userModel.setPhoneInPrepareUser(userId, phone);
    await userService.userModel.verifyPhoneInPrepareUser(userId, phone);
    await expect(fetch.activateUser(userId, signupToken)).rejects.toThrow(/signupNotVerified/);
    const policy = userService.signupPolicy;
    const { activateVerifies } = policy;
    policy.activateVerifies = [...cnst.Verify.provesIdentity];
    try {
      expect((await fetch.activateUser(userId, signupToken)).jwt).toBeTruthy();
    } finally {
      policy.activateVerifies = activateVerifies;
    }
  });

  it("activates a GitHub draft on its github verify, since `github:<id>` names no address", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await userService.userModel.setSsoInPrepareUser(userId, `github:${Date.now()}`, "github");
    expect((await fetch.activateUser(userId, signupToken)).jwt).toBeTruthy();
  });

  it("activates a draft that names no accountId on an identity verify, since it claims no address", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    await expect(fetch.activateUser(userId, signupToken)).rejects.toThrow(/signupNotVerified/);
    const digits = () => String(Math.floor(Math.random() * 1e4)).padStart(4, "0");
    const phone = `010-${digits()}-${digits()}`;
    await userService.userModel.setPhoneInPrepareUser(userId, phone);
    await userService.userModel.verifyPhoneInPrepareUser(userId, phone);
    expect((await fetch.activateUser(userId, signupToken)).jwt).toBeTruthy();
  });
});

describe("SSO Sign-up", () => {
  let fetch: typeof sharedFetch;
  let userService: srv.UserService;
  let signService: srv.SignService;
  const githubAccountId = () => `github:${Math.floor(Math.random() * 1e12)}`;
  const liveUserService = async () => {
    const { UserService } = await import("../srv");
    const prototype = UserService.prototype;
    const original = prototype.openSignup;
    const reached: { instance?: srv.UserService } = {};
    prototype.openSignup = async function (this: srv.UserService, signupToken?: string | null) {
      reached.instance = this;
      return await original.call(this, signupToken);
    };
    try {
      await fetch.generatePrepareUser(null);
    } finally {
      prototype.openSignup = original;
    }
    if (!reached.instance) throw new Error("the live user service was not reached through generatePrepareUser");
    return reached.instance;
  };
  const liveSignService = async () => {
    const { SignService } = await import("../srv");
    const prototype = SignService.prototype;
    const original = prototype.userExistsHasPhone;
    const reached: { instance?: srv.SignService } = {};
    prototype.userExistsHasPhone = async function (this: srv.SignService, phone: string) {
      reached.instance = this;
      return await original.call(this, phone);
    };
    try {
      await fetch.userExistsHasPhone("010-9999-0002");
    } finally {
      prototype.userExistsHasPhone = original;
    }
    if (!reached.instance) throw new Error("the live sign service was not reached through userExistsHasPhone");
    return reached.instance;
  };
  //? The provider round trip is replaced by a fixed identity; everything from the hand-off on is the real path.
  const ssoSignin = async (
    ssoType: cnst.SsoType["value"],
    accountId: string,
    legacyAccountId?: string,
    verifiedEmails: string[] = [],
  ) => {
    const codeVerifier = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const state = await signService.startNativeSso(ssoType, {
      callbackScheme: signService.nativeSsoPolicy.callbackSchemes[0] ?? "shared",
      codeChallenge: OAuthPkce.challengeOf(codeVerifier),
      nonce: "sso-signup-test",
      origin: "https://signup.test",
      lang: "en",
      returnPage: false,
    });
    const start = await signService.takeNativeSso(state);
    if (!start) throw new Error("the native sign-in start was not stored");
    const result = await signService.handOffNativeSso(start, async () => ({
      accountId,
      nickname: "",
      legacyAccountId,
      verifiedEmails,
    }));
    if (!("code" in result)) throw new Error(result.error);
    return await fetch.exchangeSsoCode(result.code, codeVerifier);
  };
  const verifiesOf = async (userId: string) => (await fetch.user(userId)).verifies;
  const ssoVerifiesOf = (verifies: string[]) =>
    verifies.filter((verify) => (cnst.SsoType.values as readonly string[]).includes(verify));
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    userService = await liveUserService();
    signService = await liveSignService();
  });

  it("leaves no SSO, email or password verify on a draft an email SSO opened once its accountId changes", async () => {
    const accountId = userSpec.testEmail();
    const draft = await ssoSignin("google", accountId);
    if (!draft.prepareUserId || !draft.signupToken) throw new Error("the sign-in opened no draft");
    await userService.userModel.verifyEmailInPrepareUser(draft.prepareUserId, accountId);
    await fetch.setPasswordInPrepareUser(
      draft.prepareUserId,
      accountId,
      sample.string({ length: 12 }),
      draft.signupToken,
    );
    expect([...(await verifiesOf(draft.prepareUserId))].sort()).toEqual(["email", "google", "password"]);

    await fetch.setAccountIdInPrepareUser(draft.prepareUserId, userSpec.testEmail(), draft.signupToken);
    expect(await verifiesOf(draft.prepareUserId)).toEqual([]);
  });

  it("refuses a draft that types another account's SSO id, so the victim's sign-in opens their own draft", async () => {
    const victimAccountId = githubAccountId();
    const attacker = await ssoSignin("github", githubAccountId());
    if (!attacker.prepareUserId || !attacker.signupToken) throw new Error("the attacker's sign-in opened no draft");
    expect(await verifiesOf(attacker.prepareUserId)).toContain("github");

    await expect(
      fetch.setAccountIdInPrepareUser(attacker.prepareUserId, victimAccountId, attacker.signupToken),
    ).rejects.toThrow(/signupAccountIdNotEmail/);
    expect(ssoVerifiesOf(await verifiesOf(attacker.prepareUserId))).toEqual(["github"]);

    const victim = await ssoSignin("github", victimAccountId);
    expect(victim.jwt).toBeFalsy();
    expect(victim.prepareUserId).toBeTruthy();
    expect(victim.prepareUserId).not.toBe(attacker.prepareUserId);
  });

  it("keeps a phone verify across an accountId change", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    const digits = () => String(Math.floor(Math.random() * 1e4)).padStart(4, "0");
    const phone = `010-${digits()}-${digits()}`;
    await userService.userModel.setPhoneInPrepareUser(userId, phone);
    await userService.userModel.verifyPhoneInPrepareUser(userId, phone);
    const accountId = userSpec.testEmail();
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await userService.userModel.verifyEmailInPrepareUser(userId, accountId);
    expect(await verifiesOf(userId)).toEqual(expect.arrayContaining(["phone", "email"]));

    await fetch.setAccountIdInPrepareUser(userId, userSpec.testEmail(), signupToken);
    expect(await verifiesOf(userId)).toEqual(["phone"]);
  });

  it("drops every email proof but keeps phone and password when an active account moves to a new address", async () => {
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    const digits = () => String(Math.floor(Math.random() * 1e4)).padStart(4, "0");
    const phone = `010-${digits()}-${digits()}`;
    await userService.userModel.setPhoneInPrepareUser(userId, phone);
    await userService.userModel.verifyPhoneInPrepareUser(userId, phone);
    const accountId = userSpec.testEmail();
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, signupToken);
    await fetch.setPasswordInPrepareUser(userId, accountId, sample.string({ length: 12 }), signupToken);
    await fetch.activateUser(userId, signupToken);
    expect(await userService.listVerifiedEmails(userId)).toEqual([accountId]);

    await userService.setAccountId(userId, userSpec.testEmail());
    expect([...(await verifiesOf(userId))].sort()).toEqual(["password", "phone"]);
    expect(await userService.listVerifiedEmails(userId)).toEqual([]);
  });

  it("keeps the provider's verify and drops an email proof when the provider renames the account id", async () => {
    const legacyAccountId = userSpec.testEmail();
    const draft = await ssoSignin("kakao", legacyAccountId);
    if (!draft.prepareUserId || !draft.signupToken) throw new Error("the sign-in opened no draft");
    await userService.userModel.verifyEmailInPrepareUser(draft.prepareUserId, legacyAccountId);
    await fetch.activateUser(draft.prepareUserId, draft.signupToken);
    expect([...(await verifiesOf(draft.prepareUserId))].sort()).toEqual(["email", "kakao"]);

    const renamedAccountId = userSpec.testEmail();
    expect((await ssoSignin("kakao", renamedAccountId, legacyAccountId, [legacyAccountId])).jwt).toBeTruthy();
    expect(await verifiesOf(draft.prepareUserId)).toEqual(["kakao"]);
    expect(await userService.listVerifiedEmails(draft.prepareUserId)).toEqual([renamedAccountId]);
  });

  //? A legacy GitHub row is keyed by the login, which GitHub frees on a rename and hands to whoever registers it next.
  const legacyGithubRow = async (verifiedEmails: string[]) => {
    const { userId } = await fetch.generatePrepareUser(null);
    const login = `login-${crypto.randomUUID().slice(0, 8)}`;
    await userService.userModel.User.updateOne(
      { id: userId },
      { accountId: login, verifies: ["github"], verifiedEmails, status: "active" },
    );
    return { userId, login };
  };

  it("keeps a legacy login row when the GitHub account signing in has verified none of its addresses", async () => {
    const { userId, login } = await legacyGithubRow([userSpec.testEmail()]);
    const newcomer = await ssoSignin("github", githubAccountId(), login, [userSpec.testEmail()]);
    expect(newcomer.jwt).toBeFalsy();
    expect(newcomer.prepareUserId).toBeTruthy();
    expect(newcomer.prepareUserId).not.toBe(userId);
    expect(await userService.userModel.getAccountId(userId)).toBe(login);
  });

  it("moves a legacy login row onto the numeric id when GitHub verified an address the row holds", async () => {
    const email = userSpec.testEmail();
    const { userId, login } = await legacyGithubRow([email]);
    const accountId = githubAccountId();
    expect((await ssoSignin("github", accountId, login, [email.toUpperCase()])).jwt).toBeTruthy();
    expect(await userService.userModel.getAccountId(userId)).toBe(accountId);
  });

  it("keeps a verify earned for the accountId the draft submits again, and refuses a typed SSO id", async () => {
    const ssoAccountId = githubAccountId();
    const sso = await ssoSignin("github", ssoAccountId);
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    const accountId = userSpec.testEmail();
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await userService.userModel.verifyEmailInPrepareUser(userId, accountId);
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    expect(await verifiesOf(userId)).toContain("email");
    if (!sso.prepareUserId || !sso.signupToken) throw new Error("the sign-in opened no draft");
    await expect(fetch.setAccountIdInPrepareUser(sso.prepareUserId, ssoAccountId, sso.signupToken)).rejects.toThrow(
      /signupAccountIdNotEmail/,
    );
    expect(await verifiesOf(sso.prepareUserId)).toContain("github");
  });

  it("drops the first provider's verify when a draft signs in with a second one", async () => {
    const first = await ssoSignin("github", githubAccountId());
    if (!first.prepareUserId) throw new Error("the sign-in opened no draft");
    await userService.userModel.setSsoInPrepareUser(first.prepareUserId, userSpec.testEmail(), "google");
    expect(await verifiesOf(first.prepareUserId)).toEqual(["google"]);
  });
});
