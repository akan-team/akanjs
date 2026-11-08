import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as fileSpec from "@libs/shared/lib/file/file.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import type { SignalContext } from "akanjs/signal";
import { getOrSetupSignalTestFetch, sample, sampleOf } from "akanjs/test";

import * as cnst from "../lib/cnst";
import type { fetch as sharedFetch } from "../lib/useServer";
import type { CallerAccount } from "./callerAccount";
import { PlatformAdmin } from "./guards";
import { PlatformAdminList } from "./platformAdminList";
import { withPlatformAdminIds } from "./platformAdminList.spec";

/**
 * Shared has no tenant of its own: ownership here is "the acting account". These cases pin the
 * boundaries that were open — admin records reachable without any account, one signed-in user
 * writing another's record, and a viewer or a manager writing anyone's.
 */
describe("Shared guards", () => {
  let anonFetch: typeof sharedFetch;
  let owner: userSpec.UserAgent, other: userSpec.UserAgent;
  let adminAgent: adminSpec.AdminAgent;
  let viewerFetch: typeof sharedFetch, managerFetch: typeof sharedFetch;

  const staffFetchOf = async (role: cnst.AdminRole["value"]) => {
    const adminInput = sampleOf(cnst.AdminInput);
    const staff = await adminAgent.fetch.createAdmin(adminInput);
    await adminAgent.fetch.setAdminPassword(staff.id, "password");
    await adminAgent.fetch.addAdminRole(staff.id, role);
    const { jwt } = await anonFetch.signinAdmin(adminInput.accountId, "password");
    return anonFetch.clone({ jwt }) as typeof sharedFetch;
  };

  const profileOf = (nickname: string) => ({ nickname, images: [] }) as typeof owner.userInput;

  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    owner = await userSpec.getUserAgentWithPassword();
    other = await userSpec.getUserAgentWithPassword();
    adminAgent = await adminSpec.getAdminAgentWithInitialize();
    viewerFetch = await staffFetchOf("viewer");
    managerFetch = await staffFetchOf("manager");
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
    const userInput = { nickname: sample.word(), images: [] } as typeof owner.userInput;
    const updated = await owner.fetch.updateUser(owner.user.id, userInput);
    expect(updated.id).toBe(owner.user.id);

    await expect(other.fetch.updateUser(owner.user.id, userInput)).rejects.toThrow();
    await expect(other.fetch.removeUser(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.addBadgeCount(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.getRestrictInfo(owner.user.id)).rejects.toThrow();
    await expect(other.fetch.setNotiSettingOfUser(owner.user.id, "block")).rejects.toThrow();
    // create is an admin path — signup goes through generatePrepareUser
    await expect(owner.fetch.createUser(userInput)).rejects.toThrow();
  });

  it("lets a user put only files they uploaded on their own profile", async () => {
    const [ownFile] = await fileSpec.getActiveFiles(1, owner.fetch);
    const [foreignFile] = await fileSpec.getActiveFiles(1, other.fetch);
    const imagesOf = (...ids: string[]) => ({ ...profileOf(sample.word()), image: ids[0], images: ids });
    await expect(owner.fetch.updateUser(owner.user.id, imagesOf(foreignFile.id))).rejects.toThrow(
      "user.error.imageNotUploadedBySelf",
    );
    await expect(owner.fetch.updateUser(owner.user.id, imagesOf(ownFile.id, foreignFile.id))).rejects.toThrow(
      "user.error.imageNotUploadedBySelf",
    );
    expect((await adminAgent.fetch.user(owner.user.id)).images).toHaveLength(0);
    const updated = await owner.fetch.updateUser(owner.user.id, imagesOf(ownFile.id));
    expect(updated.images.map((image) => image.id)).toEqual([ownFile.id]);
  });

  it("takes a file uploaded with the user's own upload ticket", async () => {
    const ticket = await owner.fetch.requestFileUpload("user", null);
    const [fileList] = fileSpec.getFileInputSamples(1);
    const [uploaded] = (await (await fileSpec.postFilesWithTicket(ticket, fileList)).json()) as { id: string }[];
    const file = await fileSpec.waitUploadedFile(uploaded.id, owner.fetch);
    const updated = await owner.fetch.updateUser(owner.user.id, {
      ...profileOf(sample.word()),
      image: file.id,
      images: [file.id],
    });
    expect(updated.image?.id).toBe(file.id);
  });

  it("lets an admin set any file, and the user keep it on later saves", async () => {
    const target = await userSpec.getUserAgentWithPassword();
    const [foreignFile] = await fileSpec.getActiveFiles(1, other.fetch);
    const profile = { ...profileOf(sample.word()), image: foreignFile.id, images: [foreignFile.id] };
    expect((await adminAgent.fetch.updateUser(target.user.id, profile)).images).toHaveLength(1);
    expect((await target.fetch.updateUser(target.user.id, profile)).image?.id).toBe(foreignFile.id);
  });

  it("keeps a viewer and a manager from writing another user's record", async () => {
    const target = await userSpec.getUserAgentWithPassword();
    for (const staffFetch of [viewerFetch, managerFetch]) {
      await expect(staffFetch.updateUser(target.user.id, profileOf("hijacked"))).rejects.toThrow();
      await expect(staffFetch.removeUser(target.user.id)).rejects.toThrow();
      await expect(staffFetch.addBadgeCount(target.user.id)).rejects.toThrow();
      await expect(staffFetch.subBadgeCount(target.user.id)).rejects.toThrow();
      await expect(staffFetch.setNotiSettingOfUser(target.user.id, "block")).rejects.toThrow();
    }
    const kept = await adminAgent.fetch.user(target.user.id);
    expect(kept.nickname).toBe(target.user.nickname);
    expect(kept.badgeCount).toBe(target.user.badgeCount);
    expect(kept.removedAt).toBeFalsy();
    expect(await target.fetch.notiSettingOfSelf()).toBe("normal");
  });

  it("lets an admin write another user's record, and the user their own", async () => {
    const target = await userSpec.getUserAgentWithPassword();
    const nickname = sample.word();
    expect((await adminAgent.fetch.updateUser(target.user.id, profileOf(nickname))).nickname).toBe(nickname);
    expect((await adminAgent.fetch.addBadgeCount(target.user.id)).badgeCount).toBe(target.user.badgeCount + 1);
    expect(await adminAgent.fetch.setNotiSettingOfUser(target.user.id, "fewer")).toBeTruthy();
    expect(await target.fetch.notiSettingOfSelf()).toBe("fewer");

    expect((await target.fetch.subBadgeCount(target.user.id)).badgeCount).toBe(target.user.badgeCount);
    expect(await target.fetch.setNotiSettingOfUser(target.user.id, "normal")).toBeTruthy();
    expect(await target.fetch.notiSettingOfSelf()).toBe("normal");
  });

  it("still lets a viewer and a manager read another user's restriction", async () => {
    const target = await userSpec.getUserAgentWithPassword();
    const reason = sample.sentence();
    await adminAgent.fetch.restrictUser(target.user.id, reason, null);
    for (const staffFetch of [viewerFetch, managerFetch])
      expect((await staffFetch.getRestrictInfo(target.user.id))?.reason).toBe(reason);
    await expect(other.fetch.getRestrictInfo(target.user.id)).rejects.toThrow();
  });

  it("requires an admin to author notifications", async () => {
    await expect(owner.fetch.createNotification(sampleOf(cnst.NotificationInput))).rejects.toThrow();
  });

  it("answers isPlatformAdmin true only for a listed admin, and false for every admin once the list is empty", async () => {
    const unlistedAdminFetch = await staffFetchOf("admin");
    await withPlatformAdminIds(adminAgent.admin.id, async () => {
      expect(await adminAgent.fetch.isPlatformAdmin()).toBe(true);
      expect(await unlistedAdminFetch.isPlatformAdmin()).toBe(false);
    });
    await withPlatformAdminIds(undefined, async () => {
      expect(await adminAgent.fetch.isPlatformAdmin()).toBe(false);
    });
  });

  it("refuses isPlatformAdmin to a viewer, a user and an anonymous caller", async () => {
    await withPlatformAdminIds(adminAgent.admin.id, async () => {
      await expect(viewerFetch.isPlatformAdmin()).rejects.toThrow(/noAuthenticationWithRoles/);
      await expect(owner.fetch.isPlatformAdmin()).rejects.toThrow(/noAuthenticationWithRoles/);
      await expect(anonFetch.isPlatformAdmin()).rejects.toThrow(/noAuthenticationAccount/);
    });
  });
});

describe("PlatformAdmin guard", () => {
  const guard = new PlatformAdmin();
  const listedId = "6a25568fc8cc0ef23cc96bc5";
  const otherId = "6ae20ee1922757c27908e3ee";
  const contextOf = (account: CallerAccount) =>
    ({ key: "platformAdminGuardTest", get: () => account }) as unknown as SignalContext;
  const adminOf = (id: string, roles: string[] = ["admin"]) =>
    ({ me: { id, roles, removedAt: null } }) as unknown as CallerAccount;
  const userOf = (id: string) => ({ self: { id, roles: ["user"], removedAt: null } }) as unknown as CallerAccount;
  const admits = (account: CallerAccount) => guard.canPass(contextOf(account));

  it("admits a listed admin or superAdmin and refuses an unlisted admin", async () => {
    await withPlatformAdminIds(`${listedId},${otherId}`, async () => {
      expect(admits(adminOf(listedId))).toBe(true);
      expect(admits(adminOf(otherId, ["superAdmin"]))).toBe(true);
    });
    await withPlatformAdminIds(listedId, async () => {
      expect(() => admits(adminOf(otherId))).toThrow("shared.error.notPlatformAdmin");
      expect(() => admits(adminOf(otherId, ["admin", "superAdmin"]))).toThrow("shared.error.notPlatformAdmin");
    });
  });

  it("refuses a plain user, a viewer and a removed admin even when their id is listed", async () => {
    await withPlatformAdminIds(listedId, async () => {
      expect(() => admits(userOf(listedId))).toThrow("shared.error.noAuthenticationWithRoles");
      expect(() => admits(adminOf(listedId, ["viewer", "manager"]))).toThrow("shared.error.noAuthenticationWithRoles");
      const removed = { me: { id: listedId, roles: ["admin"], removedAt: new Date() } } as unknown as CallerAccount;
      expect(() => admits(removed)).toThrow("shared.error.noAuthenticationWithRoles");
      expect(() => admits({} as CallerAccount)).toThrow("shared.error.noAuthenticationAccount");
    });
  });

  it("refuses every admin while the list is unset or empty", async () => {
    for (const value of [undefined, "", "  ", " , ,"])
      await withPlatformAdminIds(value, async () => {
        expect(PlatformAdminList.ids().size).toBe(0);
        expect(() => admits(adminOf(listedId))).toThrow("shared.error.notPlatformAdmin");
        expect(() => admits(adminOf(listedId, ["superAdmin"]))).toThrow("shared.error.notPlatformAdmin");
      });
  });

  it("tolerates whitespace and duplicate ids", async () => {
    await withPlatformAdminIds(` ${listedId} ,${otherId},, ${listedId}\t`, async () => {
      expect([...PlatformAdminList.ids()].sort()).toEqual([listedId, otherId].sort());
      expect(admits(adminOf(listedId))).toBe(true);
      expect(admits(adminOf(otherId))).toBe(true);
    });
  });
});
