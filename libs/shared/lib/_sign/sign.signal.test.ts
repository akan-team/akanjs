import { beforeAll, describe, expect, it } from "bun:test";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { getOrSetupSignalTestFetch, sample } from "akanjs/test";

import type { fetch as sharedFetch } from "../useServer";

describe("Sign Signal", () => {
  let fetch: typeof sharedFetch;
  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
  });

  it("opens a sign-up holding the account id and mails its code in one call", async () => {
    const accountId = userSpec.testEmail();
    const { userId, signupToken } = await fetch.generatePrepareUserWithAccountId(accountId, true);
    await expect(fetch.verifyEmailInPrepareUser(userId, "000000", signupToken)).rejects.toThrow();
    await fetch.verifyEmailInPrepareUser(userId, userSpec.testEmailCode, signupToken);
    await fetch.setPasswordInPrepareUser(userId, accountId, sample.string({ length: 12 }), signupToken);
    expect((await fetch.activateUser(userId, signupToken)).jwt).toBeTruthy();
  });

  it("opens no sign-up for an id that is not an email address, or that is shaped like an SSO id", async () => {
    for (const accountId of ["plain-name", `github:${Date.now()}`])
      await expect(fetch.generatePrepareUserWithAccountId(accountId, false)).rejects.toThrow(/signupAccountIdNotEmail/);
  });

  it("opens no sign-up for an account id already in use", async () => {
    const agent = await userSpec.getUserAgentWithPassword();
    const accountId = await agent.fetch.myAccountId();
    if (!accountId) throw new Error("the agent has no account id");
    await expect(fetch.generatePrepareUserWithAccountId(accountId, false)).rejects.toThrow();
  });

  it("opens a draft for a new number, then texts a known one a sign-in code that the right code alone spends", async () => {
    const phone = process.env.MASTER_PHONES?.split(",")[2];
    const phoneCode = process.env.MASTER_PHONECODE;
    if (!phone || !phoneCode) return;
    const wrongCode = String((Number(phoneCode) + 1) % 1_000_000).padStart(6, "0");
    const ticket = await fetch.startPhoneSign(phone, "dummy", null);
    if (!ticket) throw new Error("a new number opened no draft");
    await expect(fetch.activateUser(ticket.userId, ticket.signupToken)).rejects.toThrow(/signupNotVerified/);
    await fetch.verifyPhoneInPrepareUser(ticket.userId, phone, phoneCode, ticket.signupToken);
    await fetch.setAccountIdInPrepareUser(ticket.userId, userSpec.testEmail(), ticket.signupToken);
    await fetch.requestEmailCodeInPrepareUser(ticket.userId, ticket.signupToken);
    await fetch.verifyEmailInPrepareUser(ticket.userId, userSpec.testEmailCode, ticket.signupToken);
    await fetch.activateUserWithAgreePolicies(ticket.userId, ["privacy", "termsofservice"], ticket.signupToken);

    expect(await fetch.startPhoneSign(phone, "dummy", null)).toBeNull();
    await expect(fetch.signinWithPhoneCode(phone, wrongCode)).rejects.toThrow(/invalidPhoneCode/);
    expect((await fetch.signinWithPhoneCode(phone, phoneCode)).jwt).toBeTruthy();
  });

  it("signs no one in on a number that is on no account", async () => {
    await expect(fetch.signinWithPhoneCode("010-9999-0003", "000000")).rejects.toThrow();
  });
});
