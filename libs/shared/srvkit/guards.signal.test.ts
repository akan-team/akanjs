import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { getOrSetupSignalTestFetch, sample, sampleOf } from "akanjs/test";

import * as cnst from "../lib/cnst";
import type { fetch as sharedFetch } from "../lib/useServer";

/**
 * Shared has no tenant of its own: ownership here is "the acting account". These cases pin the two
 * boundaries that were open — admin records reachable without any account, and one signed-in user
 * writing another's record.
 */
describe("Shared guards", () => {
  let anonFetch: typeof sharedFetch;
  let owner: userSpec.UserAgent, other: userSpec.UserAgent;
  let adminAgent: adminSpec.AdminAgent;

  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    owner = await userSpec.getUserAgentWithPassword();
    other = await userSpec.getUserAgentWithPassword();
    adminAgent = await adminSpec.getAdminAgentWithInitialize();
  });

  it("keeps admin records out of anonymous reach", async () => {
    await expect(anonFetch.adminList()).rejects.toThrow();
    await expect(anonFetch.admin(adminAgent.admin.id)).rejects.toThrow();
    await expect(anonFetch.createAdmin({ accountId: sample.email() })).rejects.toThrow();
    await expect(anonFetch.updateAdmin(adminAgent.admin.id, { accountId: sample.email() })).rejects.toThrow();
    await expect(anonFetch.removeAdmin(adminAgent.admin.id)).rejects.toThrow();
  });

  it("never serializes an admin password hash", async () => {
    const admin = await adminAgent.fetch.admin(adminAgent.admin.id);
    expect(admin.accountId).toBeTruthy();
    expect(admin.password).toBeFalsy();
  });

  it("still lets the root admin sign in after the password became a secret field", async () => {
    const accessToken = await anonFetch.signinAdmin(adminAgent.adminInput.accountId, adminAgent.password);
    expect(accessToken.jwt).toBeTruthy();
  });

  it("lets a signed-in user write only their own record", async () => {
    const userInput = { nickname: sample.word(), images: [], appliedImages: [] } as typeof owner.userInput;
    const updated = await owner.fetch.updateUser(owner.user.id, userInput);
    expect(updated.id).toBe(owner.user.id);

    await expect(other.fetch.updateUser(owner.user.id, userInput)).rejects.toThrow();
    await expect(other.fetch.removeUser(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.addBadgeCount(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.getRestrictInfo(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.setNotiSettingOfUser(owner.user.id, "all")).rejects.toThrow();
    // create is an admin path — signup goes through generatePrepareUser
    await expect(owner.fetch.createUser(userInput)).rejects.toThrow();
  });

  it("requires an account to render a PDF and an admin to author notifications", async () => {
    // Unauthenticated this rendered any URL the caller named in a server-side headless browser.
    await expect(anonFetch.generatePdf("http://127.0.0.1:1/")).rejects.toThrow(/[Aa]uthentication|[Ff]orbidden/);
    await expect(owner.fetch.createNotification(sampleOf(cnst.NotificationInput))).rejects.toThrow();
  });
});
