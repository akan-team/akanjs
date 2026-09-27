import type { Self } from "@libs/shared/common";
import { withRedirectQuery } from "@libs/shared/common";
import {
  type AuthTokenMeta,
  type RotateRefreshSessionOptions,
  type SsoCookie,
  ssoSessionCookies,
} from "@libs/shared/srvkit";
import type { EmailApi, PurpleApi } from "@libs/util/srvkit";
import type { Dayjs } from "akanjs/base";
import { isEmail } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { serve } from "akanjs/service";
import type * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";
import type * as option from "../option";
import type * as srv from "../srv";

export class UserService extends serve(db.user, ({ use, service, env }) => ({
  adminService: service<srv.AdminService>(),
  fileService: service<srv.FileService>(),
  securityService: service<srv.util.SecurityService>(),
  settingService: service<srv.SettingService>(),
  summaryService: service<srv.SummaryService>(),
  host: use<string>(),
  emailApi: use<EmailApi>(),
  purpleApi: use<PurpleApi>(),
  signupPolicy: use<option.SignupPolicy>(),
  masterPhones: env(() => process.env.MASTER_PHONES?.split(",") ?? []),
  masterPhoneCode: env(() => process.env.MASTER_PHONECODE),
  masterEmailCode: env(() => process.env.MASTER_EMAILCODE),
})) {
  override async _postRemove(user: db.User) {
    await this.userModel.revokeRefreshSessions(user.id);
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
  protected _stripTokenMeta(account: Partial<Account> = {}) {
    const { exp, iat, jti, sid, tokenType, ...rest } = account as Account & AuthTokenMeta;
    return rest;
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
      { ...this._stripTokenMeta(account), self },
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
    const user = await this.getActiveUser(session.subjectId);
    const self = await this.makeSelf(user);
    const accessToken = await this.securityService.signAccessToken(
      { ...this._stripTokenMeta(account), self },
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
    return await this.userModel.generatePrepareUser(userId);
  }
  async getAccountId<Throw extends boolean = true>(
    userId: string,
    throwError: Throw = true as Throw,
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
  async signinWithPassword(accountId: string, password: string, account: Account): Promise<db.util.AccessToken> {
    const user =
      (await this.userModel.consumeResetPassword(accountId, password)) ??
      (await this.userModel.getUserByPassword(accountId, password));
    if (user.status !== "active") throw new Err("user.error.userNotActivated");
    return await this._issueUserToken(user, account);
  }
  // The device leaves with the session: a phone handed to the next person must not keep this account's pushes.
  async signoutUser(account: Account<{ self?: Self; sid?: string }>, pushDeviceId: string | null = null) {
    if (!account.self) return { jwt: "" };
    await this.userModel.revokeRefreshSession(account.self.id, account.sid);
    if (pushDeviceId) await this.userModel.subNotiDevice(account.self.id, pushDeviceId);
    return { jwt: "" };
  }
  async changePassword(userId: string, password: string, prevPassword: string) {
    const accountId = await this.userModel.getAccountId(userId);
    const user = await this.userModel.getUserByPassword(accountId, prevPassword);
    await this.userModel.setPasswordInActiveUser(user.id, password);
    await this.userModel.revokeRefreshSessions(user.id);
    return user;
  }
  async requestPhoneCodeForSetPassword(userId: string, phone: string, hash: string) {
    const user = await this.getActiveUser(userId);
    await this.userModel.assertPhoneOfUser(user.id, phone);
    await this._registerPhoneCode(user.id, phone, "setPasswordWithSignToken", hash);
  }
  async getSignTokenForSetPassword(userId: string, phone: string, phoneCode: string) {
    const user = await this.userModel.getUser(userId);
    await this.userModel.assertPhoneOfUser(user.id, phone);
    const isValid = await this.userModel.isPhoneCodeValid(user.id, phone, "setPasswordWithSignToken", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    const signToken = await this.userModel.setSignToken(user.id);
    return signToken;
  }
  async setPasswordWithSignToken(userId: string, password: string, signToken: string) {
    const isVerified = await this.userModel.verifySignToken(userId, signToken);
    if (!isVerified) throw new Err("user.error.invalidSignToken");
    await this.userModel.setPasswordInActiveUser(userId, password);
    await this.userModel.revokeRefreshSessions(userId);
  }
  async resetPassword(accountId: string): Promise<boolean> {
    const user = await this.userModel.pickByAccountId(accountId, ["active"]);
    const isResetable = await this.userModel.isResetable(user.id);
    if (!isResetable) throw new Err("user.error.resetRetryLater");
    const password = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    await this.userModel.setResetPassword(user.id, password);
    await this.emailApi.sendPasswordResetMail(accountId, password, this.host);
    await this.userModel.logResetTime(user.id);
    return true;
  }
  async requestEmailCodeInPrepareUser(userId: string) {
    const user = await this.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    if (!isEmail(accountId)) throw new Err("user.error.invalidAccountId");
    const dryrun = this._isMasterEmail(accountId);
    const emailCode = dryrun && this.masterEmailCode ? this.masterEmailCode : this._generateCode();
    await this.userModel.registerEmailCode(user.id, accountId, emailCode);
    if (!dryrun) await this.emailApi.sendVerificationCodeMail(accountId, emailCode, this.host);
  }
  async verifyEmailInPrepareUser(userId: string, emailCode: string) {
    const user = await this.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    const isValid = await this.userModel.isEmailCodeValid(user.id, accountId, emailCode);
    if (!isValid) throw new Err("user.error.invalidEmailCode");
    await this.userModel.verifyEmailInPrepareUser(user.id, accountId);
  }
  // Reserved test domains (RFC 2606) cannot receive mail, so the master code can never vouch for a real mailbox.
  private _isMasterEmail(accountId: string) {
    return !!this.masterEmailCode && /\.(test|example|invalid|localhost)$/i.test(accountId.split("@")[1] ?? "");
  }
  private _generateCode() {
    return String((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1_000_000).padStart(6, "0");
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
    await this._registerPhoneCode(user.id, phone, "setPhoneInPrepareUser", hash);
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.getPrepareUser(userId);
    const isValid = await this.userModel.isPhoneCodeValid(userId, phone, "setPhoneInPrepareUser", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.userModel.verifyPhoneInPrepareUser(user.id, phone);
  }
  async setPhoneInActiveUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.getActiveUser(userId);
    return await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  // The code goes only to the number already on the account; a caller-chosen number would sign in as anyone.
  async requestPhoneCodeForSignin(userId: string, phone: string, hash: string) {
    const user = await this.getActiveUser(userId);
    await this.userModel.assertPhoneOfUser(user.id, phone);
    await this._registerPhoneCode(user.id, phone, "signinWithSignToken", hash);
  }
  async getSignTokenForSignin(userId: string, phone: string, phoneCode: string) {
    const user = await this.getActiveUser(userId);
    await this.userModel.assertPhoneOfUser(user.id, phone);
    const isValid = await this.userModel.isPhoneCodeValid(user.id, phone, "signinWithSignToken", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    const signToken = await this.userModel.setSignToken(user.id);
    return signToken;
  }
  //*====================== Phone Signing Area ======================*//
  //*================================================================*//

  //*========================================================================*//
  //*====================== SignToken Signing Area =======================*//
  private async _registerPhoneCode(userId: string, phone: string, purpose: string, hash: string) {
    const user = await this.userModel.getUser(userId);
    const dryrun = this.masterPhones.includes(phone);
    const phoneCode = dryrun && this.masterPhoneCode ? this.masterPhoneCode : this._generateCode();
    await this.userModel.registerPhoneCode(user.id, phone, purpose, phoneCode);
    // `hash` is appended to the text as-is for Android's SMS Retriever, which only ever needs an 11-char app hash.
    const appHash = /^[A-Za-z0-9+/]{1,11}$/.test(hash) ? hash : "";
    if (!dryrun) await this.purpleApi.sendPhoneCode(phone, phoneCode, appHash);
  }
  async signinWithSignToken(userId: string, signToken: string, account?: Account) {
    const user = await this.userModel.getUser(userId);
    const isVerified = await this.userModel.verifySignToken(user.id, signToken);
    if (!isVerified) throw new Err("user.error.invalidSignToken");
    return await this._issueUserToken(user, account);
  }
  //*====================== SignToken Signing Area =======================*//
  //*========================================================================*//

  //*================================================================*//
  //*======================= SSO Signing Area =======================*//
  async handleSsoCallback(
    accountId: string,
    ssoType: cnst.SsoType["value"],
    ssoCookie: SsoCookie,
    account?: Account,
    ssoNickname?: string,
  ): Promise<{ cookie?: { [key: string]: string }; redirect: string }> {
    const { prepareUserId, ssoFor, signinRedirect, signupRedirect, adminRedirect, errorRedirect } = ssoCookie;
    try {
      if (ssoFor === "admin") {
        const accessToken = await this.adminService.ssoSigninAdmin(accountId, account);
        return {
          cookie: ssoSessionCookies(accessToken.jwt, accessToken.refreshToken ?? "", "admin"),
          redirect: adminRedirect ?? "/admin",
        };
      } else {
        const userId = await this.userModel.findIdByAccountId(accountId, ["active", "restricted", "dormant"]);
        if (userId) {
          const user = await this.userModel.getActiveUserBySso(accountId, ssoType);
          const accessToken = await this._issueUserToken(user, account);
          return {
            cookie: ssoSessionCookies(accessToken.jwt, accessToken.refreshToken ?? "", "user"),
            redirect: signinRedirect,
          };
        } else {
          const user = await this.generatePrepareUser(prepareUserId);
          await this.userModel.setSsoInPrepareUser(user.id, accountId, ssoType);
          // 가입 화면에서 닉네임을 따로 받지 않는다 — SSO 프로필 이름을 그대로 쓰고, 비면 계정 아이디에서 만든다.
          if (!user.nickname) {
            const nickname = await this.userModel.makeUniqueNickname(ssoNickname || accountId);
            await this.userModel.setNickname(user.id, nickname);
          }
          return { redirect: withRedirectQuery(signupRedirect, { userId: user.id }) };
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
    const { activateVerifies } = this.signupPolicy;
    if (activateVerifies.length && !user.verifies.some((verify) => activateVerifies.includes(verify)))
      throw new Err("user.error.signupNotVerified");
    await user.set({ status: "active" }).save();
    await this.summaryService.moveValue("prepareUser", "activeUser");
    return await this._issueUserToken(user, account);
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
  //*====================== Secret Setup Area ======================*//
  //*================================================================*//
}
