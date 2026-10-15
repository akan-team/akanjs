import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { dayjs } from "akanjs/base";
import type { Account } from "akanjs/fetch";
import { getOrSetupSignalTestFetch, sample } from "akanjs/test";

import type * as cnst from "../cnst";
import type { fetch as sharedFetch } from "../useServer";

const decodeJwtPayload = <Payload>(jwt: string): Payload => {
  return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as Payload;
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
    adminAgent = await adminSpec.getAdminAgentWithInitialize();
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
    await adminAgent.fetch.restrictUser(userId, "spam", dayjs().add(1, "day"));
    expect((await fetch.user(userId)).status).toBe("restricted");
    await expect(fetch.signinWithPassword(accountId, password)).rejects.toThrow(/userRestricted/);
    await adminAgent.fetch.releaseUser(userId);
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

describe("Signup Token", () => {
  let fetch: typeof sharedFetch;
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
  });

  it("refuses every sign-up step without the draft's own token", async () => {
    const victim = await fetch.generatePrepareUser(null);
    const attacker = await fetch.generatePrepareUser(null);
    const accountId = `${crypto.randomUUID().slice(0, 8)}@signup.test`;
    await expect(fetch.setAccountIdInPrepareUser(victim.userId, accountId, attacker.signupToken)).rejects.toThrow();
    await expect(fetch.setAccountIdInPrepareUser(victim.userId, accountId, "forged")).rejects.toThrow();
    await expect(fetch.activateUser(victim.userId, attacker.signupToken)).rejects.toThrow();
    await fetch.setAccountIdInPrepareUser(victim.userId, accountId, victim.signupToken);
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
});
