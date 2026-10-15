import {
  Account,
  Admin,
  browserRefreshGraceMs,
  Every,
  makeAccessTokenResponse,
  makeSignoutResponse,
  readRefreshTokenCookie,
  Self,
  SelfOrAdmin,
  type SerAccount,
  SignupHolder,
  SSO,
  SsoFlow,
  Staff,
  User,
} from "@libs/shared/srvkit";
import { Any, ID } from "akanjs/base";
import { endpoint, internal, Public, Req, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import { Err } from "../dict";
import * as srv from "../srv";

export class UserInternal extends internal(srv.user, ({ cron }) => ({
  // Every mode, unlike the summary cron: an expired restriction has to end wherever the app runs.
  releaseExpiredRestrictions: cron("*/10 * * * *", { serverMode: "batch" }).exec(async function () {
    await this.userService.releaseExpiredRestrictions();
  }),
})) {}

export class UserSlice extends slice(
  srv.user,
  { guards: { root: Staff, get: Public, cru: SelfOrAdmin, create: Admin } },
  () => ({}),
) {}

export class UserEndpoint extends endpoint(srv.user.with(srv.util.security), ({ query, mutation }) => ({
  // The unread badge the app shell draws. It counts what the person has looked at, so an agent moving it
  // rewrites the record of what they read.
  addBadgeCount: mutation(cnst.User, { guards: [SelfOrAdmin], mcp: false })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.addBadgeCount(userId);
    }),
  subBadgeCount: mutation(cnst.User, { guards: [SelfOrAdmin], mcp: false })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.subBadgeCount(userId);
    }),
  getUserIdHasNickname: query(ID, { guards: [Public], nullable: true, mcp: false, rateLimit: { calls: 120 } })
    .param("nickname", String)
    .exec(async function (nickname) {
      return await this.userService.getUserIdHasNickname(nickname);
    }),
  getSelf: query(cnst.User, { guards: [Public], nullable: true, mcp: false })
    .with(Self, { nullable: true })
    .exec(async function (self) {
      if (!self) return null;
      return await this.userService.getUser(self.id);
    }),
  signinWithSignToken: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("signToken", String)
    .with(Account)
    .exec(async function (signToken, account) {
      return makeAccessTokenResponse(await this.userService.signinWithSignToken(signToken, account)) as never;
    }),
  signoutUser: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 60 } })
    .body("pushDeviceId", String, { nullable: true })
    .with(Account)
    .exec(async function (pushDeviceId, account) {
      return makeSignoutResponse(await this.userService.signoutUser(account, pushDeviceId)) as never;
    }),
  activateUser: mutation(cnst.util.AccessToken, { guards: [SignupHolder], mcp: false })
    .param("userId", ID)
    .body("signupToken", String)
    .with(Account)
    .exec(async function (userId, _signupToken, account) {
      return makeAccessTokenResponse(await this.userService.activateUser(userId, account)) as never;
    }),
  // An admin vouches for the account, so the signup policy does not apply and no session is handed out.
  activateUserByAdmin: mutation(cnst.User, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.activateUserByAdmin(userId);
    }),
  // Resumes the draft its token names, or opens a new one; either way the answer carries a fresh token.
  generatePrepareUser: mutation(cnst.SignupTicket, { guards: [Public], mcp: false, rateLimit: { calls: 60 } })
    .body("signupToken", String, { nullable: true })
    .exec(async function (signupToken) {
      return await this.userService.openSignup(signupToken);
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
  // One step of the account-removal flow the page drives; on its own it records a reason for a departure that
  // has not happened.
  setLeaveInfoOfSelf: mutation(cnst.User, { guards: [User], mcp: false })
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

  userExistsHasAccountId: query(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 120 } })
    .param("accountId", String)
    .exec(async function (accountId) {
      const exists = await this.userService.existsByAccountId(accountId, ["active", "restricted", "dormant"]);
      return !!exists;
    }),
  setAccountIdInPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("accountId", String)
    .body("signupToken", String)
    .exec(async function (userId, accountId) {
      await this.userService.setAccountIdInPrepareUser(userId, accountId);
      return true;
    }),
  setPasswordInPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("accountId", String)
    .body("password", String)
    .body("signupToken", String)
    .exec(async function (userId, accountId, password) {
      await this.userService.setPasswordInPrepareUser(userId, accountId, password);
      return true;
    }),
  signinWithPassword: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 60 } })
    .body("accountId", String)
    .body("password", String)
    .with(Account)
    .exec(async function (accountId, password, account) {
      return makeAccessTokenResponse(await this.userService.signinWithPassword(accountId, password, account)) as never;
    }),
  changePassword: mutation(Boolean, { guards: [Every], rateLimit: { calls: 10, by: "account" } })
    .body("password", String)
    .body("prevPassword", String)
    .with(Self)
    .exec(async function (password, prevPassword, self) {
      await this.userService.changePassword(self.id, password, prevPassword);
      return true;
    }),
  requestPhoneCodeForSetPassword: mutation(Boolean, {
    guards: [User],
    mcp: false,
    rateLimit: { calls: 5, by: "account" },
  })
    .body("phone", String)
    .body("hash", String)
    .with(Self)
    .exec(async function (phone, hash, self) {
      await this.userService.requestPhoneCodeForSetPassword(self.id, phone, hash);
      return true;
    }),
  getSignTokenForSetPassword: mutation(String, { guards: [User], mcp: false })
    .body("phone", String)
    .body("phoneCode", String)
    .with(Self)
    .exec(async function (phone, phoneCode, self) {
      return await this.userService.getSignTokenForSetPassword(self.id, phone, phoneCode);
    }),
  setPasswordWithSignToken: mutation(Boolean, { guards: [User], mcp: false })
    .body("password", String)
    .body("signToken", String)
    .with(Self)
    .exec(async function (password, signToken, self) {
      await this.userService.setPasswordWithSignToken(self.id, password, signToken);
      return true;
    }),
  resetPassword: mutation(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("accountId", String)
    .exec(async function (accountId) {
      return await this.userService.resetPassword(accountId);
    }),
  requestEmailCodeInPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false, rateLimit: { calls: 60 } })
    .body("userId", ID)
    .body("signupToken", String)
    .exec(async function (userId) {
      await this.userService.requestEmailCodeInPrepareUser(userId);
      return true;
    }),
  verifyEmailInPrepareUser: mutation(String, { guards: [SignupHolder], mcp: false, rateLimit: { calls: 60 } })
    .body("userId", ID)
    .body("emailCode", String)
    .body("signupToken", String)
    .exec(async function (userId, emailCode) {
      return await this.userService.verifyEmailInPrepareUser(userId, emailCode);
    }),
  setPasswordInPrepareUserWithSignToken: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("password", String)
    .body("signToken", String)
    .body("signupToken", String)
    .exec(async function (userId, password, signToken) {
      await this.userService.setPasswordInPrepareUserWithSignToken(userId, password, signToken);
      return true;
    }),

  userExistsHasPhone: query(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 120 } })
    .param("phone", String)
    .exec(async function (phone) {
      return await this.userService.userExistsHasPhone(phone);
    }),
  setPhoneInPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false, rateLimit: { calls: 60 } })
    .body("userId", ID)
    .body("phone", String)
    .body("hash", String)
    .body("signupToken", String)
    .exec(async function (userId, phone, hash) {
      await this.userService.setPhoneInPrepareUser(userId, phone, hash);
      return true;
    }),
  verifyPhoneInPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false, rateLimit: { calls: 60 } })
    .body("userId", ID)
    .body("phone", String)
    .body("phoneCode", String)
    .body("signupToken", String)
    .exec(async function (userId, phone, phoneCode) {
      await this.userService.verifyPhoneInPrepareUser(userId, phone, phoneCode);
      return true;
    }),
  requestPhoneCodeForChangePhone: mutation(Boolean, {
    guards: [User],
    mcp: false,
    rateLimit: { calls: 5, by: "account" },
  })
    .body("phone", String)
    .body("hash", String)
    .with(Self)
    .exec(async function (phone, hash, self) {
      await this.userService.requestPhoneCodeForChangePhone(self.id, phone, hash);
      return true;
    }),
  setPhoneInActiveUser: mutation(Boolean, { guards: [User], mcp: false })
    .body("phone", String)
    .body("phoneCode", String)
    .with(Self)
    .exec(async function (phone, phoneCode, self) {
      await this.userService.setPhoneInActiveUser(self.id, phone, phoneCode);
      return true;
    }),
  requestPhoneCodeForSignin: mutation(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("phone", String)
    .body("hash", String)
    .exec(async function (phone, hash) {
      await this.userService.requestPhoneCodeForSignin(phone, hash);
      return true;
    }),
  getSignTokenForSignin: mutation(String, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("phone", String)
    .body("phoneCode", String)
    .exec(async function (phone, phoneCode) {
      return await this.userService.getSignTokenForSignin(phone, phoneCode);
    }),

  requestEmailCodeForResetPassword: mutation(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("accountId", String)
    .exec(async function (accountId) {
      await this.userService.requestEmailCodeForResetPassword(accountId);
      return true;
    }),
  verifyEmailCodeForResetPassword: mutation(String, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("accountId", String)
    .body("emailCode", String)
    .exec(async function (accountId, emailCode) {
      return await this.userService.verifyEmailCodeForResetPassword(accountId, emailCode);
    }),
  resetPasswordWithSignToken: mutation(Boolean, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("accountId", String)
    .body("password", String)
    .body("signToken", String)
    .exec(async function (accountId, password, signToken) {
      await this.userService.resetPasswordWithSignToken(accountId, password, signToken);
      return true;
    }),

  addUserRole: mutation(cnst.User, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("role", cnst.UserRole)
    .exec(async function (userId, role) {
      return await this.userService.addUserRole(userId, role);
    }),
  subUserRole: mutation(cnst.User, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("role", cnst.UserRole)
    .exec(async function (userId, role) {
      return await this.userService.subUserRole(userId, role);
    }),
  // Restricting and releasing an account is a moderation decision with a person behind it.
  restrictUser: mutation(Boolean, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("reason", String)
    .body("until", Date, { nullable: true })
    .exec(async function (userId, reason, until) {
      await this.userService.restrictUser(userId, reason, until);
      return true;
    }),
  releaseUser: mutation(Boolean, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .exec(async function (userId) {
      await this.userService.releaseUser(userId);
      return true;
    }),
  getRestrictInfo: query(cnst.RestrictInfo, { guards: [SelfOrAdmin], nullable: true })
    .param("userId", ID)
    .exec(async function (userId) {
      return await this.userService.getRestrictInfo(userId);
    }),
  setAccountIdByAdmin: mutation(Boolean, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("accountId", String)
    .exec(async function (userId, accountId) {
      await this.userService.setAccountId(userId, accountId);
      return true;
    }),
  // The next four change somebody else's credentials, so on an agent shelf they are account takeover with the
  // operator's own token. They stay page actions; `mcp: false` is curation, and HTTP serves them as before.
  setPasswordByAdmin: mutation(Boolean, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("password", String)
    .exec(async function (userId, password) {
      await this.userService.setPassword(userId, password);
      return true;
    }),
  setPhoneByAdmin: mutation(Boolean, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .body("phone", String)
    .exec(async function (userId, phone) {
      await this.userService.setPhone(userId, phone);
      return true;
    }),
  // Mints a token for someone else, so on an agent shelf it is a way around every other guard in the catalogue:
  // one call and the rest of the session acts as that account. Impersonation stays an operator action over HTTP.
  getAccessTokenByAdmin: query(cnst.util.AccessToken, { guards: [Admin], mcp: false })
    .param("userId", ID)
    .exec(async function (userId) {
      return makeAccessTokenResponse(await this.userService.getAccessTokenByAdmin(userId)) as never;
    }),
  getEncourageInfo: query(cnst.EncourageInfo, { guards: [Staff] })
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

  setNicknameOfPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("nickname", String)
    .body("signupToken", String)
    .exec(async function (userId, nickname) {
      await this.userService.setNicknameOfPrepareUser(userId, nickname);
      return true;
    }),
  setAppliedImagesOfPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("appliedImages", [String])
    .body("signupToken", String)
    .exec(async function (userId, appliedImages) {
      await this.userService.setAppliedImagesOfPrepareUser(userId, appliedImages);
      return true;
    }),
  setNameOfPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("name", String)
    .body("signupToken", String)
    .exec(async function (userId, name) {
      await this.userService.setNameOfPrepareUser(userId, name);
      return true;
    }),
  setAgreePoliciesOfPrepareUser: mutation(Boolean, { guards: [SignupHolder], mcp: false })
    .body("userId", ID)
    .body("agreePolicies", [String])
    .body("signupToken", String)
    .exec(async function (userId, agreePolicies) {
      await this.userService.setAgreePoliciesOfPrepareUser(userId, agreePolicies);
      return true;
    }),
  setNotiSettingOfUser: mutation(Boolean, { guards: [SelfOrAdmin] })
    .body("userId", ID)
    .body("notiSetting", cnst.NotiSetting)
    .exec(async function (userId, notiSetting) {
      return await this.userService.setNotiSettingOfUser(userId, notiSetting);
    }),
  // A device's push token, registered by the running client. There is no device on the other end of an MCP call.
  addNotiDeviceTokenOfSelf: mutation(Boolean, { guards: [User], mcp: false })
    .body("deviceToken", cnst.DeviceToken)
    .with(Self)
    .exec(async function (deviceToken, self) {
      return await this.userService.addNotiDeviceTokenOfUser(self.id, deviceToken);
    }),
  subNotiDeviceTokenOfSelf: mutation(Boolean, { guards: [User], mcp: false })
    .body("notiDeviceToken", String)
    .with(Self)
    .exec(async function (notiDeviceToken, self) {
      return await this.userService.subNotiDeviceTokenOfUser(self.id, notiDeviceToken);
    }),
  // `notiInfo` is a secret field, so the settings screen cannot read its own state off `self`. These two answer
  // the single question it has instead of handing back every device the account has ever registered.
  hasNotiDeviceTokenOfSelf: query(Boolean, { guards: [User], mcp: false })
    .search("notiDeviceToken", String)
    .with(Self)
    .exec(async function (notiDeviceToken, self) {
      if (!notiDeviceToken) return false;
      return await this.userService.hasNotiDeviceTokenOfUser(self.id, notiDeviceToken);
    }),
  notiSettingOfSelf: query(cnst.NotiSetting, { guards: [User], mcp: false })
    .with(Self)
    .exec(async function (self) {
      return await this.userService.getNotiSettingOfUser(self.id);
    }),

  github: query(Any, { guards: [SSO.Github] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("github", req as Bun.BunRequest, this.userService);
    }),
  githubCallback: query(Any, { guards: [SSO.Github], path: "github/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("github", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  google: query(Any, { guards: [SSO.Google] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("google", req as Bun.BunRequest, this.userService);
    }),
  googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("google", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  facebook: query(Any, { guards: [SSO.Facebook] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("facebook", req as Bun.BunRequest, this.userService);
    }),
  facebookCallback: query(Any, { guards: [SSO.Facebook], path: "facebook/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("facebook", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  apple: query(Any, { guards: [SSO.Apple] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("apple", req as Bun.BunRequest, this.userService);
    }),
  appleCallback: query(Any, { guards: [SSO.Apple], path: "apple/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("apple", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  kakao: query(Any, { guards: [SSO.Kakao] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("kakao", req as Bun.BunRequest, this.userService);
    }),
  kakaoCallback: query(Any, { guards: [SSO.Kakao], path: "kakao/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("kakao", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  naver: query(Any, { guards: [SSO.Naver] })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.start("naver", req as Bun.BunRequest, this.userService);
    }),
  naverCallback: query(Any, { guards: [SSO.Naver], path: "naver/callback" })
    .with(Req)
    .exec(async function (req) {
      return await SsoFlow.callback("naver", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
    }),
  exchangeSsoCode: mutation(cnst.SsoSignin, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("code", String)
    .body("codeVerifier", String)
    .with(Account)
    .exec(async function (code, codeVerifier, account) {
      return await this.userService.exchangeNativeSsoCode(code, codeVerifier, account);
    }),
  refreshJwt: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 60 } })
    .body("refreshToken", String, { nullable: true })
    .with(Account)
    .with(Req)
    .exec(async function (refreshToken, account, request) {
      const token = refreshToken ?? readRefreshTokenCookie(request.cookies, "user");
      if (!token) throw new Err("user.error.noRefreshToken");
      return makeAccessTokenResponse(
        await this.userService.refreshUserToken(token, account, { graceMs: browserRefreshGraceMs }),
      ) as never;
    }),
})) {}
