import type { Me, Self } from "@libs/shared/common";
import {
  type AuthTokenMeta,
  RevokedSessions,
  type RotateRefreshSessionOptions,
  SignupToken,
} from "@libs/shared/srvkit";
import { type Dayjs, dayjs } from "akanjs/base";
import { isEmail } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { serve } from "akanjs/service";
import * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";
import type * as option from "../option";
import type * as srv from "../srv";

const summaryCounterOf = {
  prepare: "prepareUser",
  active: "activeUser",
  dormant: "dormantUser",
  restricted: "restrictedUser",
} as const;

export class UserService extends serve(db.user, ({ use, service }) => ({
  adminService: service<srv.AdminService>(),
  fileService: service<srv.FileService>(),
  securityService: service<srv.util.SecurityService>(),
  settingService: service<srv.SettingService>(),
  summaryService: service<srv.SummaryService>(),
  jwtSecret: use<string>(),
  signupPolicy: use<option.SignupPolicy>(),
})) {
  override async _postRemove(user: db.User) {
    await this.userModel.signChallenge.recordLeave(await this.userModel.getLeaveKeys(user.id));
    await this.userModel.revokeRefreshSessions(user.id);
    await this.summaryService.decValue(summaryCounterOf[user.status]);
    return user;
  }
  async getUserIdHasNickname(nickname: string) {
    return await this.userModel.findIdByNickname(nickname, "active");
  }
  async makeSelf(user: db.User): Promise<Self> {
    const imageId = user.image ?? user.images[0];
    const image = imageId ? await this.fileService.getFile(imageId) : null;
    return {
      id: user.id,
      nickname: user.nickname,
      roles: user.roles,
      image: image ? { url: image.url, imageSize: image.imageSize as [number, number] } : null,
      profileStatus: user.profileStatus,
      status: user.status,
      removedAt: user.removedAt ?? null,
    };
  }
  // The admin identity a browser also holds rides along only while its own session is live, with its current roles.
  async _carryAdminIdentity(account?: Account): Promise<{ me?: Me; meSid?: string }> {
    const { me, meSid } = (account ?? {}) as { me?: Me; meSid?: string };
    if (!me || !meSid || (await RevokedSessions.has(meSid, { failClosed: true }))) return {};
    const current = await this.adminService.findMe(me.id);
    return current ? { me: current, meSid } : {};
  }
  async _issueUserToken(user: db.User, account?: Account, userAgent?: string): Promise<db.util.AccessToken> {
    const { refreshToken, refreshTokenHash, refreshTokenExpiresAt } = this.securityService.createRefreshToken();
    const session = await this.userModel.createRefreshSession(
      user.id,
      refreshTokenHash,
      refreshTokenExpiresAt,
      userAgent,
    );
    const self = await this.makeSelf(user);
    const accessToken = await this.securityService.signAccessToken(
      { ...(await this._carryAdminIdentity(account)), self, selfSid: session.id },
      { sid: session.id, jti: crypto.randomUUID() },
    );
    return { ...accessToken, refreshToken };
  }
  async refreshUserToken(
    refreshToken: string,
    account?: Account,
    options: Pick<RotateRefreshSessionOptions, "graceMs" | "reuseRevokes"> = {},
  ): Promise<db.util.AccessToken> {
    const nextRefreshToken = this.securityService.createRefreshToken();
    const session = await this.userModel.rotateRefreshSession(
      this.securityService.hashRefreshToken(refreshToken),
      nextRefreshToken.refreshTokenHash,
      nextRefreshToken.refreshTokenExpiresAt,
      options,
    );
    const user = await this._assertSignable(await this.getUser(session.subjectId));
    const self = await this.makeSelf(user);
    const accessToken = await this.securityService.signAccessToken(
      { ...(await this._carryAdminIdentity(account)), self, selfSid: session.id },
      { sid: session.id, jti: crypto.randomUUID() },
    );
    return { ...accessToken, refreshToken: nextRefreshToken.refreshToken };
  }
  async getPrepareUser(userId: string) {
    return await this.userModel.getPrepareUser(userId);
  }
  async getActiveUser(userId: string) {
    return await this.userModel.getActiveUser(userId);
  }
  async generatePrepareUser(userId?: string | null) {
    const draft = userId ? await this.userModel.findPrepareUser(userId) : null;
    if (draft) return draft;
    const user = await this.userModel.createPrepareUser();
    await this.summaryService.incValue("prepareUser");
    return user;
  }
  async openSignup(signupToken?: string | null) {
    const resumeId = signupToken ? await SignupToken.verify(signupToken, this.jwtSecret) : null;
    const user = await this.generatePrepareUser(resumeId);
    return new cnst.SignupTicket().set({ userId: user.id, signupToken: await this.issueSignupToken(user.id) });
  }
  async issueSignupToken(userId: string) {
    return await SignupToken.sign(userId, this.jwtSecret);
  }
  async getAccountId<Throw extends boolean = true>(
    userId: string,
    throwError: Throw = true as Throw,
  ): Promise<Throw extends true ? string : string | null> {
    return await this.userModel.getAccountId(userId, throwError);
  }
  // An email-proving verify vouches only for the accountId it was earned under; the rest were each proven by a code.
  async listVerifiedEmails(userId: string) {
    return (await this.collectVerifiedEmails(userId)).emails;
  }
  async listVerifiedEmailEntries(userId: string) {
    const { accountId, emails } = await this.collectVerifiedEmails(userId);
    const accountAddress = accountId?.trim().toLowerCase();
    const entryMap = new Map<string, cnst.VerifiedEmail>();
    for (const email of emails) {
      const address = email.trim().toLowerCase();
      if (!entryMap.has(address))
        entryMap.set(address, new cnst.VerifiedEmail().set({ email, isAccountId: address === accountAddress }));
    }
    return [...entryMap.values()];
  }
  async removeVerifiedEmail(userId: string, email: string) {
    const user = await this.getUser(userId);
    const address = email.trim().toLowerCase();
    const accountId = await this.userModel.getAccountId(user.id, false);
    if (accountId?.trim().toLowerCase() === address) throw new Err("user.error.signinEmailNotRemovable");
    await this.userModel.removeVerifiedEmail(user.id, address);
  }
  private async collectVerifiedEmails(userId: string) {
    const user = await this.getUser(userId);
    const accountId = await this.userModel.getAccountId(user.id, false);
    const isProven = user.verifies.some((verify) => cnst.Verify.isEmailProof(verify));
    const provenAccountId = accountId && isEmail(accountId) && isProven ? [accountId] : [];
    const emails = [...new Set([...provenAccountId, ...(await this.userModel.getVerifiedEmails(user.id))])];
    return { accountId, emails };
  }
  async setNickname(userId: string, nickname: string) {
    const user = await this.getUser(userId);
    return await user.rename(nickname).save();
  }
  async setImages(userId: string, images: string[]) {
    const user = await this.getUser(userId);
    return await user.set({ images }).save();
  }
  // An id already on the row passes, so a profile set before files recorded their uploader stays editable.
  async canSetImages(userId: string, uploaderId: string, fileIds: string[]) {
    const user = await this.getUser(userId);
    const kept = new Set([user.image, ...user.images]);
    return await this.fileService.isUploadedBy(
      fileIds.filter((id) => !kept.has(id)),
      uploaderId,
    );
  }
  async firstJoinJourney(userId: string) {
    const user = await this.getUser(userId);
    await this.userModel.setJourney(user.id, "firstJoin");
  }
  // dormant → active; any other status is left as it is, so repeating the call moves no counter.
  async wakeUser(userId: string) {
    const user = await this.getUser(userId);
    if (user.status !== "dormant") return user;
    await this.userModel.setJourney(user.id, "returned");
    const awake = await user.set({ status: "active" }).save();
    await this.summaryService.moveValue("dormantUser", "activeUser");
    return awake;
  }
  // active → dormant.
  async dormantUser(userId: string) {
    const user = await this.getUser(userId);
    if (user.status !== "active") return user;
    const dormant = await user.set({ status: "dormant" }).save();
    await this.summaryService.moveValue("activeUser", "dormantUser");
    return dormant;
  }
  // One gate for every sign-in path. A restriction that ran out is lifted here as well as by the sweep.
  async _assertSignable(user: db.User) {
    if (user.status === "prepare") throw new Err("user.error.userNotActivated");
    if (user.status !== "restricted") return user;
    const restrictInfo = await this.userModel.getRestrictInfo(user.id);
    if (restrictInfo && dayjs(restrictInfo.until).isAfter(dayjs()))
      throw new Err("user.error.userRestricted", { until: dayjs(restrictInfo.until).format("YYYY-MM-DD HH:mm") });
    return await this.releaseUser(user.id);
  }

  async addBadgeCount(userId: string) {
    const user = await this.getUser(userId);
    return await user.addBadgeCount().save();
  }

  async subBadgeCount(userId: string) {
    const user = await this.getUser(userId);
    return await user.subBadgeCount().save();
  }

  // The device leaves with the session: a phone handed to the next person must not keep this account's pushes.
  async signoutUser(account: Account<{ self?: Self } & AuthTokenMeta>, pushDeviceId: string | null = null) {
    if (!account.self) return { jwt: "" };
    await this.userModel.revokeRefreshSession(account.self.id, account.selfSid ?? account.sid);
    if (pushDeviceId) await this.userModel.subNotiDevice(account.self.id, pushDeviceId);
    return { jwt: "" };
  }
  // prepare → active. Policies agreed on the activating screen land with the activation, or not at all.
  async activateUser(userId: string, account?: Account, agreePolicies: string[] = []) {
    const user = await this.transaction(async () => {
      const draft = await this.getPrepareUser(userId);
      const { activateVerifies, idlessActivateVerifies } = this.signupPolicy;
      const proofs = (await this.userModel.getAccountId(draft.id, false)) ? activateVerifies : idlessActivateVerifies;
      if (proofs.length && !draft.verifies.some((verify) => proofs.includes(verify)))
        throw new Err("user.error.signupNotVerified");
      if (agreePolicies.length) draft.set({ agreePolicies });
      const activated = await draft.set({ status: "active" }).save();
      await this.summaryService.moveValue("prepareUser", "activeUser");
      return activated;
    });
    return await this._issueUserToken(user, account);
  }
  async activateUserByAdmin(userId: string) {
    const user = await this.getPrepareUser(userId);
    const activeUser = await user.set({ status: "active" }).save();
    await this.summaryService.moveValue("prepareUser", "activeUser");
    return activeUser;
  }
  async setLeaveInfo(userId: string, leaveInfo: db.LeaveInfo) {
    const user = await this.userModel.getUser(userId);
    return await user.set({ leaveInfo }).save();
  }
  //? The survey is written onto the removed row, so a removal a pre-remove hook refuses leaves no answer behind.
  async leave(userId: string, leaveInfo: db.LeaveInfo | null = null) {
    const user = await this.removeUser(userId);
    if (!leaveInfo) return user;
    try {
      await this.userModel.writeLeaveInfo(userId, leaveInfo);
    } catch (error) {
      this.logger.error(`Leave survey of removed user ${userId} was not saved: ${String(error)}`);
    }
    return user;
  }
  // The device leaves before the row does: a removed row is out of reach of the write that drops it.
  async leaveAndSignout(userId: string, leaveInfo: db.LeaveInfo | null = null, pushDeviceId: string | null = null) {
    await this.transaction(async () => {
      if (pushDeviceId) await this.userModel.subNotiDevice(userId, pushDeviceId);
      await this.leave(userId, leaveInfo);
    });
    return { jwt: "" };
  }
  async addUserRole(userId: string, role: cnst.UserRole["value"]) {
    const user = await this.userModel.getUser(userId);
    return await user.addRole(role).save();
  }
  async subUserRole(userId: string, role: cnst.UserRole["value"]) {
    const user = await this.userModel.getUser(userId);
    const demoted = await user.subRole(role).save();
    await this.userModel.revokeRefreshSessions(demoted.id);
    return demoted;
  }
  async getRestrictInfo(userId: string) {
    return await this.userModel.getRestrictInfo(userId);
  }
  async restrictUser(userId: string, reason: string, until?: Dayjs | null) {
    const user = await this.getUser(userId);
    const previousStatus = user.status;
    const restricted = await user.restrict(reason, until ?? dayjs().add(1, "year")).save();
    if (previousStatus !== "restricted")
      await this.summaryService.moveValue(summaryCounterOf[previousStatus], "restrictedUser");
    await this.userModel.revokeRefreshSessions(restricted.id);
    return restricted;
  }
  async releaseUser(userId: string) {
    const user = await this.getUser(userId);
    const released = await user.release().save();
    await this.userModel.clearRestrictInfo(userId);
    await this.summaryService.moveValue("restrictedUser", "activeUser");
    return released;
  }
  // Collected first and released after: releasing shrinks the very list being paged through.
  async releaseExpiredRestrictions() {
    const expiredIds: string[] = [];
    for (let skip = 0; ; skip += 100) {
      const userIds = await this.userModel.listIdsByStatuses(["restricted"], { skip, limit: 100, sort: "oldest" });
      for (const userId of userIds) {
        const restrictInfo = await this.userModel.getRestrictInfo(userId);
        if (!restrictInfo || dayjs(restrictInfo.until).isBefore(dayjs())) expiredIds.push(userId);
      }
      if (userIds.length < 100) break;
    }
    for (const userId of expiredIds) await this.releaseUser(userId);
  }
  async setAccountId(userId: string, accountId: string) {
    const user = await this.getUser(userId);
    if (user.status === "prepare") await this.userModel.setAccountIdInPrepareUser(user.id, accountId);
    else await this.userModel.setAccountIdInActiveUser(user.id, accountId);
  }
  async setPassword(userId: string, password: string) {
    const user = await this.userModel.getUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    if (user.status === "prepare") await this.userModel.setPasswordInPrepareUser(user.id, accountId, password);
    else {
      await this.userModel.setPasswordInActiveUser(user.id, password);
      await this.userModel.revokeRefreshSessions(user.id);
    }
  }
  async setPhone(userId: string, phone: string) {
    const user = await this.userModel.getUser(userId);
    if (user.status === "prepare") await this.userModel.setPhoneInPrepareUser(user.id, phone);
    else await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  async getAccessTokenByAdmin(userId: string) {
    const user = await this.userModel.getUser(userId);
    return await this._issueUserToken(user);
  }
  async getEncourageInfo(userId: string) {
    return await this.userModel.getEncourageInfo(userId);
  }
  async setJourney(userId: string, journey: cnst.Journey["value"], journeyAt?: Dayjs) {
    const user = await this.getUser(userId);
    await this.userModel.setJourney(user.id, journey, journeyAt);
  }
  async setInquiry(userId: string, inquiry: cnst.Inquiry["value"], inquiryAt?: Dayjs) {
    const user = await this.getUser(userId);
    await this.userModel.setInquiry(user.id, inquiry, inquiryAt);
  }

  async setNicknameOfPrepareUser(userId: string, nickname: string) {
    const user = await this.getPrepareUser(userId);
    return await user.rename(nickname).save();
  }

  async setNameOfPrepareUser(userId: string, name: string) {
    const user = await this.getPrepareUser(userId);
    return await user.set({ name }).save();
  }
  async setAgreePoliciesOfPrepareUser(userId: string, agreePolicies: string[]) {
    const user = await this.getPrepareUser(userId);
    return await user.set({ agreePolicies }).save();
  }
  // Returns whether a row was written. The caller reports it, because a silent no-op is how a notification
  // preference ends up ignored with nothing to look at.
  async setNotiSettingOfUser(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    const user = await this.getUser(userId);
    return await this.userModel.setNotiSetting(user.id, notiSetting);
  }
  async getNotiSettingOfUser(userId: string) {
    const notiInfo = await this.userModel.getNotiInfo(userId);
    return notiInfo?.setting ?? "normal";
  }
  async hasNotiDeviceTokenOfUser(userId: string, notiDeviceToken: string) {
    const notiInfo = await this.userModel.getNotiInfo(userId);
    return !!notiInfo?.deviceTokens.some(({ token }) => token === notiDeviceToken);
  }
  async listNotiInfosOfUsers(userIds: string[]) {
    return await this.userModel.listNotiInfos(userIds);
  }
  async listActiveUserIds({ skip, limit }: { skip: number; limit: number }) {
    return await this.userModel.listIdsByStatuses(["active"], { skip, limit, sort: "oldest" });
  }
  async addNotiDeviceTokenOfUser(userId: string, deviceToken: db.DeviceToken) {
    const user = await this.getUser(userId);
    return await this.userModel.addNotiDeviceToken(user.id, deviceToken);
  }
  async subNotiDeviceTokenOfUser(userId: string, notiDeviceToken: string) {
    const user = await this.getUser(userId);
    return await this.userModel.subNotiDeviceToken(user.id, notiDeviceToken);
  }
  async subNotiDeviceTokensOfUsers(tokensByUser: Map<string, string[]>) {
    await this.userModel.subNotiDeviceTokensOfUsers(tokensByUser);
  }
}
