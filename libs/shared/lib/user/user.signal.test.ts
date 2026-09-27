import { beforeAll, describe, expect, it } from "bun:test";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import type { Account } from "akanjs/fetch";
import { getOrSetupSignalTestFetch, sample } from "akanjs/test";

import type * as cnst from "../cnst";
import type { fetch as sharedFetch } from "../useServer";

// The server reads it at boot, which is the first fetch below — only reserved test domains honour it.
process.env.MASTER_EMAILCODE ??= "135790";

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
      const decodedJwt = decodeJwtPayload<Account & { exp?: number; tokenType?: string }>(userAgent.accessToken.jwt);
      expect(decodedJwt.self).toBeTruthy();
      expect(decodedJwt.exp).toBeTruthy();
      expect(decodedJwt.tokenType).toBe("access");
      expect(userAgent.accessToken.refreshToken).toBeTruthy();

      const refreshedToken = await userAgent.fetch.refreshJwt(userAgent.accessToken.refreshToken);
      expect(refreshedToken.jwt).toBeTruthy();
      expect(refreshedToken.refreshToken).toBeTruthy();
      expect(refreshedToken.refreshToken).not.toBe(userAgent.accessToken.refreshToken);

      await expect(userAgent.fetch.refreshJwt(userAgent.accessToken.refreshToken)).rejects.toThrow();
      await expect(userAgent.fetch.refreshJwt(refreshedToken.refreshToken)).rejects.toThrow();
    });
  });
});

describe("User Credentials", () => {
  let fetch: typeof sharedFetch;
  let accountId: string;
  let password: string;
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
  });

  it("keeps the current password working after someone asks for a reset", async () => {
    accountId = `${crypto.randomUUID().slice(0, 8)}@reset.test`;
    password = sample.string({ length: 12 });
    const prepareUser = await fetch.generatePrepareUser(null, "dummy");
    await fetch.setAccountIdInPrepareUser(prepareUser.id, accountId);
    await fetch.setPasswordInPrepareUser(prepareUser.id, accountId, password);
    await fetch.activateUser(prepareUser.id);
    await fetch.resetPassword(accountId).catch(() => false);
    const accessToken = await fetch.signinWithPassword(accountId, password, "dummy");
    expect(accessToken.jwt).toBeTruthy();
  });

  it("sends a sign-in code only to the number already on the account", async () => {
    const phone = process.env.MASTER_PHONES?.split(",")[1];
    const phoneCode = process.env.MASTER_PHONECODE;
    if (!phone || !phoneCode) return;
    const phoneAgent = await userSpec.getUserAgentWithPhone(1);
    const otherPhone = "010-9999-0000";
    await expect(fetch.requestPhoneCodeForSignin(phoneAgent.user.id, otherPhone, "signin")).rejects.toThrow();
    await expect(fetch.getSignTokenForSignin(phoneAgent.user.id, otherPhone, phoneCode)).rejects.toThrow();
    await fetch.requestPhoneCodeForSignin(phoneAgent.user.id, phone, "signin");
    const signToken = await fetch.getSignTokenForSignin(phoneAgent.user.id, phone, phoneCode);
    const accessToken = await fetch.signinWithSignToken(phoneAgent.user.id, signToken);
    expect(accessToken.jwt).toBeTruthy();
  });

  it("verifies an email only with the code sent to that address", async () => {
    const emailCode = process.env.MASTER_EMAILCODE ?? "";
    const email = `${crypto.randomUUID().slice(0, 8)}@signup.test`;
    const prepareUser = await fetch.generatePrepareUser(null, "dummy");
    await fetch.setAccountIdInPrepareUser(prepareUser.id, email);
    await fetch.requestEmailCodeInPrepareUser(prepareUser.id);
    await expect(fetch.verifyEmailInPrepareUser(prepareUser.id, "000000")).rejects.toThrow();
    await fetch.verifyEmailInPrepareUser(prepareUser.id, emailCode);
    expect((await fetch.user(prepareUser.id)).verifies).toContain("email");

    await fetch.setAccountIdInPrepareUser(prepareUser.id, `other-${email}`);
    expect((await fetch.user(prepareUser.id)).verifies).not.toContain("email");
  });
});
