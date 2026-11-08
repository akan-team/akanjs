import { safeRedirectPath, withRedirectQuery } from "@libs/shared/common";
import {
  isBcryptHash,
  isPasswordMatch,
  NativeSso,
  type NativeSsoIdentity,
  type NativeSsoResult,
  type NativeSsoStart,
  SignChallenge,
  SignupToken,
  type SsoCookie,
  type SsoIdentity,
  ssoSessionCookies,
} from "@libs/shared/srvkit";
import { createOpaqueToken, EmailApi, hashToken, PurpleApi } from "@libs/util/srvkit";
import { dayjs, getEnv } from "akanjs/base";
import { isEmail } from "akanjs/common";
import type { Account } from "akanjs/fetch";
import { OAuthPkce } from "akanjs/server";
import { serve } from "akanjs/service";

import * as cnst from "../cnst";
import type * as db from "../db";
import { Err } from "../dict";
import type * as option from "../option";
import type * as srv from "../srv";

export class SignService extends serve("sign" as const, ({ use, service, env, plug, memory }) => ({
  adminService: service<srv.AdminService>(),
  settingService: service<srv.SettingService>(),
  userService: service<srv.UserService>(),
  host: use<string>(),
  hosts: use<string[]>(),
  emailApi: plug(EmailApi),
  purpleApi: plug(PurpleApi),
  nativeSsoPolicy: use<option.NativeSsoPolicy>(),
  ssoStarts: memory(Map, { of: cnst.SsoHandoff }),
  ssoCodes: memory(Map, { of: cnst.SsoHandoff }),
  masterPhones: env(() => process.env.MASTER_PHONES?.split(",") ?? []),
  masterPhoneCode: env(() => process.env.MASTER_PHONECODE),
  masterEmailCode: env(() => process.env.MASTER_EMAILCODE),
})) {
  //? A master number skips the text and takes a fixed code, so anywhere but a local or testing run it would prove a
  //? phone nobody holds.
  static honoursMasterPhones() {
    const { operationMode, environment } = getEnv();
    return operationMode === "local" || environment === "testing";
  }
  override onInit() {
    if (!SignService.honoursMasterPhones() && (this.masterPhones.some(Boolean) || this.masterPhoneCode))
      this.logger.warn("MASTER_PHONES and MASTER_PHONECODE are set but ignored outside a local or testing run");
  }
  private get userModel() {
    return this.userService.userModel;
  }
  private get challenge() {
    return this.userService.userModel.signChallenge;
  }
  //? `<provider>:<id>` is how SSO rows are keyed, so a typed id in that shape would take a provider sign-up's place.
  static assertSignupAccountId(accountId: string) {
    if (!isEmail(accountId) || accountId.includes(":")) throw new Err("user.error.signupAccountIdNotEmail");
  }
  async setAccountIdInPrepareUser(userId: string, accountId: string) {
    SignService.assertSignupAccountId(accountId);
    const setting = await this.settingService.getActiveSetting();
    const user = await this.userService.getPrepareUser(userId);
    await this.userModel.setAccountIdInPrepareUser(user.id, accountId, setting.resignupDays);
  }
  // The draft and its id land together; the code is mailed after, so a mail failure still reaches the caller.
  async openSignupWithAccountId(accountId: string, requestEmailCode: boolean) {
    SignService.assertSignupAccountId(accountId);
    const setting = await this.settingService.getActiveSetting();
    const ticket = await this.transaction(async () => {
      const opened = await this.userService.openSignup(null);
      await this.userModel.setAccountIdInPrepareUser(opened.userId, accountId, setting.resignupDays);
      return opened;
    });
    if (requestEmailCode) await this.requestEmailCodeInPrepareUser(ticket.userId);
    return ticket;
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    const user = await this.userService.getPrepareUser(userId);
    await this.userModel.setPasswordInPrepareUser(user.id, accountId, password);
  }
  async signinWithPassword(
    accountId: string,
    password: string,
    account: Account,
    ip: string | null = null,
  ): Promise<db.util.AccessToken> {
    if (await this.challenge.isSigninLocked(accountId, ip)) throw new Err("user.error.tooManySigninAttempts");
    const user =
      (await this.signinWithResetPassword(accountId, password)) ?? (await this.findUserByPassword(accountId, password));
    if (!user) {
      await this.challenge.failSignin(accountId, ip);
      throw new Err("user.error.invalidCredentials");
    }
    await this.challenge.clearSigninFailures(accountId, ip);
    return await this.userService._issueUserToken(await this.userService._assertSignable(user), account);
  }
  private async signinWithResetPassword(accountId: string, password: string) {
    const userId = await this.userModel.findIdByAccountId(accountId, ["active"]);
    if (!userId || !(await this.challenge.consumeResetPassword(userId, password))) return null;
    await this.userModel.setPasswordInActiveUser(userId, password);
    await this.userModel.revokeRefreshSessions(userId);
    return await this.userModel.getUser(userId);
  }
  // Every miss looks the same to the caller, so a sign-in cannot tell which account ids exist.
  private async findUserByPassword(accountId: string, password: string) {
    const auth = (await this.userModel.findByAccountId(accountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, password: true },
    })) as { id: string; password?: string } | null;
    const isMatch = await SignChallenge.isStoredPasswordMatch(password, auth?.password);
    if (!auth?.password || !isMatch) return null;
    //? Skips the length rule: a password stored before hashing may predate it, and this sign-in just proved it.
    if (!isBcryptHash(auth.password)) await this.userModel.storePassword(auth.id, password);
    return await this.userModel.getUser(auth.id);
  }
  async changePassword(userId: string, password: string, prevPassword: string) {
    const accountId = await this.userModel.getAccountId(userId);
    const user = await this.getUserByPassword(accountId, prevPassword);
    await this.userModel.setPasswordInActiveUser(user.id, password);
    await this.userModel.revokeRefreshSessions(user.id);
    return user;
  }
  private async getUserByPassword(accountId: string, password: string) {
    const auth = (await this.userModel.findByAccountId(accountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, password: true },
    })) as { accountId: string; password: string } | null;
    if (!auth) throw new Err("user.error.noAccount");
    if (!auth.accountId) throw new Err("user.error.noAccountIdInUser");
    if (!auth.password) throw new Err("user.error.noPasswordInUser");
    if (!(await isPasswordMatch(password, auth.password))) throw new Err("user.error.wrongPassword");
    return await this.userModel.pickByAccountId(accountId);
  }
  async requestPhoneCodeForSetPassword(userId: string, phone: string, hash: string) {
    const user = await this.userService.getActiveUser(userId);
    await this.assertPhoneOfUser(user.id, phone);
    await this.registerPhoneCode(user.id, phone, "setPasswordWithSignToken", hash);
  }
  async getSignTokenForSetPassword(userId: string, phone: string, phoneCode: string) {
    const user = await this.userModel.getUser(userId);
    await this.assertPhoneOfUser(user.id, phone);
    const isValid = await this.challenge.isPhoneCodeValid(user.id, phone, "setPasswordWithSignToken", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.challenge.setSignToken(user.id, "password");
  }
  private async assertPhoneOfUser(userId: string, phone: string) {
    const { phone: storedPhone } = (await this.userModel.User.pickById(userId, { phone: true })) as { phone?: string };
    if (!storedPhone || storedPhone !== phone) throw new Err("user.error.invalidPhoneNumber");
  }
  async setPasswordWithSignToken(userId: string, password: string, signToken: string) {
    if ((await this.challenge.consumeSignToken("password", signToken)) !== userId)
      throw new Err("user.error.invalidSignToken");
    await this.userModel.setPasswordInActiveUser(userId, password);
    await this.userModel.revokeRefreshSessions(userId);
  }
  //? An unknown account and a reset asked again within three minutes answer like a sent mail, so neither tells the
  //? caller whether the account exists; the earlier mail's password still works.
  async resetPassword(accountId: string): Promise<boolean> {
    const userId = await this.userModel.findIdByAccountId(accountId, ["active"]);
    if (!userId || !(await this.challenge.isResetable(userId))) return true;
    const password = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    if (!(await this.emailApi.sendPasswordResetMail(accountId, password, this.host)))
      throw new Err("user.error.resetMailFailed");
    await this.challenge.setResetPassword(userId, password);
    await this.challenge.logResetTime(userId);
    return true;
  }
  async requestEmailCodeInPrepareUser(userId: string) {
    const user = await this.userService.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    if (!(await this.sendEmailCode(user.id, accountId))) throw new Err("user.error.emailCodeMailFailed");
  }
  /*
   * 인증을 통과하면 서명 토큰을 내준다. 다음 단계(비밀번호 설정)가 이 토큰을 되돌려 줘야 통과하므로,
   * 화면을 건너뛰고 엔드포인트를 직접 부르는 것으로는 메일 인증을 우회할 수 없다.
   */
  async verifyEmailInPrepareUser(userId: string, emailCode: string) {
    const user = await this.userService.getPrepareUser(userId);
    const accountId = await this.userModel.getAccountId(user.id);
    const isValid = await this.challenge.isEmailCodeValid(user.id, accountId, emailCode);
    if (!isValid) throw new Err("user.error.invalidEmailCode");
    await this.userModel.verifyEmailInPrepareUser(user.id, accountId);
    return await this.challenge.setSignToken(user.id, "password");
  }
  //? The code slot is the caller's own, apart from sign-up and reset, and names the address: one address, one account, once.
  async requestEmailCodeInActiveUser(userId: string, email: string) {
    const user = await this.userModel.getActiveUser(userId);
    const address = email.trim().toLowerCase();
    if (!(await this.sendEmailCode(user.id, address, "address"))) throw new Err("user.error.emailCodeMailFailed");
  }
  async verifyEmailInActiveUser(userId: string, email: string, emailCode: string) {
    const user = await this.userModel.getActiveUser(userId);
    const address = email.trim().toLowerCase();
    if (!(await this.challenge.isEmailCodeValid(user.id, address, emailCode, "address")))
      throw new Err("user.error.invalidEmailCode");
    await this.userModel.addVerifiedEmail(user.id, address);
  }
  async setPasswordInPrepareUserWithSignToken(userId: string, password: string, signToken: string) {
    const user = await this.userService.getPrepareUser(userId);
    if ((await this.challenge.consumeSignToken("password", signToken)) !== user.id)
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
    //? The result is not answered: an error only an existing account could raise would make this an account lookup.
    await this.sendEmailCode(userId, accountId);
  }
  async verifyEmailCodeForResetPassword(accountId: string, emailCode: string) {
    const userId = await this.userModel.findIdByAccountId(accountId, ["active"]);
    if (!userId) throw new Err("user.error.invalidEmailCode");
    const isValid = await this.challenge.isEmailCodeValid(userId, accountId, emailCode);
    if (!isValid) throw new Err("user.error.invalidEmailCode");
    return await this.challenge.setSignToken(userId, "password");
  }
  async resetPasswordWithSignToken(accountId: string, password: string, signToken: string) {
    const user = await this.userModel.pickByAccountId(accountId, ["active"]);
    if ((await this.challenge.consumeSignToken("password", signToken)) !== user.id)
      throw new Err("user.error.invalidSignToken");
    await this.userModel.setPasswordInActiveUser(user.id, password);
    // 비밀번호가 바뀌면 남아 있던 세션은 전부 끊는다 — 탈취당한 쪽이 계속 들어와 있으면 재설정이 무의미하다.
    await this.userModel.revokeRefreshSessions(user.id);
  }
  private async sendEmailCode(userId: string, accountId: string, purpose: "accountId" | "address" = "accountId") {
    if (!isEmail(accountId)) throw new Err("user.error.invalidAccountId");
    const dryrun = this.isMasterEmail(accountId);
    const emailCode = dryrun && this.masterEmailCode ? this.masterEmailCode : this.generateCode();
    await this.challenge.registerEmailCode(userId, accountId, emailCode, purpose);
    return dryrun || (await this.emailApi.sendVerificationCodeMail(accountId, emailCode, this.host));
  }
  // Reserved test domains (RFC 2606) cannot receive mail, so the master code can never vouch for a real mailbox.
  private isMasterEmail(accountId: string) {
    return !!this.masterEmailCode && /\.(test|example|invalid|localhost)$/i.test(accountId.split("@")[1] ?? "");
  }
  private generateCode() {
    for (;;) {
      const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      //? 4_294_000_000 is the largest multiple of 1_000_000 below 2^32; redrawing above it keeps every code equally likely.
      if (value < 4_294_000_000) return String(value % 1_000_000).padStart(6, "0");
    }
  }

  async userExistsHasPhone(phone: string) {
    return !!(await this.userModel.findIdByPhone(phone, ["active", "dormant", "restricted"]));
  }
  private async getUserIdByPhone(phone: string) {
    const userId = await this.userModel.findIdByPhone(phone, ["active", "dormant", "restricted"]);
    if (!userId) throw new Err("user.error.invalidPhoneNumber");
    return userId;
  }
  async setPhoneInPrepareUser(userId: string, phone: string, hash: string) {
    const setting = await this.settingService.getActiveSetting();
    const user = await this.userService.getPrepareUser(userId);
    await this.userModel.setPhoneInPrepareUser(user.id, phone, setting.resignupDays);
    await this.registerPhoneCode(user.id, phone, "setPhoneInPrepareUser", hash);
  }
  async startPhoneSign(phone: string, hash: string, signupToken?: string | null) {
    if (await this.userExistsHasPhone(phone)) {
      await this.requestPhoneCodeForSignin(phone, hash);
      return null;
    }
    const setting = await this.settingService.getActiveSetting();
    const ticket = await this.transaction(async () => {
      const opened = await this.userService.openSignup(signupToken);
      await this.userModel.setPhoneInPrepareUser(opened.userId, phone, setting.resignupDays);
      return opened;
    });
    await this.registerPhoneCode(ticket.userId, phone, "setPhoneInPrepareUser", hash);
    return ticket;
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.userService.getPrepareUser(userId);
    const isValid = await this.challenge.isPhoneCodeValid(userId, phone, "setPhoneInPrepareUser", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.userModel.verifyPhoneInPrepareUser(user.id, phone);
  }
  // The code goes to the new number, so only its holder can move the account onto it.
  async requestPhoneCodeForChangePhone(userId: string, phone: string, hash: string) {
    const user = await this.userService.getActiveUser(userId);
    if (await this.userExistsHasPhone(phone)) throw new Err("user.error.phoneAlreadyExists");
    await this.registerPhoneCode(user.id, phone, "setPhoneInActiveUser", hash);
  }
  async setPhoneInActiveUser(userId: string, phone: string, phoneCode: string) {
    const user = await this.userService.getActiveUser(userId);
    const isValid = await this.challenge.isPhoneCodeValid(user.id, phone, "setPhoneInActiveUser", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.userModel.setPhoneInActiveUser(user.id, phone);
  }
  // The code goes only to the number already on an account; the caller never learns whose account it is.
  async requestPhoneCodeForSignin(phone: string, hash: string) {
    await this.registerPhoneCode(await this.getUserIdByPhone(phone), phone, "signinWithSignToken", hash);
  }
  async getSignTokenForSignin(phone: string, phoneCode: string) {
    const userId = await this.getUserIdByPhone(phone);
    const isValid = await this.challenge.isPhoneCodeValid(userId, phone, "signinWithSignToken", phoneCode);
    if (!isValid) throw new Err("user.error.invalidPhoneCode");
    return await this.challenge.setSignToken(userId, "signin");
  }
  async signinWithPhoneCode(phone: string, phoneCode: string, account?: Account) {
    return await this.signinWithSignToken(await this.getSignTokenForSignin(phone, phoneCode), account);
  }

  // A text costs money and lands on someone's phone, so a number takes a bounded number of them a day.
  private async registerPhoneCode(userId: string, phone: string, purpose: string, hash: string) {
    const user = await this.userModel.getUser(userId);
    if (!(await this.challenge.takeSendSlot("phoneCodeSends", phone, 10)))
      throw new Err("user.error.tooManyPhoneCodes");
    const dryrun = SignService.honoursMasterPhones() && this.masterPhones.includes(phone);
    const phoneCode = dryrun && this.masterPhoneCode ? this.masterPhoneCode : this.generateCode();
    await this.challenge.registerPhoneCode(user.id, phone, purpose, phoneCode);
    // `hash` is appended to the text as-is for Android's SMS Retriever, which only ever needs an 11-char app hash.
    const appHash = /^[A-Za-z0-9+/]{1,11}$/.test(hash) ? hash : "";
    if (!dryrun) await this.purpleApi.sendPhoneCode(phone, phoneCode, appHash);
  }
  async signinWithSignToken(signToken: string, account?: Account) {
    const userId = await this.challenge.consumeSignToken("signin", signToken);
    if (!userId) throw new Err("user.error.invalidSignToken");
    const user = await this.userService._assertSignable(await this.userService.getUser(userId));
    return await this.userService._issueUserToken(user, account);
  }

  async handleSsoCallback(
    identity: SsoIdentity,
    ssoType: cnst.SsoType["value"],
    ssoCookie: SsoCookie,
    account?: Account,
  ): Promise<{ cookie?: { [key: string]: string }; redirect: string }> {
    if (ssoCookie.ssoFor === "admin") {
      const accessToken = await this.adminService.ssoSigninAdmin(identity.accountId, ssoType, account);
      return {
        cookie: ssoSessionCookies(accessToken.jwt, accessToken.refreshToken ?? "", "admin"),
        redirect: safeRedirectPath(ssoCookie.adminRedirect, "/admin"),
      };
    }
    const signin = await this.resolveSsoUser(identity, ssoType, { account, signupToken: ssoCookie.signupToken });
    if (signin.prepareUserId)
      return {
        cookie: { [SignupToken.cookieKey()]: signin.signupToken ?? "" },
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
      const identity = await identify();
      await this.moveLegacySsoAccount(identity, start.ssoType);
      const code = createOpaqueToken();
      const expiresAt = dayjs().add(NativeSso.codeSeconds, "second");
      const { accountId, nickname } = identity;
      const handoff = new cnst.SsoHandoff().set(start).set({ accountId, nickname, expiresAt });
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
    const identity = { accountId: handoff.accountId, nickname: handoff.nickname ?? "" };
    return await this.resolveSsoUser(identity, handoff.ssoType, { account });
  }
  private async moveLegacySsoAccount(
    {
      accountId,
      legacyAccountId,
      verifiedEmails = [],
    }: Pick<SsoIdentity, "accountId" | "legacyAccountId" | "verifiedEmails">,
    ssoType: cnst.SsoType["value"],
  ) {
    if (!legacyAccountId) return;
    const moved = await this.userModel.renameSsoAccountId(legacyAccountId, accountId, ssoType, verifiedEmails);
    if (moved.unprovenUserId)
      this.logger.warn(
        `${ssoType} user ${moved.unprovenUserId} kept its legacy id: no provider-verified address matches`,
      );
  }
  protected async resolveSsoUser(
    identity: SsoIdentity,
    ssoType: cnst.SsoType["value"],
    { account, signupToken }: { account?: Account; signupToken?: string | null } = {},
  ): Promise<cnst.SsoSignin> {
    const { accountId, nickname } = identity;
    await this.moveLegacySsoAccount(identity, ssoType);
    const userId = await this.userModel.findIdByAccountId(accountId, ["active", "restricted", "dormant"]);
    if (userId) {
      const user = await this.userService._assertSignable(await this.getActiveUserBySso(accountId, ssoType));
      const { jwt, refreshToken } = await this.userService._issueUserToken(user, account);
      return new cnst.SsoSignin().set({ jwt, refreshToken });
    }
    const setting = await this.settingService.getActiveSetting();
    const { userId: prepareUserId, signupToken: nextSignupToken } = await this.userService.openSignup(signupToken);
    const user = await this.userService.getPrepareUser(prepareUserId);
    await this.userModel.setSsoInPrepareUser(user.id, accountId, ssoType, setting.resignupDays);
    // 가입 화면에서 닉네임을 따로 받지 않는다 — SSO 프로필 이름을 그대로 쓰고, 비면 계정 아이디나 SSO 종류에서 만든다.
    if (!user.nickname)
      await user
        .rename(await this.userModel.makeUniqueNickname(nickname || (isEmail(accountId) ? accountId : ssoType)))
        .save();
    return new cnst.SsoSignin().set({ prepareUserId: user.id, signupToken: nextSignupToken });
  }
  private async getActiveUserBySso(accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.userModel.pickByAccountId(accountId, ["active", "restricted", "dormant"], {
      select: { accountId: true, verifies: true },
    })) as Pick<db.User, "id" | "verifies">;
    if (!auth.verifies.includes(ssoType)) throw new Err("user.error.noVerifiesInUser", { ssoType });
    return await this.userModel.getUser(auth.id);
  }
}
