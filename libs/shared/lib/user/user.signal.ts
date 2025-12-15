import { ID, JSON } from "@akanjs/base";
import { Public, Req, Res } from "@akanjs/nest";
import { Account as SerAccount, endpoint, internal, slice } from "@akanjs/signal";
import {
  type FacebookResponse,
  type GithubResponse,
  type GoogleResponse,
  type KakaoResponse,
  Me,
  type NaverResponse,
  type SsoCookie,
} from "@shared/nest";
import { Account, Admin, Every, Self, SSO, User } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class UserInternal extends internal(srv.user, () => ({})) {}

export class UserSlice extends slice(srv.user, { guards: { root: Admin, get: Public, cru: Every } }, () => ({})) {}

export class UserEndpoint extends endpoint(srv.user.with(srv.util.security), ({ query, mutation }) => ({
  addBadgeCount: mutation(cnst.User)
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.addBadgeCount(userId);
    }),
  subBadgeCount: mutation(cnst.User)
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.subBadgeCount(userId);
    }),
  getUserIdHasNickname: query(ID, { nullable: true })
    .param("nickname", String)
    .exec(async function (nickname) {
      return await this.userService.getUserIdHasNickname(nickname);
    }),
  getSelf: query(cnst.User, { guards: [User] })
    .with(Self)
    .exec(async function (self) {
      return await this.userService.getUser(self.id);
    }),
  signinWithSignToken: mutation(cnst.util.AccessToken)
    .param("userId", ID)
    .body("signToken", String)
    .exec(async function (userId, signToken) {
      return await this.userService.signinWithSignToken(userId, signToken);
    }),
  signoutUser: mutation(cnst.util.AccessToken)
    .with(Account)
    .exec(function (account) {
      return this.securityService.subJwt(account, "self");
    }),
  activateUser: mutation(cnst.util.AccessToken)
    .param("userId", ID)
    .with(Account)
    .exec(async function (userId, account) {
      return await this.userService.activateUser(userId, account);
    }),
  removeUser: mutation(cnst.User)
    .param("userId", ID)
    .with(Me, { nullable: true })
    .with(Self, { nullable: true })
    .exec(async function (userId, me, self) {
      if (!me && self?.id !== userId) throw new Error("Unauthorized");
      return await this.userService.removeUser(userId);
    }),
  generatePrepareUser: mutation(cnst.User)
    .body("userId", ID, { nullable: true })
    .body("token", String)
    .exec(async function (userId, token) {
      //! 임시 비활
      // if (!(await this.cloudflareService.isVerified(token))) throw new Error("Invalid Turnstile Token");
      return await this.userService.generatePrepareUser(userId);
    }),
  setNicknameOfSelf: mutation(cnst.User, { guards: [User] })
    .body("nickname", String)
    .with(Self)
    .exec(async function (nickname, self) {
      return await this.userService.setNickname(self.id, nickname);
    }),
  setAppliedImagesOfSelf: mutation(cnst.User, { guards: [User] })
    .body("appliedImages", [ID])
    .with(Self)
    .exec(async function (appliedImages, self) {
      return await this.userService.setAppliedImages(self.id, appliedImages);
    }),
  setLeaveInfoOfSelf: mutation(cnst.User, { guards: [User] })
    .body("leaveInfo", cnst.LeaveInfo)
    .with(Self)
    .exec(async function (leaveInfo, self) {
      return await this.userService.setLeaveInfo(self.id, leaveInfo);
    }),
  approveUserImages: mutation(cnst.User, { guards: [Admin] })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.approveUserImages(userId);
    }),
  myAccountId: query(String, { guards: [User], nullable: true })
    .with(Self)
    .exec(async function (self) {
      return await this.userService.getAccountId(self.id, false);
    }),

  //*===================================================================*//
  //*====================== Password Signing Area ======================*//
  userExistsHasAccountId: query(Boolean)
    .param("accountId", String)
    .exec(async function (accountId) {
      const exists = await this.userService.existsByAccountId(accountId, ["active", "restricted", "dormant"]);
      return !!exists;
    }),
  setAccountIdInPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("accountId", String)
    .exec(async function (userId, accountId) {
      //! 임시 비활
      // if (!(await this.cloudflareService.isVerified(token))) throw new Error("Invalid Turnstile Token");
      await this.userService.setAccountIdInPrepareUser(userId, accountId);
      return true;
    }),
  setPasswordInPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("accountId", String)
    .body("password", String)
    .exec(async function (userId, accountId, password) {
      await this.userService.setPasswordInPrepareUser(userId, accountId, password);
      return true;
    }),
  signinWithPassword: mutation(cnst.util.AccessToken)
    .body("accountId", String)
    .body("password", String)
    .body("token", String)
    .with(Account)
    .exec(async function (accountId, password, token, account) {
      //! 임시 비활
      //if (!(await this.cloudflareService.isVerified(token))) throw new Error("Invalid Turnstile Token");
      return await this.userService.signinWithPassword(accountId, password, account);
    }),
  changePassword: mutation(Boolean, { guards: [Every] })
    .body("password", String)
    .body("prevPassword", String)
    .body("token", String)
    .with(Self)
    .exec(async function (password, prevPassword, token, self) {
      //! 임시 비활
      // if (!(await this.cloudflareService.isVerified(token))) throw new Error("Invalid Turnstile Token");
      await this.userService.changePassword(self.id, password, prevPassword);
      return true;
    }),
  requestPhoneCodeForSetPassword: mutation(Boolean, { guards: [User] })
    .body("phone", String)
    .body("hash", String)
    .with(Self)
    .exec(async function (phone, hash, self) {
      await this.userService.requestPhoneCodeForSetPassword(self.id, phone, hash);
      return true;
    }),
  getSignTokenForSetPassword: mutation(String, { guards: [User] })
    .body("phone", String)
    .body("phoneCode", String)
    .with(Self)
    .exec(async function (phone, phoneCode, self) {
      return await this.userService.getSignTokenForSetPassword(self.id, phone, phoneCode);
    }),
  setPasswordWithSignToken: mutation(Boolean, { guards: [Every] })
    .body("password", String)
    .body("signToken", String)
    .with(Self)
    .exec(async function (password, signToken, self) {
      await this.userService.setPasswordWithSignToken(self.id, password, signToken);
      return true;
    }),
  resetPassword: mutation(Boolean)
    .body("accountId", String)
    .exec(async function (accountId) {
      return await this.userService.resetPassword(accountId);
    }),
  //*====================== Password Signing Area ======================*//
  //*===================================================================*//

  //*================================================================*//
  //*====================== Phone Signing Area ======================*//
  getUserIdHasPhone: query(ID, { nullable: true })
    .param("phone", String)
    .exec(async function (phone) {
      return await this.userService.getUserIdHasPhone(phone);
    }),
  setPhoneInPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("phone", String)
    .body("hash", String)
    .exec(async function (userId, phone, hash) {
      await this.userService.setPhoneInPrepareUser(userId, phone, hash);
      return true;
    }),
  verifyPhoneInPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("phone", String)
    .body("phoneCode", String)
    .exec(async function (userId, phone, phoneCode) {
      await this.userService.verifyPhoneInPrepareUser(userId, phone, phoneCode);
      return true;
    }),
  setPhoneInActiveUser: mutation(Boolean, { guards: [User] })
    .body("phone", String)
    .body("phoneCode", String)
    .with(Self)
    .exec(async function (phone, phoneCode, self) {
      await this.userService.setPhoneInActiveUser(self.id, phone, phoneCode);
      return true;
    }),
  requestPhoneCodeForSignin: mutation(Boolean)
    .param("userId", ID)
    .body("phone", String)
    .body("hash", String)
    .exec(async function (userId, phone, hash) {
      await this.userService.requestPhoneCodeForSignin(userId, phone, hash);
      return true;
    }),
  getSignTokenForSignin: mutation(String)
    .param("userId", ID)
    .body("phone", String)
    .body("phoneCode", String)
    .exec(async function (userId, phone, phoneCode) {
      return await this.userService.getSignTokenForSignin(userId, phone, phoneCode);
    }),
  //*====================== Phone Signing Area ======================*//
  //*================================================================*//

  //*================================================================*//
  //*====================== Admin Control Area ======================*//
  addUserRole: mutation(cnst.User, { guards: [Admin] })
    .param("userId", ID)
    .body("role", cnst.UserRole)
    .exec(async function (userId, role) {
      return await this.userService.addUserRole(userId, role);
    }),
  subUserRole: mutation(cnst.User, { guards: [Admin] })
    .param("userId", ID)
    .body("role", cnst.UserRole)
    .exec(async function (userId, role) {
      return await this.userService.subUserRole(userId, role);
    }),
  restrictUser: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("reason", String)
    .body("until", Date, { nullable: true })
    .exec(async function (userId, reason, until) {
      await this.userService.restrictUser(userId, reason, until);
      return true;
    }),
  releaseUser: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .exec(async function (userId) {
      await this.userService.releaseUser(userId);
      return true;
    }),
  getRestrictInfo: query(cnst.RestrictInfo, { nullable: true })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.getRestrictInfo(userId);
    }),
  setAccountIdByAdmin: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("accountId", String)
    .exec(async function (userId, accountId) {
      await this.userService.setAccountId(userId, accountId);
      return true;
    }),
  setPasswordByAdmin: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("password", String)
    .exec(async function (userId, password) {
      await this.userService.setPassword(userId, password);
      return true;
    }),
  setPhoneByAdmin: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("phone", String)
    .exec(async function (userId, phone) {
      await this.userService.setPhone(userId, phone);
      return true;
    }),
  getAccessTokenByAdmin: query(cnst.util.AccessToken, { guards: [Admin] })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.getAccessTokenByAdmin(userId);
    }),
  getEncourageInfo: query(cnst.EncourageInfo, { guards: [Admin] })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.getEncourageInfo(userId);
    }),
  setJourneyByAdmin: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("journey", cnst.Journey)
    .exec(async function (userId, journey) {
      await this.userService.setJourney(userId, journey);
      return true;
    }),
  setInquiryByAdmin: mutation(Boolean, { guards: [Admin] })
    .param("userId", ID)
    .body("inquiry", cnst.Inquiry)
    .exec(async function (userId, inquiry) {
      await this.userService.setInquiry(userId, inquiry);
      return true;
    }),
  //*====================== Admin Control Area ======================*//
  //*================================================================*//

  //*================================================================*//
  //*====================== Public Setup Area =======================*//
  setNicknameOfPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("nickname", String)
    .exec(async function (userId, nickname) {
      await this.userService.setNicknameOfPrepareUser(userId, nickname);
      return true;
    }),
  setAppliedImagesOfPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("appliedImages", [String])
    .exec(async function (userId, appliedImages) {
      await this.userService.setAppliedImagesOfPrepareUser(userId, appliedImages);
      return true;
    }),
  //*================================================================*//
  //*====================== Secret Setup Area =======================*//
  setNameOfPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("name", String)
    .exec(async function (userId, name) {
      await this.userService.setNameOfPrepareUser(userId, name);
      return true;
    }),
  setAgreePoliciesOfPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body("agreePolicies", [String])
    .exec(async function (userId, agreePolicies) {
      await this.userService.setAgreePoliciesOfPrepareUser(userId, agreePolicies);
      return true;
    }),
  setDiscordOfPrepareUser: mutation(Boolean)
    .body("userId", ID)
    .body<"discord", { nickname?: string; user?: { username: string } }>("discord", JSON)
    .exec(async function (userId, discord) {
      await this.userService.setDiscordOfPrepareUser(userId, discord);
      return true;
    }),
  setNotiSettingOfUser: mutation(Boolean)
    .body("userId", ID)
    .body("notiSetting", cnst.NotiSetting)
    .exec(async function (userId, notiSetting) {
      await this.userService.setNotiSettingOfUser(userId, notiSetting);
      return true;
    }),
  addNotiDeviceTokenOfSelf: mutation(Boolean, { guards: [User] })
    .body("notiDeviceToken", String)
    .with(Self)
    .exec(async function (notiDeviceToken, self) {
      await this.userService.addNotiDeviceTokenOfUser(self.id, notiDeviceToken);
      return true;
    }),
  subNotiDeviceTokenOfSelf: mutation(Boolean, { guards: [User] })
    .body("notiDeviceToken", String)
    .with(Self)
    .exec(async function (notiDeviceToken, self) {
      await this.userService.subNotiDeviceTokenOfUser(self.id, notiDeviceToken);
      return true;
    }),
  //*====================== Secret Setup Area =======================*//
  //*================================================================*//

  //*======================================================*//
  //*====================== SSO Area ======================*//
  github: query(String, { onlyFor: "restapi", guards: [SSO.Github] }).exec(function () {
    return "unreachable";
  }),
  githubCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Github], path: "github/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const { username: accountId } = req.user as GithubResponse;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "github",
        req.cookies as SsoCookie,
        req.account as SerAccount | undefined
      );
      if (cookie) Object.entries(cookie).forEach(([key, value]) => res.cookie(key, value));
      res.header("X-Redirect-Method", "replace").redirect(redirect);
    }),
  google: query(String, { onlyFor: "restapi", guards: [SSO.Google] }).exec(function () {
    return "unreachable";
  }),
  googleCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Google], path: "google/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const googleUser = req.user as GoogleResponse;
      const accountId = googleUser.emails[0].value;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "google",
        req.cookies as SsoCookie,
        req.account as SerAccount | undefined
      );
      if (cookie) Object.entries(cookie).forEach(([key, value]) => res.cookie(key, value));
      res.header("X-Redirect-Method", "replace").redirect(redirect);
    }),
  facebook: query(String, { onlyFor: "restapi", guards: [SSO.Facebook] }).exec(function () {
    return "unreachable";
  }),
  facebookCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Facebook], path: "facebook/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const facebookUser = req.user as FacebookResponse;
      const accountId = facebookUser.emails[0].value;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "facebook",
        req.cookies as SsoCookie,
        req.account as SerAccount | undefined
      );
      if (cookie) Object.entries(cookie).forEach(([key, value]) => res.cookie(key, value));
      res.header("X-Redirect-Method", "replace").redirect(redirect);
    }),
  apple: query(String, { onlyFor: "restapi", guards: [SSO.Apple] }).exec(function () {
    return "unreachable";
  }),
  appleCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Apple], path: "apple/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      // const sso = this.securityOption.sso.apple as AppleCredential;
      // if (!payload.code || !sso) throw new Error("Invalid Apple SSO");
      // return verifyAppleUser(payload, this.options.origin, sso);
    }),
  kakao: query(String, { onlyFor: "restapi", guards: [SSO.Kakao] }).exec(function () {
    return "unreachable";
  }),
  kakaoCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Kakao], path: "kakao/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const { email: accountId } = req.user as KakaoResponse;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "kakao",
        req.cookies as SsoCookie,
        req.account as SerAccount | undefined
      );
      if (cookie) Object.entries(cookie).forEach(([key, value]) => res.cookie(key, value));
      res.header("X-Redirect-Method", "replace").redirect(redirect);
    }),
  naver: query(String, { onlyFor: "restapi", guards: [SSO.Naver] }).exec(function () {
    return "unreachable";
  }),
  naverCallback: query(JSON, { onlyFor: "restapi", guards: [SSO.Naver], path: "naver/callback" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const { email: accountId } = req.user as NaverResponse;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "naver",
        req.cookies as SsoCookie,
        req.account as SerAccount | undefined
      );
      if (cookie) Object.entries(cookie).forEach(([key, value]) => res.cookie(key, value));
      res.header("X-Redirect-Method", "replace").redirect(redirect);
    }),
  //*====================== SSO Area ======================*//
  //*======================================================*//

  setRemoteAuthToken: mutation(Boolean, { guards: [Every] })
    .body("remoteId", String)
    .with(Account)
    .exec(async function (remoteId, account) {
      await this.userService.setRemoteAuthToken(remoteId, account);
      return true;
    }),
  getRemoteAuthToken: query(cnst.util.AccessToken, { nullable: true })
    .param("remoteId", String)
    .exec(async function (remoteId) {
      const jwt = await this.userService.getRemoteAuthToken(remoteId);
      return jwt ? { jwt } : null;
    }),

  refreshJwt: mutation(cnst.util.AccessToken)
    .with(Account)
    .exec(function (account) {
      return this.securityService.sign(account);
    }),
})) {}
