import { Dayjs } from "@akanjs/base";
import { serve } from "@akanjs/service";
import { type Account } from "@akanjs/signal";
import { type Self } from "@shared/base";
import type { SsoCookie } from "@shared/nest";
import { randomCode, randomString } from "@util/common";
import type { EmailApi, PurpleApi } from "@util/nest";

import * as cnst from "../cnst";
import * as db from "../db";
import type * as srv from "../srv";

export class UserService extends serve(db.user, ({ use, service }) => ({
  adminService: service<srv.AdminService>(),
  fileService: service<srv.FileService>(),
  securityService: service<srv.util.SecurityService>(),
  settingService: service<srv.SettingService>(),
  summaryService: service<srv.SummaryService>(),
  host: use<string>(),
  emailApi: use<EmailApi>(),
  purpleApi: use<PurpleApi>(),
})) {
  async _postRemove(user: db.User) {
    if (user.status === "active") await this.summaryService.decValue("activeUser");
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
  async getPrepareUser(userId: string) {
    return await this.userModel.getPrepareUser(userId);
  }
  async getActiveUser(userId: string) {
    return await this.userModel.getActiveUser(userId);
  }
  async generatePrepareUser(userId?: string | null) {
    return await this.userModel.generatePrepareUser(userId);
  }
  async getAccountId<Throw extends boolean = true>(
    userId: string,
    throwError: Throw = true as Throw
  ): Promise<Throw extends true ? string : string | null> {
    return await this.userModel.getAccountId(userId, throwError);
  }
  async setNickname(userId: string, nickname: string) {
    const user = await this.getUser(userId);
    return await user.set({ nickname }).save();
  }
  async setAppliedImages(userId: string, appliedImages: string[]) {
    const user = await this.getUser(userId);
    return await user.set({ appliedImages }).save();
  }
  async setImages(userId: string, images: string[]) {
    const user = await this.getUser(userId);
    return await user.set({ images }).save();
  }
  async approveUserImages(userId: string) {
    const user = await this.getUser(userId);
    return await user.approveImages().save();
  }
  async applyUserProfile(userId: string) {
    const user = await this.getUser(userId);
    await user.applyUserProfile().save();
    await this.setJourney(user.id, "waiting");
    return user;
  }
  async approveUserProfile(userId: string) {
    const user = await this.getUser(userId);
    const approvedUser = await user.approveUserProfile().save();
    return approvedUser;
  }
  async rejectUserProfile(userId: string) {
    const user = await this.getUser(userId);
    return await user.set({ profileStatus: "rejected" }).save();
  }
  async reserveUserProfile(userId: string) {
    const user = await this.getUser(userId);
    return await user.set({ profileStatus: "reserved" }).save();
  }
  async featureUserProfile(userId: string) {
    const user = await this.getUser(userId);
    return await user.set({ profileStatus: "featured" }).save();
  }
  async firstJoinJourney(userId: string) {
    const user = await this.getUser(userId);
    await this.userModel.setJourney(user.id, "firstJoin");
  }
  async wakeUser(userId: string) {
    const user = await this.getUser(userId);
    await this.userModel.setJourney(user.id, "returned");
    await this.summaryService.moveValue("dormantUser", "activeUser");
    return await user.set({ status: "active" }).save();
  }
  async dormantUser(userId: string) {
    const user = await this.getUser(userId);
    await this.summaryService.moveValue("activeUser", "dormantUser");
    return await user.set({ status: "dormant" }).save();
  }

  async addBadgeCount(userId: string) {
    const user = await this.getUser(userId);
    return await user.addBadgeCount().save();
  }

  async subBadgeCount(userId: string) {
    const user = await this.getUser(userId);
    return await user.subBadgeCount().save();
  }

  //*===================================================================*//
  //*====================== Password Signing Area ======================*//
  async setAccountIdInPrepareUser(userId: string, accountId: string) {
    const setting = await this.settingService.getActiveSetting();
    const user = await this.getPrepareUser(userId);
    await this.userModel.setAccountIdInPrepareUser(user.id, accountId, setting.resignupDays);
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setPasswordInPrepareUser(user.id, accountId, password);
  }
  async signinWithPassword(accountId: string, password: string, account: Account): Promise<cnst.util.AccessToken> {
    const user = await this.userModel.getUserByPassword(accountId, password);
    if (user.status !== "active") throw new Error("Not activated yet");
    const self = await this.makeSelf(user);
    return this.securityService.addJwt({ self }, account);
  }
  async changePassword(userId: string, password: string, prevPassword: string) {
    const accountId = await this.userModel.getAccountId(userId);
    const user = await this.userModel.getUserByPassword(accountId, prevPassword);
    await this.userModel.setPasswordInActiveUser(user.id, password);
    return user;
  }
  async requestPhoneCodeForSetPassword(userId: string, phone: string, hash: string) {
    const user = await this.getActiveUser(userId);
    await this.#registerPhoneCode(user.id, phone, "setPasswordWithSignToken", hash);
  }
  async getSignTokenForSetPassword(userId: string, phone: string, phoneCode: string) {
    const user = await this.userModel.getUser(userId);
    const isValid = await this.userModel.isPhoneCodeValid(user.id, phone, "setPasswordWithSignToken", phoneCode);
    if (!isValid) throw new Error("Invalid phone code");
    const signToken = await this.userModel.setSignToken(user.id);
    return signToken;
  }
  async setPasswordWithSignToken(userId: string, password: string, signToken: string) {
    const isVerified = await this.userModel.verifySignToken(userId, signToken);
    if (!isVerified) throw new Error("Sign token is invalid");
    await this.userModel.setPasswordInActiveUser(userId, password);
  }
  async resetPassword(accountId: string): Promise<boolean> {
    const isResetable = await this.userModel.isResetable(accountId);
    if (!isResetable) throw new Error(`Retry after 3 minutes`);
    const user = await this.userModel.pickByAccountId(accountId, ["active"]);
    const password = randomString();
    await this.userModel.setPasswordInActiveUser(user.id, password);
    await this.emailApi.sendPasswordResetMail(accountId, password, this.host);
    await this.userModel.logResetTime(user.id);
    return true;
  }
  //*====================== Password Signing Area ======================*//
  //*===================================================================*//

  //*================================================================*//
  //*====================== Phone Signing Area ======================*//
  async getUserIdHasPhone(phone: string) {
    return await this.userModel.findIdByPhone(phone, ["active", "dormant", "restricted"]);
  }
  async setPhoneInPrepareUser(userId: string, phone: string, hash: string) {
    const setting = await this.settingService.getActiveSetting();
    const user = await this.getPrepareUser(userId);
    await this.userModel.setPhoneInPrepareUser(user.id, phone, setting.resignupDays);
    await this.#registerPhoneCode(user.id, phone, "setPhoneInPrepareUser", hash);
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.getPrepareUser(userId);
    const isValid = await this.userModel.isPhoneCodeValid(userId, phone, "setPhoneInPrepareUser", phoneCode);
    if (!isValid) throw new Error("Invalid phone code");
    return await this.userModel.verifyPhoneInPrepareUser(user.id, phone);
  }
  async setPhoneInActiveUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.getActiveUser(userId);
    return await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  async requestPhoneCodeForSignin(userId: string, phone: string, hash: string) {
    const user = await this.getActiveUser(userId);
    await this.#registerPhoneCode(user.id, phone, "signinWithSignToken", hash);
  }
  async getSignTokenForSignin(userId: string, phone: string, phoneCode: string) {
    const user = await this.userModel.getUser(userId);
    const isValid = await this.userModel.isPhoneCodeValid(user.id, phone, "signinWithSignToken", phoneCode);
    if (!isValid) throw new Error("Invalid phone code");
    const signToken = await this.userModel.setSignToken(user.id);
    return signToken;
  }
  //*====================== Phone Signing Area ======================*//
  //*================================================================*//

  //*========================================================================*//
  //*====================== SignToken Signing Area =======================*//
  async #registerPhoneCode(userId: string, phone: string, purpose: string, hash: string) {
    const user = await this.userModel.getUser(userId);
    const dryrun = cnst.MASTER_PHONES.includes(phone);
    const phoneCode = dryrun ? cnst.MASTER_PHONECODE : randomCode(6);
    await this.userModel.registerPhoneCode(user.id, phone, purpose, phoneCode);
    if (!dryrun) await this.purpleApi.sendPhoneCode(phone, phoneCode, hash);
  }
  async signinWithSignToken(userId: string, signToken: string, account?: Account) {
    const user = await this.userModel.getUser(userId);
    const isVerified = await this.userModel.verifySignToken(user.id, signToken);
    if (!isVerified) throw new Error("Invalid sign token");
    const self = await this.makeSelf(user);
    return this.securityService.addJwt({ self }, account);
  }
  //*====================== SignToken Signing Area =======================*//
  //*========================================================================*//

  //*================================================================*//
  //*======================= SSO Signing Area =======================*//
  async handleSsoCallback(
    accountId: string,
    ssoType: cnst.SsoType["value"],
    ssoCookie: SsoCookie,
    account?: Account
  ): Promise<{ cookie?: { [key: string]: string }; redirect: string }> {
    const { prepareUserId, ssoFor, signinRedirect, signupRedirect, adminRedirect, errorRedirect } = ssoCookie;
    try {
      if (ssoFor === "admin") {
        const accessToken = await this.adminService.ssoSigninAdmin(accountId, account);
        return { cookie: { jwt: accessToken.jwt }, redirect: adminRedirect ?? "/admin" };
      } else {
        const userId = await this.userModel.findIdByAccountId(accountId, ["active", "restricted", "dormant"]);
        if (userId) {
          const user = await this.userModel.getActiveUserBySso(accountId, ssoType);
          const self = await this.makeSelf(user);
          const accessToken = this.securityService.addJwt({ self }, account);
          return { cookie: { jwt: accessToken.jwt }, redirect: signinRedirect };
        } else {
          const user = await this.generatePrepareUser(prepareUserId);
          await this.userModel.setSsoInPrepareUser(user.id, accountId, ssoType);
          return { redirect: `${signupRedirect}?userId=${user.id}` };
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      return { redirect: `${errorRedirect ?? "/error"}?error=${encodeURIComponent(errMsg)}` };
    }
  }
  //*======================= SSO Signing Area =======================*//
  //*================================================================*//

  async activateUser(userId: string, account?: Account) {
    const user = await this.getPrepareUser(userId);
    // TODO: check minimum verification levels
    await user.set({ status: "active" }).save();
    const self = await this.makeSelf(user);
    await this.summaryService.moveValue("prepareUser", "activeUser");
    return this.securityService.addJwt({ self }, account);
  }
  async setLeaveInfo(userId: string, leaveInfo: db.LeaveInfo) {
    const user = await this.userModel.getUser(userId);
    return await user.set({ leaveInfo }).save();
  }
  //*================================================================*//
  //*====================== Admin Control Area ======================*//
  async addUserRole(userId: string, role: cnst.UserRole["value"]) {
    const user = await this.userModel.getUser(userId);
    return await user.addRole(role).save();
  }
  async subUserRole(userId: string, role: cnst.UserRole["value"]) {
    const user = await this.userModel.getUser(userId);
    return await user.subRole(role).save();
  }
  async getRestrictInfo(userId: string) {
    return await this.userModel.getRestrictInfo(userId);
  }
  async restrictUser(userId: string, reason: string, until?: Dayjs) {
    const user = await this.getActiveUser(userId);
    const isRestricted = await this.userModel.restrict(user.id, reason, until);
    if (isRestricted) await this.summaryService.moveValue("activeUser", "restrictedUser");
  }
  async releaseUser(userId: string) {
    const user = await this.getActiveUser(userId);
    const isReleased = await this.userModel.release(user.id);
    if (isReleased) await this.summaryService.moveValue("restrictedUser", "activeUser");
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
    else await this.userModel.setPasswordInActiveUser(user.id, password);
  }
  async setPhone(userId: string, phone: string) {
    const user = await this.userModel.getUser(userId);
    if (user.status === "prepare") await this.userModel.setPhoneInPrepareUser(user.id, phone);
    else await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  async getAccessTokenByAdmin(userId: string) {
    const user = await this.userModel.getUser(userId);
    return this.securityService.addJwt({ self: await this.makeSelf(user) });
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
  //*====================== Admin Control Area ======================*//
  //*================================================================*//

  //*================================================================*//
  //*====================== Public Setup Area =======================*//
  async setNicknameOfPrepareUser(userId: string, nickname: string) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setNickname(user.id, nickname);
  }
  async setAppliedImagesOfPrepareUser(userId: string, appliedImages: string[]) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setAppliedImages(user.id, appliedImages);
  }
  //*====================== Admin Control Area ======================*//
  //*================================================================*//

  //*================================================================*//
  //*====================== Secret Setup Area =======================*//
  async setNameOfPrepareUser(userId: string, name: string) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setName(user.id, name);
  }
  async setAgreePoliciesOfPrepareUser(userId: string, agreePolicies: string[]) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setAgreePolicies(user.id, agreePolicies);
  }
  async setDiscordOfPrepareUser(userId: string, discord: { nickname?: string; user?: { username: string } }) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setDiscord(user.id, discord);
  }
  async setNotiSettingOfUser(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    const user = await this.getUser(userId);
    await this.userModel.setNotiSetting(user.id, notiSetting);
  }
  async addNotiDeviceTokenOfUser(userId: string, notiDeviceToken: string) {
    const user = await this.getUser(userId);
    await this.userModel.addNotiDeviceToken(user.id, notiDeviceToken);
  }
  async subNotiDeviceTokenOfUser(userId: string, notiDeviceToken: string) {
    const user = await this.getUser(userId);
    await this.userModel.subNotiDeviceToken(user.id, notiDeviceToken);
  }
  //*====================== Secret Setup Area ======================*//
  //*================================================================*//

  async setRemoteAuthToken(remoteId: string, account: Account) {
    const { jwt } = this.securityService.sign(account);
    await this.userModel.setRemoteAuthToken(remoteId, jwt);
  }
  async getRemoteAuthToken(remoteId: string) {
    return await this.userModel.getRemoteAuthToken(remoteId);
  }
}
