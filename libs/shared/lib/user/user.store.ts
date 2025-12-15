import { baseClientEnv, Dayjs, dayjs } from "@akanjs/base";
import { getCookie, router, setAuth, setCookie } from "@akanjs/client";
import { store } from "@akanjs/store";
import { msg } from "@shared/client";
import { isPhoneNumber } from "@util/common";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class UserStore extends store(sig.user, {
  self: cnst.user.getDefault() as cnst.User,
  // prepareUser: cnst.user.getDefault() as cnst.User,
  // signupUser: null as cnst.User | null, // 회원가입용 user
  // verifyingUserId: null as string | null, // 인증 전 userId
  accountId: "",
  password: "",
  passwordConfirm: "",
  prevPassword: "",
  phone: "",
  phoneCode: "",
  phoneCodeAt: null as Dayjs | null,
  phoneVerifiedAt: null as Dayjs | null,
  turnstileToken: null as string | null,
  sameAccountIdExists: "unknown" as "unknown" | boolean,
  sameNicknameExists: "unknown" as "unknown" | boolean,
  signToken: null as string | null,
  leaveInfo: cnst.leaveInfo.getDefault(),
  agreePolicies: [] as string[],
}) {
  async getSelf({ jwt }: { jwt?: string } = {}) {
    this.set({ self: await fetch.getSelf({ token: jwt }) });
  }

  async addBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.addBadgeCount(self.id);
    this.set({ self: user });
    void navigator.setAppBadge(user.badgeCount);
  }

  async subBadgeCount() {
    const { self } = this.get();
    if (!self.id) return;
    const user = await fetch.subBadgeCount(self.id);
    this.set({ self: user });
    void navigator.setAppBadge(user.badgeCount);
  }

  async addNotiDeviceTokenOfSelf(notiDeviceToken: string) {
    const { self } = this.get();
    if (!self.id) return;
    await fetch.addNotiDeviceTokenOfSelf(notiDeviceToken);
  }
  async subNotiDeviceTokenOfSelf(notiDeviceToken: string) {
    const { self } = this.get();
    if (!self.id) return;
    await fetch.subNotiDeviceTokenOfSelf(notiDeviceToken);
  }
  async setLeaveInfoOfSelf() {
    const { leaveInfo } = this.get();
    if (!leaveInfo.reason || !leaveInfo.satisfaction || !leaveInfo.voc) return;
    await fetch.setLeaveInfoOfSelf({
      type: leaveInfo.type,
      reason: leaveInfo.reason,
      satisfaction: leaveInfo.satisfaction,
      voc: leaveInfo.voc,
      at: leaveInfo.at,
    });
    this.set({ leaveInfo: cnst.leaveInfo.getDefault() });
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
    const { turnstileToken } = this.get();
    const prepareUserId = getCookie("prepareUserId");
    const user = await fetch.generatePrepareUser(prepareUserId ?? null, turnstileToken ?? "dummy");
    setCookie("prepareUserId", user.id);
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
  async activateUser(userId: string, { redirect }: { redirect: string }) {
    const accessToken = await fetch.activateUser(userId);
    setAuth(accessToken);
    await this.getSelf(accessToken);
    router.push(redirect);
  }
  async setNicknameOfSelf({ redirect }: { redirect: string }) {
    const { self, userForm } = this.get();
    if (!self.id || !userForm.nickname) return;
    await fetch.setNicknameOfSelf(userForm.nickname);
    if (redirect) router.push(`${redirect}?userId=${self.id}`);
  }
  async setNicknameOfPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { userForm } = this.get();
    if (!userForm.nickname) return;
    await fetch.setNicknameOfPrepareUser(userId, userForm.nickname);
    if (redirect) router.push(`${redirect}?userId=${userId}`);
  }
  async setAppliedImagesOfSelf(appliedImages: cnst.File[], { redirect }: { redirect?: string }) {
    const { self } = this.get();
    if (!self.id || !appliedImages.length) return;
    await fetch.setAppliedImagesOfSelf(appliedImages.map((file) => file.id));
    if (redirect) router.push(`${redirect}?userId=${self.id}`);
  }
  async setAppliedImagesOfPrepareUser(userId: string, { redirect }: { redirect?: string }) {
    const { userForm } = this.get();
    if (!userForm.appliedImages.length) return;
    await fetch.setAppliedImagesOfPrepareUser(
      userId,
      userForm.appliedImages.map((file) => file.id)
    );
    if (redirect) router.push(`${redirect}?userId=${userId}`);
  }
  //*================================================================*//
  //*====================== Admin Control Area ======================*//
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
  async setPhoneByAdmin(phone: string) {
    const { user } = this.pick("user");
    msg.loading("user.changePhoneLoading", { key: "changePhoneByAdmin" });
    await fetch.setPhoneByAdmin(user.id, phone);
    msg.success("user.changePhoneSuccess", { key: "changePhoneByAdmin" });
  }
  //*====================== Admin Control Area ======================*//
  //*================================================================*//

  //*===================================================================*//
  //*====================== Password Signing Area ======================*//
  async setAccountIdInPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { accountId } = this.get();
    if (!accountId) return;
    await fetch.setAccountIdInPrepareUser(userId, accountId);
    router.push(`${redirect}?userId=${userId}`);
  }
  async generatePrepareUserWithAccountId({ redirect }: { redirect: string }) {
    const { accountId } = this.get();
    if (!accountId) return;
    const accountIdExists = await fetch.userExistsHasAccountId(accountId);
    if (accountIdExists) {
      msg.error("user.accountIdAlreadyExistsError");
      return;
    }
    const prepareUser = await fetch.generatePrepareUser(null, "dummy");
    await this.setAccountIdInPrepareUser(prepareUser.id, { redirect });
  }
  async setPasswordInPrepareUser(userId: string, { redirect }: { redirect: string }) {
    const { accountId, password, passwordConfirm } = this.get();
    if (!accountId || !password || password !== passwordConfirm) return;
    await fetch.setPasswordInPrepareUser(userId, accountId, password);
    router.push(`${redirect}?userId=${userId}`);
  }
  async signinWithPassword({ redirect, replace }: { redirect: string; replace?: boolean }) {
    try {
      const { turnstileToken } = this.get();
      const { accountId, password } = this.pick("accountId", "password");
      const accessToken = await fetch.signinWithPassword(accountId, password, turnstileToken ?? "dummy");
      setAuth(accessToken);
      await this.getSelf(accessToken);
      if (replace) router.replace(redirect);
      else router.push(redirect);
    } catch (error) {
      (this as unknown as RootStore).showMessage({ content: "Invalid account or password" });
    }
  }
  async changePassword() {
    const { turnstileToken } = this.get();
    const { password, prevPassword } = this.pick("password", "prevPassword");
    if (!window.confirm("Do you want to change your password?")) return;
    await fetch.changePassword(password, prevPassword, turnstileToken ?? "dummy");
    this.set({ userModal: null, password: "", prevPassword: "", turnstileToken: null });
  }
  async requestPhoneCodeForSetPassword(hash = "signin") {
    const { phone, phoneCodeAt } = this.get();
    if (phoneCodeAt && dayjs().subtract(5, "seconds").isBefore(phoneCodeAt)) return;
    else if (!isPhoneNumber(phone)) return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs().add(3, "minutes") });
    await fetch.requestPhoneCodeForSetPassword(phone, hash);
  }
  async getSignTokenForSetPassword() {
    const { phone, phoneCode } = this.pick("phone", "phoneCode");
    if (!phone || !phoneCode) return;
    const signToken = await fetch.getSignTokenForSetPassword(phone, phoneCode);
    this.set({ signToken });
  }
  async setPasswordWithSignToken() {
    const { password, signToken } = this.pick("self", "password", "signToken");
    if (!window.confirm("Do you want to change your password?")) return;
    await fetch.setPasswordWithSignToken(password, signToken);
    this.set({ userModal: null, password: "", signToken: null });
  }
  async resetPassword(accountId: string) {
    await fetch.resetPassword(accountId);
    msg.success("user.emailSentSuccess", { key: "forgotPassword" });
    this.resetUser();
  }
  //*====================== Password Signing Area ======================*//
  //*===================================================================*//

  //*================================================================*//
  //*====================== Phone Signing Area ======================*//
  async setPhoneInPrepareUser(
    userId: string,
    phone: string,
    { hash = "dummy", redirect }: { hash?: string; redirect?: string } = {}
  ) {
    const { phoneCodeAt } = this.get();
    if (phoneCodeAt && dayjs().subtract(5, "seconds").isBefore(phoneCodeAt)) return;
    else if (!isPhoneNumber(phone)) return;
    await fetch.setPhoneInPrepareUser(userId, phone, hash);
    this.set({ phoneCode: "", phoneCodeAt: dayjs().add(3, "minutes") });
    if (redirect) router.push(`${redirect}?userId=${userId}&phone=${encodeURIComponent(phone)}&hash=${hash}`);
  }
  async verifyPhoneInPrepareUser(userId: string, { redirect }: { redirect?: string } = {}) {
    const { phone, phoneCode } = this.pick("phone", "phoneCode");
    if (!phone || !phoneCode) return;
    await fetch.verifyPhoneInPrepareUser(userId, phone, phoneCode);
    if (redirect) router.push(`${redirect}?userId=${userId}`);
  }
  async requestPhoneCodeForSignin(userId: string, phone: string, hash = "signin") {
    const { phoneCodeAt } = this.get();
    if (phoneCodeAt && dayjs().subtract(5, "seconds").isBefore(phoneCodeAt)) return;
    this.set({ phoneCode: "", phoneCodeAt: dayjs().add(3, "minutes") });
    await fetch.requestPhoneCodeForSignin(userId, phone, hash);
  }
  async signinWithPhoneCode(userId: string, { redirect }: { redirect: string }) {
    const { phone, phoneCode } = this.pick("phone", "phoneCode");
    if (!phone || !phoneCode) return;
    const signToken = await fetch.getSignTokenForSignin(userId, phone, phoneCode);
    this.set({ signToken });
    const accessToken = await fetch.signinWithSignToken(userId, signToken);
    setAuth(accessToken);
    await this.getSelf(accessToken);
    this.set({ signToken: null });
    router.push(redirect);
  }
  //*====================== Phone Signing Area ======================*//
  //*================================================================*//

  //*================================================================*//
  //*====================== Secret Setup Area =======================*//
  async setNameOfPrepareUser(userId: string, name: string, { redirect }: { redirect: string }) {
    const success = await fetch.setNameOfPrepareUser(userId, name);
    if (success) router.push(`${redirect}?userId=${userId}`);
  }
  async setAgreePoliciesOfPrepareUser(userId: string, agreePolicies: string[], { redirect }: { redirect: string }) {
    const success = await fetch.setAgreePoliciesOfPrepareUser(userId, agreePolicies);
    if (success) router.push(`${redirect}?userId=${userId}`);
  }
  //*====================== Secret Setup Area =======================*//
  //*================================================================*//

  async refreshJwt() {
    const accessToken = await fetch.refreshJwt();
    setAuth(accessToken);
  }

  //*======================================================*//
  //*====================== SSO Area ======================*//
  ssoSigninUser(
    ssoType: cnst.SsoType["value"],
    {
      signinRedirect,
      signupRedirect,
      errorRedirect,
      replace,
    }: { signinRedirect: string; signupRedirect: string; errorRedirect: string; replace?: boolean }
  ) {
    setCookie("ssoFor", "user");
    setCookie("signinRedirect", `${location.origin}${router.getPrefixedPath(signinRedirect)}`);
    setCookie("signupRedirect", `${location.origin}${router.getPrefixedPath(signupRedirect)}`);
    setCookie("errorRedirect", `${location.origin}${router.getPrefixedPath(errorRedirect)}`);
    const url = `${baseClientEnv.serverHttpUri}/user/${ssoType}`;
    if (replace) router.replace(url);
    else router.push(url);
  }
  //*====================== SSO Area ======================*//
  //*======================================================*//
}
