import type { Me, Self } from "@libs/shared/common";
import { safeRedirectPath, withRedirectQuery } from "@libs/shared/common";
import {
  type AuthTokenMeta,
  NativeSso,
  type NativeSsoIdentity,
  type NativeSsoResult,
  type NativeSsoStart,
  RevokedSessions,
  type RotateRefreshSessionOptions,
  SignupToken,
  type SsoCookie,
  type SsoIdentity,
  ssoSessionCookies,
} from "@libs/shared/srvkit";
import { createOpaqueToken, EmailApi, hashToken, PurpleApi } from "@libs/util/srvkit";
import { type Dayjs, dayjs } from "akanjs/base";
import { isEmail } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { OAuthPkce } from "akanjs/server";
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

export class UserService extends serve(db.user, ({ use, service, env, plug, memory }) => ({
  adminService: service<srv.AdminService>(),
  fileService: service<srv.FileService>(),
  securityService: service<srv.util.SecurityService>(),
  settingService: service<srv.SettingService>(),
  summaryService: service<srv.SummaryService>(),
  host: use<string>(),
  jwtSecret: use<string>(),
  emailApi: plug(EmailApi),
  purpleApi: plug(PurpleApi),
  signupPolicy: use<option.SignupPolicy>(),
  nativeSsoPolicy: use<option.NativeSsoPolicy>(),
  ssoStarts: memory(Map, { of: cnst.SsoHandoff }),
  ssoCodes: memory(Map, { of: cnst.SsoHandoff }),
  masterPhones: env(() => process.env.MASTER_PHONES?.split(",") ?? []),
  masterPhoneCode: env(() => process.env.MASTER_PHONECODE),
  masterEmailCode: env(() => process.env.MASTER_EMAILCODE),
})) {
  override async _preRemove(id: string) {
    await this.userModel.recordLeave(await this.userModel.getLeaveKeys(id));
  }
  override async _postRemove(user: db.User) {
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
    if (!me || !meSid || (await RevokedSessions.has(meSid))) return {};
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
  async setNickname(userId: string, nickname: string) {
    const user = await this.getUser(userId);
    return await user.rename(nickname).save();
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
    if (await this.userModel.isSigninLocked(accountId)) throw new Err("user.error.tooManySigninAttempts");
    const user =
      (await this.userModel.consumeResetPassword(accountId, password)) ??
      (await this.userModel.findUserByPassword(accountId, password));
    if (!user) {
      await this.userModel.failSignin(accountId);
      throw new Err("user.error.invalidCredentials");
    }
    await this.userModel.clearSigninFailures(accountId);
    return await this._issueUserToken(await this._assertSignable(user), account);
  }
  // The device leaves with the session: a phone handed to the next person must not keep this account's pushes.
  async signoutUser(account: Account<{ self?: Self } & AuthTokenMeta>, pushDeviceId: string | null = null) {
    if (!account.self) return { jwt: "" };
    await this.userModel.revokeRefreshSession(account.self.id, account.selfSid ?? account.sid);
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
    return await this.userModel.setSignToken(user.id, "password");
  }
  async setPasswordWithSignToken(userId: string, password: string, signToken: string) {
    if ((await this.userModel.consumeSignToken("password", signToken)) !== userId)
      throw new Err("user.error.invalidSignToken");
    await this.userModel.setPasswordInActiveUser(userId, password);
    await this.userModel.revokeRefreshSessions(userId);
  }
  async resetPassword(accountId: string): Promise<boolean> {
    const user = await this.userModel.pickByAccountId(accountId, ["active"]);
    const isResetable = await this.userModel.isResetable(user.id);
    if (!isResetable) throw new Err("user.error.resetRetryLater");
    const password = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    if (!(await this.emailApi.sendPasswordResetMail(accountId, password, this.host)))
      throw new Err("user.error.resetMailFailed");
    await this.userModel.setResetPassword(user.id, password);
    await this.userModel.logResetTime(user.id);
    return true;
  }
  async requestEmailCodeInPrepareUser(userId: string) {
    const user = await this.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    await this._sendEmailCode(user.id, accountId);
  }
  /*
   * 인증을 통과하면 서명 토큰을 내준다. 다음 단계(비밀번호 설정)가 이 토큰을 되돌려 줘야 통과하므로,
   * 화면을 건너뛰고 엔드포인트를 직접 부르는 것으로는 메일 인증을 우회할 수 없다.
   */
  async verifyEmailInPrepareUser(userId: string, emailCode: string) {
    const user = await this.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    const isValid = await this.userModel.isEmailCodeValid(user.id, accountId, emailCode);
    if (!isValid) throw new Err("user.error.invalidEmailCode");
    await this.userModel.verifyEmailInPrepareUser(user.id, accountId);
    return await this.userModel.setSignToken(user.id, "password");
  }
  async setPasswordInPrepareUserWithSignToken(userId: string, password: string, signToken: string) {
    const user = await this.getPrepareUser(userId);
    if ((await this.userModel.consumeSignToken("password", signToken)) !== user.id)
      throw new Err("user.error.invalidSignToken");
    const accountId = await this.userModel.getAccountId(user.id);
    await this.userModel.setPasswordInPrepareUser(user.id, accountId, password);
  }
  /*
   * 사용자가 직접 새 비밀번호를 정하는 재설정. 위의 `resetPassword` 는 임시 비밀번호를 메일로 쏘는
   * 다른 흐름이라 섞지 않는다 — 그쪽은 메일을 한 번 보는 것만으로 계정이 넘어간다.
   *
   * 계정이 없어도 같은 응답을 주고 아무것도 보내지 않는다. 오류로 갈라 주면 이 엔드포인트가 곧
   * "이 메일이 가입돼 있는가" 를 묻는 조회창이 된다.
   */
  async requestEmailCodeForResetPassword(accountId: string) {
    const userId = await this.userModel.findIdByAccountId(accountId, ["active"]);
    if (!userId) return;
    await this._sendEmailCode(userId, accountId);
  }
  async verifyEmailCodeForResetPassword(accountId: string, emailCode: string) {
    const userId = await this.userModel.findIdByAccountId(accountId, ["active"]);
    if (!userId) throw new Err("user.error.invalidEmailCode");
    const isValid = await this.userModel.isEmailCodeValid(userId, accountId, emailCode);
    if (!isValid) throw new Err("user.error.invalidEmailCode");
    return await this.userModel.setSignToken(userId, "password");
  }
  async resetPasswordWithSignToken(accountId: string, password: string, signToken: string) {
    const user = await this.userModel.pickByAccountId(accountId, ["active"]);
    if ((await this.userModel.consumeSignToken("password", signToken)) !== user.id)
      throw new Err("user.error.invalidSignToken");
    await this.userModel.setPasswordInActiveUser(user.id, password);
    // 비밀번호가 바뀌면 남아 있던 세션은 전부 끊는다 — 탈취당한 쪽이 계속 들어와 있으면 재설정이 무의미하다.
    await this.userModel.revokeRefreshSessions(user.id);
  }
  private async _sendEmailCode(userId: string, accountId: string) {
    if (!isEmail(accountId)) throw new Err("user.error.invalidAccountId");
    const dryrun = this._isMasterEmail(accountId);
    const emailCode = dryrun && this.masterEmailCode ? this.masterEmailCode : this._generateCode();
    await this.userModel.registerEmailCode(userId, accountId, emailCode);
    if (!dryrun) await this.emailApi.sendVerificationCodeMail(accountId, emailCode, this.host);
  }
  // Reserved test domains (RFC 2606) cannot receive mail, so the master code can never vouch for a real mailbox.
  private _isMasterEmail(accountId: string) {
    return !!this.masterEmailCode && /\.(test|example|invalid|localhost)$/i.test(accountId.split("@")[1] ?? "");
  }
  private _generateCode() {
    for (;;) {
      const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      //? 4_294_000_000 is the largest multiple of 1_000_000 below 2^32; redrawing above it keeps every code equally likely.
      if (value < 4_294_000_000) return String(value % 1_000_000).padStart(6, "0");
    }
  }

  async userExistsHasPhone(phone: string) {
    return !!(await this.userModel.findIdByPhone(phone, ["active", "dormant", "restricted"]));
  }
  async _getUserIdByPhone(phone: string) {
    const userId = await this.userModel.findIdByPhone(phone, ["active", "dormant", "restricted"]);
    if (!userId) throw new Err("user.error.invalidPhoneNumber");
    return userId;
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
  // The code goes to the new number, so only its holder can move the account onto it.
  async requestPhoneCodeForChangePhone(userId: string, phone: string, hash: string) {
    const user = await this.getActiveUser(userId);
    if (await this.userExistsHasPhone(phone)) throw new Err("user.error.phoneAlreadyExists");
    await this._registerPhoneCode(user.id, phone, "setPhoneInActiveUser", hash);
  }
  async setPhoneInActiveUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.getActiveUser(userId);
    const isValid = await this.userModel.isPhoneCodeValid(user.id, phone, "setPhoneInActiveUser", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  // The code goes only to the number already on an account; the caller never learns whose account it is.
  async requestPhoneCodeForSignin(phone: string, hash: string) {
    await this._registerPhoneCode(await this._getUserIdByPhone(phone), phone, "signinWithSignToken", hash);
  }
  async getSignTokenForSignin(phone: string, phoneCode: string) {
    const userId = await this._getUserIdByPhone(phone);
    const isValid = await this.userModel.isPhoneCodeValid(userId, phone, "signinWithSignToken", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.userModel.setSignToken(userId, "signin");
  }

  // A text costs money and lands on someone's phone, so a number takes a bounded number of them a day.
  private async _registerPhoneCode(userId: string, phone: string, purpose: string, hash: string) {
    const user = await this.userModel.getUser(userId);
    if (!(await this.userModel.takeSendSlot("phoneCodeSends", phone, 10)))
      throw new Err("user.error.tooManyPhoneCodes");
    const dryrun = this.masterPhones.includes(phone);
    const phoneCode = dryrun && this.masterPhoneCode ? this.masterPhoneCode : this._generateCode();
    await this.userModel.registerPhoneCode(user.id, phone, purpose, phoneCode);
    // `hash` is appended to the text as-is for Android's SMS Retriever, which only ever needs an 11-char app hash.
    const appHash = /^[A-Za-z0-9+/]{1,11}$/.test(hash) ? hash : "";
    if (!dryrun) await this.purpleApi.sendPhoneCode(phone, phoneCode, appHash);
  }
  async signinWithSignToken(signToken: string, account?: Account) {
    const userId = await this.userModel.consumeSignToken("signin", signToken);
    if (!userId) throw new Err("user.error.invalidSignToken");
    return await this._issueUserToken(await this._assertSignable(await this.getUser(userId)), account);
  }

  async handleSsoCallback(
    identity: SsoIdentity,
    ssoType: cnst.SsoType["value"],
    ssoCookie: SsoCookie,
    account?: Account,
  ): Promise<{ cookie?: { [key: string]: string }; redirect: string }> {
    if (ssoCookie.ssoFor === "admin") {
      const accessToken = await this.adminService.ssoSigninAdmin(identity.accountId, account);
      return {
        cookie: ssoSessionCookies(accessToken.jwt, accessToken.refreshToken ?? "", "admin"),
        redirect: safeRedirectPath(ssoCookie.adminRedirect, "/admin"),
      };
    }
    const signin = await this._resolveSsoUser(identity, ssoType, { account, signupToken: ssoCookie.signupToken });
    if (signin.prepareUserId)
      return {
        cookie: { signupToken: signin.signupToken ?? "" },
        redirect: withRedirectQuery(safeRedirectPath(ssoCookie.signupRedirect, "/"), { userId: signin.prepareUserId }),
      };
    return {
      cookie: ssoSessionCookies(signin.jwt ?? "", signin.refreshToken ?? "", "user"),
      redirect: safeRedirectPath(ssoCookie.signinRedirect, "/"),
    };
  }
  async startNativeSso(ssoType: cnst.SsoType["value"], start: NativeSsoStart): Promise<string> {
    if (!this.nativeSsoPolicy.callbackSchemes.includes(start.callbackScheme))
      throw new Err("user.error.ssoCallbackSchemeNotAllowed", { scheme: start.callbackScheme });
    const state = createOpaqueToken();
    const expiresAt = dayjs().add(NativeSso.startMinutes, "minute");
    await this.ssoStarts.set(hashToken(state), new cnst.SsoHandoff().set({ ssoType, ...start, expiresAt }), {
      expireAt: expiresAt,
    });
    return state;
  }
  async takeNativeSso(state: string | null) {
    if (!state) return null;
    return (await this.ssoStarts.getDel(hashToken(state))) ?? null;
  }
  async handOffNativeSso(start: cnst.SsoHandoff, identify: () => Promise<NativeSsoIdentity>): Promise<NativeSsoResult> {
    try {
      const { accountId, nickname, legacyAccountId } = await identify();
      const code = createOpaqueToken();
      const expiresAt = dayjs().add(NativeSso.codeSeconds, "second");
      const handoff = new cnst.SsoHandoff().set(start).set({ accountId, nickname, legacyAccountId, expiresAt });
      await this.ssoCodes.set(hashToken(code), handoff, { expireAt: expiresAt });
      return { code };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  async exchangeNativeSsoCode(code: string, codeVerifier: string, account?: Account): Promise<cnst.SsoSignin> {
    const handoff = await this.ssoCodes.getDel(hashToken(code));
    if (
      !handoff?.accountId ||
      dayjs(handoff.expiresAt).isBefore(dayjs()) ||
      !OAuthPkce.verify(codeVerifier, handoff.codeChallenge)
    )
      throw new Err("user.error.invalidSsoCode");
    const identity = {
      accountId: handoff.accountId,
      nickname: handoff.nickname ?? "",
      legacyAccountId: handoff.legacyAccountId ?? undefined,
    };
    return await this._resolveSsoUser(identity, handoff.ssoType, { account });
  }
  protected async _resolveSsoUser(
    { accountId, nickname, legacyAccountId }: SsoIdentity,
    ssoType: cnst.SsoType["value"],
    { account, signupToken }: { account?: Account; signupToken?: string | null } = {},
  ): Promise<cnst.SsoSignin> {
    if (legacyAccountId) await this.userModel.renameSsoAccountId(legacyAccountId, accountId, ssoType);
    const userId = await this.userModel.findIdByAccountId(accountId, ["active", "restricted", "dormant"]);
    if (userId) {
      const user = await this._assertSignable(await this.userModel.getActiveUserBySso(accountId, ssoType));
      const { jwt, refreshToken } = await this._issueUserToken(user, account);
      return new cnst.SsoSignin().set({ jwt, refreshToken });
    }
    const { userId: prepareUserId, signupToken: nextSignupToken } = await this.openSignup(signupToken);
    const user = await this.getPrepareUser(prepareUserId);
    await this.userModel.setSsoInPrepareUser(user.id, accountId, ssoType);
    // 가입 화면에서 닉네임을 따로 받지 않는다 — SSO 프로필 이름을 그대로 쓰고, 비면 계정 아이디나 SSO 종류에서 만든다.
    if (!user.nickname)
      await this.userModel.setNickname(
        user.id,
        await this.userModel.makeUniqueNickname(nickname || (isEmail(accountId) ? accountId : ssoType)),
      );
    return new cnst.SsoSignin().set({ prepareUserId: user.id, signupToken: nextSignupToken });
  }

  async activateUser(userId: string, account?: Account) {
    const user = await this.getPrepareUser(userId);
    const { activateVerifies } = this.signupPolicy;
    if (activateVerifies.length && !user.verifies.some((verify) => activateVerifies.includes(verify)))
      throw new Err("user.error.signupNotVerified");
    await user.set({ status: "active" }).save();
    await this.summaryService.moveValue("prepareUser", "activeUser");
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
    await this.userModel.setNickname(user.id, nickname);
  }
  async setAppliedImagesOfPrepareUser(userId: string, appliedImages: string[]) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setAppliedImages(user.id, appliedImages);
  }

  async setNameOfPrepareUser(userId: string, name: string) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setName(user.id, name);
  }
  async setAgreePoliciesOfPrepareUser(userId: string, agreePolicies: string[]) {
    const user = await this.getPrepareUser(userId);
    await this.userModel.setAgreePolicies(user.id, agreePolicies);
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
  async subNotiDeviceTokensOfUser(userId: string, notiDeviceTokens: string[]) {
    return await this.userModel.subNotiDeviceTokens(userId, notiDeviceTokens);
  }
}
