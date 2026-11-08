import { msg } from "@libs/shared/client";
import { safeRedirectPath, withRedirectQuery } from "@libs/shared/common";
import {
  clearSignupToken,
  loadSignupToken,
  refreshSession,
  saveRefreshToken,
  saveSignupToken,
  setAppBadge,
} from "@libs/shared/webkit";
import { loadPushDeviceId } from "@libs/util/webkit";
import { type Dayjs, dayjs } from "akanjs/base";
import { router, setAuth } from "akanjs/client";
import { formatPhone, isEmail, isPhoneNumber } from "akanjs/common";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class UserStore extends store(sig.user, () => ({
  self: new cnst.User(),
  accountId: "",
  password: "",
  passwordConfirm: "",
  prevPassword: "",
  phone: "",
  phoneCode: "",
  phoneCodeAt: null as Dayjs | null, // when the last code was sent
  phoneVerifiedAt: null as Dayjs | null,
  emailCode: "",
  emailToVerify: "",
  emailToVerifyCode: "",
  emailToVerifySentTo: null as string | null,
  sameAccountIdExists: "unknown" as "unknown" | boolean,
  sameNicknameExists: "unknown" as "unknown" | boolean,
  signToken: null as string | null,
  leaveInfo: new cnst.LeaveInfo(),
  agreePolicies: [] as string[],
})) {
  static silent = ["refreshUserSession"] satisfies (keyof UserStore)[];
  // A resend within 20 seconds of the last code is dropped, which also absorbs a double tap on the send button.
  private static readonly resendCooldownSec = 20;

  async getSelf({ jwt }: { jwt?: string } = {}) {
    this.set({ self: (await fetch.getSelf({ token: jwt })) ?? new cnst.User() });
  }

  async addBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.addBadgeCount(self.id);
    this.set({ self: user });
    setAppBadge(user.badgeCount);
  }

  async subBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.subBadgeCount(self.id);
    this.set({ self: user });
    setAppBadge(user.badgeCount);
  }

  async removeSelf({ redirect }: { redirect?: string }) {
    const { self, leaveInfo } = this.get();
    if (!self.id) return;
    const { type, reason, satisfaction, voc, at } = leaveInfo;
    // voc 는 선택 항목이고 satisfaction 은 1이 유효한 값이라, 빈 값 검사로 설문 전체를 버리면 안 된다.
    const isSurveyed = !!reason && satisfaction !== null;
    const survey = isSurveyed ? { type, reason, satisfaction, voc, at } : null;
    const { jwt } = await fetch.leaveAndSignoutSelf(survey, await loadPushDeviceId());
    setAuth({ jwt });
    await saveRefreshToken("user", null);
    (this as unknown as RootStore).set({
      me: new cnst.Admin(),
      self: new cnst.User(),
      leaveInfo: new cnst.LeaveInfo(),
    });
    void this.getSelf({ jwt });
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
    const accessToken = await fetch.activateUserWithAgreePolicies(userId, agreePolicies ?? [], loadSignupToken());
    clearSignupToken();
    setAuth(accessToken);
    await saveRefreshToken("user", accessToken.refreshToken);
    await this.getSelf(accessToken);
    if (redirect) router.push(safeRedirectPath(redirect));
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
    this.setUser(await fetch.restrictUser(id, restrictReason, restrictUntil));
  }
  async activateUserByAdmin(userId: string) {
    this.setUser(await fetch.activateUserByAdmin(userId));
  }
  async releaseUser(id: string) {
    this.setUser(await fetch.releaseUser(id));
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
    if (await fetch.userExistsHasAccountId(accountId)) {
      msg.error("user.accountIdAlreadyExistsError");
      return;
    }
    const { userId, signupToken } = await fetch.generatePrepareUserWithAccountId(accountId, requestEmailCode);
    saveSignupToken(signupToken);
    if (requestEmailCode) {
      this.set({ emailCode: "" });
      msg.success("user.emailCodeSentSuccess", { key: "emailCode" });
    }
    router.push(withRedirectQuery(redirect, { userId }));
  }
  async requestEmailCodeInPrepareUser(userId: string) {
    await fetch.requestEmailCodeInPrepareUser(userId, loadSignupToken());
    this.set({ emailCode: "" });
    msg.success("user.emailCodeSentSuccess", { key: "emailCode" });
  }
  async requestEmailCodeInActiveUser() {
    const { emailToVerify } = this.get();
    if (!isEmail(emailToVerify)) return;
    await fetch.requestEmailCodeInActiveUser(emailToVerify);
    this.set({ emailToVerifySentTo: emailToVerify, emailToVerifyCode: "" });
    msg.success("user.emailCodeSentSuccess", { key: "emailToVerify" });
  }
  async verifyEmailInActiveUser() {
    const { emailToVerifySentTo, emailToVerifyCode } = this.get();
    if (!emailToVerifySentTo || emailToVerifyCode.length !== 6) return;
    await fetch.verifyEmailInActiveUser(emailToVerifySentTo, emailToVerifyCode);
    this.set({ emailToVerify: "", emailToVerifyCode: "", emailToVerifySentTo: null });
    msg.success("user.emailVerifiedSuccess", { key: "emailToVerify" });
    router.refresh();
  }
  async removeVerifiedEmailOfSelf(email: string) {
    await fetch.removeVerifiedEmailOfSelf(email);
    msg.success("user.verifiedEmailRemovedSuccess", { key: "removeVerifiedEmailOfSelf" });
    router.refresh();
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
    if (replace) router.replace(safeRedirectPath(redirect));
    else router.push(safeRedirectPath(redirect));
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
    const accessToken = await fetch.signinWithPhoneCode(phone, phoneCode);
    setAuth(accessToken);
    await saveRefreshToken("user", accessToken.refreshToken);
    await this.getSelf(accessToken);
    router.push(safeRedirectPath(redirect));
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
    const { phone, phoneCodeAt } = this.get();
    if (dayjs().diff(phoneCodeAt ?? 0, "second") < UserStore.resendCooldownSec || !isPhoneNumber(phone)) return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs() });
    const query = `phone=${encodeURIComponent(phone)}&hash=${hash}`;
    const ticket = await fetch.startPhoneSign(phone, hash, loadSignupToken() || null);
    if (!ticket) {
      router.push(`${signinHref}?${query}`);
      return;
    }
    saveSignupToken(ticket.signupToken);
    router.push(`${signupHref}?userId=${ticket.userId}&${query}`);
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
  async refreshUserSession() {
    await refreshSession("user", fetch.refreshJwt);
  }
}
