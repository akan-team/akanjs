import { msg } from "@libs/shared/client";
import { pkcePair, withRedirectQuery } from "@libs/shared/common";
import {
  clearSignupToken,
  loadSignupToken,
  refreshSession,
  saveRefreshToken,
  saveSignupToken,
} from "@libs/shared/webkit";
import { type Dayjs, dayjs, getApiPrefix, getEnv, getServerOrigin } from "akanjs/base";
import { router, setAuth, setCookie } from "akanjs/client";
import { AkanNativeError, authSession, desktopPlatform, isNativeShell } from "akanjs/client/native";
import { formatPhone, isPhoneNumber } from "akanjs/common";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class UserStore extends store(sig.user, () => ({
  self: new cnst.User(),
  // prepareUser: new cnst.User(),
  // signupUser: null as cnst.User | null, // 회원가입용 user
  // verifyingUserId: null as string | null, // 인증 전 userId
  accountId: "",
  password: "",
  passwordConfirm: "",
  prevPassword: "",
  phone: "",
  phoneCode: "",
  phoneCodeAt: null as Dayjs | null, // when the last code was sent
  phoneVerifiedAt: null as Dayjs | null,
  emailCode: "",
  sameAccountIdExists: "unknown" as "unknown" | boolean,
  sameNicknameExists: "unknown" as "unknown" | boolean,
  signToken: null as string | null,
  ssoAttempt: null as { ssoType: cnst.SsoType["value"]; nonce: string } | null,
  leaveInfo: new cnst.LeaveInfo(),
  agreePolicies: [] as string[],
})) {
  // A resend within 20 seconds of the last code is dropped, which also absorbs a double tap on the send button.
  private static readonly resendCooldownSec = 20;
  // Firefox and desktop Safari ship no Badging API, and reading a missing method off `navigator` and calling it
  // throws synchronously — which would take the whole badge action down with it.
  private static setAppBadge(count: number) {
    if (!("setAppBadge" in navigator)) return;
    void navigator.setAppBadge(count);
  }

  async getSelf({ jwt }: { jwt?: string } = {}) {
    this.set({ self: (await fetch.getSelf({ token: jwt })) ?? new cnst.User() });
  }

  async addBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.addBadgeCount(self.id);
    this.set({ self: user });
    UserStore.setAppBadge(user.badgeCount);
  }

  async subBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.subBadgeCount(self.id);
    this.set({ self: user });
    UserStore.setAppBadge(user.badgeCount);
  }

  async setLeaveInfoOfSelf() {
    const { leaveInfo } = this.get();
    // voc 는 선택 항목이고 satisfaction 은 1이 유효한 값이라, 빈 값 검사로 설문 전체를 버리면 안 된다.
    if (!leaveInfo.reason || leaveInfo.satisfaction === null) return;
    await fetch.setLeaveInfoOfSelf({
      type: leaveInfo.type,
      reason: leaveInfo.reason,
      satisfaction: leaveInfo.satisfaction,
      voc: leaveInfo.voc,
      at: leaveInfo.at,
    });
    this.set({ leaveInfo: new cnst.LeaveInfo() });
  }
  async removeSelf({ redirect }: { redirect?: string }) {
    const { self } = this.get();
    if (!self.id) return;
    await fetch.removeUser(self.id);
    await (this as unknown as RootStore).logout();
    if (redirect) router.push(redirect);
    else router.refresh();
  }
  async generatePrepareUser() {
    const { signupToken } = await fetch.generatePrepareUser(loadSignupToken() || null);
    saveSignupToken(signupToken);
  }
  async checkSameAccountIdExists(accountId: string) {
    if (!accountId) {
      this.set({ sameAccountIdExists: "unknown" });
      return;
    }
    const userId = await fetch.userExistsHasAccountId(accountId);
    this.set({ sameAccountIdExists: !!userId });
  }
  async checkSameNicknameExists(nickname: string) {
    if (!nickname) {
      this.set({ sameNicknameExists: "unknown" });
      return;
    }
    const userId = await fetch.getUserIdHasNickname(nickname);
    this.set({ sameNicknameExists: !!userId });
  }
  async activateUser(userId: string, { redirect, agreePolicies }: { redirect?: string; agreePolicies?: string[] }) {
    // 약관 화면이 따로 없는 가입 흐름에서는 활성화 버튼 자체가 동의 표시라, 동의 목록을 함께 넘겨 기록한다.
    const signupToken = loadSignupToken();
    if (agreePolicies?.length) await fetch.setAgreePoliciesOfPrepareUser(userId, agreePolicies, signupToken);
    const accessToken = await fetch.activateUser(userId, signupToken);
    clearSignupToken();
    setAuth(accessToken);
    await saveRefreshToken("user", accessToken.refreshToken);
    await this.getSelf(accessToken);
    if (redirect) router.push(redirect);
  }
  async setNicknameOfSelf({ redirect }: { redirect: string }) {
    const { self, userForm } = this.get();
    if (!self.id || !userForm.nickname) return;
    await fetch.setNicknameOfSelf(userForm.nickname);
    if (redirect) router.push(withRedirectQuery(redirect, { userId: self.id }));
  }
  async setNicknameOfPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { userForm } = this.get();
    if (!userForm.nickname) return;
    await fetch.setNicknameOfPrepareUser(userId, userForm.nickname, loadSignupToken());
    if (redirect) router.push(withRedirectQuery(redirect, { userId }));
  }
  async setAppliedImagesOfSelf(appliedImages: cnst.File[], { redirect }: { redirect?: string }) {
    const { self } = this.get();
    if (!self.id || !appliedImages.length) return;
    await fetch.setAppliedImagesOfSelf(appliedImages.map((file) => file.id));
    if (redirect) router.push(withRedirectQuery(redirect, { userId: self.id }));
  }
  async setAppliedImagesOfPrepareUser(userId: string, { redirect }: { redirect?: string }) {
    const { userForm } = this.get();
    if (!userForm.appliedImages.length) return;
    await fetch.setAppliedImagesOfPrepareUser(
      userId,
      userForm.appliedImages.map((file) => file.id),
      loadSignupToken(),
    );
    if (redirect) router.push(withRedirectQuery(redirect, { userId }));
  }
  async addUserRole(id: string, role: cnst.UserRole["value"]) {
    const user = await fetch.addUserRole(id, role);
    this.setUser(user);
  }
  async subUserRole(id: string, role: cnst.UserRole["value"]) {
    const user = await fetch.subUserRole(id, role);
    this.setUser(user);
  }
  async restrictUser(id: string, restrictReason: string, restrictHour?: number) {
    const restrictUntil = restrictHour ? dayjs().add(restrictHour, "hour") : undefined;
    await fetch.restrictUser(id, restrictReason, restrictUntil);
    // this.setUser(user);
  }
  async activateUserByAdmin(userId: string) {
    this.setUser(await fetch.activateUserByAdmin(userId));
  }
  async releaseUser(id: string) {
    await fetch.releaseUser(id);
    // this.setUser(user);
  }
  async setAccountIdByAdmin(accountId: string) {
    const { user } = this.pick("user");
    msg.loading("user.changeAccountIdLoading", { key: "changeAccountIdByAdmin" });
    await fetch.setAccountIdByAdmin(user.id, accountId);
    msg.success("user.changeAccountIdSuccess", { key: "changeAccountIdByAdmin" });
  }
  async setPasswordByAdmin(password: string) {
    const { user } = this.pick("user");
    msg.loading("user.changePasswordLoading", { key: "changePasswordByAdmin" });
    await fetch.setPasswordByAdmin(user.id, password);
    msg.success("user.changePasswordSuccess", { key: "changePasswordByAdmin" });
  }
  setPhone(phone: string) {
    this.set({ phone: formatPhone(phone) });
  }
  async setPhoneByAdmin(phone: string) {
    const { user } = this.pick("user");
    msg.loading("user.changePhoneLoading", { key: "changePhoneByAdmin" });
    await fetch.setPhoneByAdmin(user.id, phone);
    msg.success("user.changePhoneSuccess", { key: "changePhoneByAdmin" });
  }

  async setAccountIdInPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { accountId } = this.get();
    if (!accountId) return;
    await fetch.setAccountIdInPrepareUser(userId, accountId, loadSignupToken());
    router.push(withRedirectQuery(redirect, { userId }));
  }
  async generatePrepareUserWithAccountId({
    redirect,
    requestEmailCode = false,
  }: {
    redirect: string;
    requestEmailCode?: boolean;
  }) {
    const { accountId } = this.get();
    if (!accountId) return;
    const accountIdExists = await fetch.userExistsHasAccountId(accountId);
    if (accountIdExists) {
      msg.error("user.accountIdAlreadyExistsError");
      return;
    }
    const { userId, signupToken } = await fetch.generatePrepareUser(null);
    saveSignupToken(signupToken);
    if (!requestEmailCode) {
      await this.setAccountIdInPrepareUser(userId, { redirect });
      return;
    }
    await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
    await this.requestEmailCodeInPrepareUser(userId);
    router.push(withRedirectQuery(redirect, { userId }));
  }
  async requestEmailCodeInPrepareUser(userId: string) {
    await fetch.requestEmailCodeInPrepareUser(userId, loadSignupToken());
    this.set({ emailCode: "" });
    msg.success("user.emailCodeSentSuccess", { key: "emailCode" });
  }
  async verifyEmailInPrepareUser(userId: string, { redirect }: { redirect?: string } = {}) {
    const { emailCode } = this.get();
    if (emailCode.length !== 6) return;
    await fetch.verifyEmailInPrepareUser(userId, emailCode, loadSignupToken());
    this.set({ emailCode: "" });
    if (redirect) router.push(withRedirectQuery(redirect, { userId }));
  }
  async setPasswordInPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { accountId, password, passwordConfirm } = this.get();
    if (!accountId || !password || password !== passwordConfirm) return;
    await fetch.setPasswordInPrepareUser(userId, accountId, password, loadSignupToken());
    router.push(withRedirectQuery(redirect, { userId }));
  }
  async signinWithPassword({ redirect, replace }: { redirect: string; replace?: boolean }) {
    const { accountId, password } = this.pick("accountId", "password");
    const accessToken = await fetch.signinWithPassword(accountId, password);
    setAuth(accessToken);
    await saveRefreshToken("user", accessToken.refreshToken);
    await this.getSelf(accessToken);
    if (replace) router.replace(redirect);
    else router.push(redirect);
  }
  async changePassword() {
    const { password, prevPassword } = this.pick("password", "prevPassword");
    await fetch.changePassword(password, prevPassword);
    this.set({ userModal: null, password: "", prevPassword: "" });
  }
  async requestPhoneCodeForSetPassword(hash = "signin") {
    const { phone } = this.get();
    if (dayjs().diff(this.get().phoneCodeAt ?? 0, "second") < UserStore.resendCooldownSec || !isPhoneNumber(phone))
      return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs(), phoneVerifiedAt: null, signToken: null });
    await fetch.requestPhoneCodeForSetPassword(phone, hash);
  }
  async getSignTokenForSetPassword() {
    const { phone, phoneCode } = this.pick("phone", "phoneCode");
    if (!phone || !phoneCode) return;
    const signToken = await fetch.getSignTokenForSetPassword(phone, phoneCode);
    this.set({ signToken, phoneVerifiedAt: dayjs() });
  }
  async setPasswordWithSignToken() {
    const { password, passwordConfirm, signToken } = this.pick("password", "passwordConfirm", "signToken");
    if (password !== passwordConfirm) return;
    await fetch.setPasswordWithSignToken(password, signToken);
    this.set({
      password: "",
      passwordConfirm: "",
      phoneCode: "",
      phoneCodeAt: null,
      phoneVerifiedAt: null,
      signToken: null,
    });
    msg.success("user.changePasswordSuccess");
  }
  async resetPassword(accountId: string) {
    await fetch.resetPassword(accountId);
    msg.success("user.emailSentSuccess", { key: "forgotPassword" });
    this.resetUser();
  }

  async setPhoneInPrepareUser(
    userId: string,
    phone: string,
    { hash = "dummy", redirect }: { hash?: string; redirect?: string } = {},
  ) {
    if (dayjs().diff(this.get().phoneCodeAt ?? 0, "second") < UserStore.resendCooldownSec || !isPhoneNumber(phone))
      return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs() });
    await fetch.setPhoneInPrepareUser(userId, phone, hash, loadSignupToken());
    if (redirect) router.push(withRedirectQuery(redirect, { userId, phone, hash }));
  }
  async verifyPhoneInPrepareUser(userId: string, { redirect }: { redirect?: string } = {}) {
    const { phone, phoneCode } = this.pick("phone", "phoneCode");
    if (!phone || !phoneCode) return;
    await fetch.verifyPhoneInPrepareUser(userId, phone, phoneCode, loadSignupToken());
    if (redirect) router.push(withRedirectQuery(redirect, { userId }));
  }
  async requestPhoneCodeForSignin(phone: string, hash = "signin") {
    if (dayjs().diff(this.get().phoneCodeAt ?? 0, "second") < UserStore.resendCooldownSec) return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs() });
    await fetch.requestPhoneCodeForSignin(phone, hash);
  }
  async signinWithPhoneCode(phone: string, { redirect }: { redirect: string }) {
    const { phoneCode } = this.pick("phoneCode");
    if (!phone) return;
    const signToken = await fetch.getSignTokenForSignin(phone, phoneCode);
    const accessToken = await fetch.signinWithSignToken(signToken);
    setAuth(accessToken);
    await saveRefreshToken("user", accessToken.refreshToken);
    await this.getSelf(accessToken);
    router.push(redirect);
  }
  // An existing number signs in; a new one starts a sign-up, so neither page needs the account id in its URL.
  async startPhoneSign({
    signinHref,
    signupHref,
    hash = "sign",
  }: {
    signinHref: string;
    signupHref: string;
    hash?: string;
  }) {
    const { phone } = this.get();
    if (!isPhoneNumber(phone)) return;
    const query = `phone=${encodeURIComponent(phone)}&hash=${hash}`;
    if (await fetch.userExistsHasPhone(phone)) {
      await this.requestPhoneCodeForSignin(phone, hash);
      router.push(`${signinHref}?${query}`);
      return;
    }
    const { userId, signupToken } = await fetch.generatePrepareUser(loadSignupToken() || null);
    saveSignupToken(signupToken);
    await this.setPhoneInPrepareUser(userId, phone, { hash, redirect: `${signupHref}?userId=${userId}&${query}` });
  }

  async setNameOfPrepareUser(userId: string, name: string, { redirect }: { redirect: string }) {
    const success = await fetch.setNameOfPrepareUser(userId, name, loadSignupToken());
    if (success) router.push(withRedirectQuery(redirect, { userId }));
  }
  async setAgreePoliciesOfPrepareUser(userId: string, agreePolicies: string[], { redirect }: { redirect: string }) {
    const success = await fetch.setAgreePoliciesOfPrepareUser(userId, agreePolicies, loadSignupToken());
    if (success) router.push(withRedirectQuery(redirect, { userId }));
  }

  async refreshJwt() {
    await refreshSession("user", fetch.refreshJwt, { force: true });
  }

  async ssoSigninUser(
    ssoType: cnst.SsoType["value"],
    {
      signinRedirect,
      signupRedirect,
      errorRedirect,
      replace,
    }: { signinRedirect: string; signupRedirect: string; errorRedirect: string; replace?: boolean },
  ) {
    const navigate = (path: string) => (replace ? router.replace(path) : router.push(path));
    //* A native page (app://localhost) keeps no session cookie: the provider runs in the system browser instead.
    if (isNativeShell()) {
      const callbackScheme = getEnv().appName;
      const nonce = crypto.randomUUID();
      const { verifier, challenge } = await pkcePair();
      const start = new URL(`${getServerOrigin()}${getApiPrefix()}/user/${ssoType}`);
      start.search = new URLSearchParams({
        callbackScheme,
        codeChallenge: challenge,
        state: nonce,
        lang: document.documentElement.lang,
        ...(desktopPlatform() ? { returnPage: "1" } : {}),
      }).toString();
      this.set({ ssoAttempt: { ssoType, nonce } });
      const isCurrent = () => this.get().ssoAttempt?.nonce === nonce;
      const callback = await authSession
        .start({ url: start.href, callbackScheme })
        .then(({ url }) => new URL(url).searchParams)
        .catch((error: unknown) => {
          if (isCurrent()) this.set({ ssoAttempt: null });
          if (error instanceof AkanNativeError && error.code === "CANCELLED") return null;
          throw error;
        });
      //? A retry replaced this attempt, or the person cancelled the wait: the late answer is dropped.
      if (!callback || !isCurrent()) return;
      this.set({ ssoAttempt: null });
      const code = callback.get("code");
      if (!code) {
        msg.error("user.ssoSigninFailed");
        return;
      }
      const { jwt, refreshToken, prepareUserId, signupToken } = await fetch.exchangeSsoCode(code, verifier);
      if (prepareUserId) {
        if (signupToken) saveSignupToken(signupToken);
        navigate(withRedirectQuery(signupRedirect, { userId: prepareUserId }));
        return;
      }
      if (!jwt) return;
      setAuth({ jwt });
      await saveRefreshToken("user", refreshToken);
      await this.getSelf({ jwt });
      navigate(signinRedirect);
      return;
    }
    setCookie("ssoFor", "user");
    setCookie("signinRedirect", encodeURIComponent(router.getPrefixedPath(signinRedirect)));
    setCookie("signupRedirect", encodeURIComponent(router.getPrefixedPath(signupRedirect)));
    setCookie("errorRedirect", encodeURIComponent(router.getPrefixedPath(errorRedirect)));
    setCookie("ssoOrigin", location.origin);
    const url = `${getApiPrefix()}/user/${ssoType}`;
    if (replace) location.replace(url);
    else location.assign(url);
  }
}
