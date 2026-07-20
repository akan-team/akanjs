import {
  Account,
  Admin,
  Every,
  extractFacebookProfile,
  extractGithubProfile,
  extractGoogleProfile,
  extractKakaoProfile,
  extractNaverProfile,
  type FacebookResponse,
  type GithubResponse,
  type GoogleResponse,
  getSsoCode,
  getSsoOrigin,
  type KakaoResponse,
  makeAccessTokenResponse,
  makeOAuthRedirectResponse,
  makeSignoutResponse,
  makeSsoRedirectResponse,
  type NaverResponse,
  Self,
  SelfOrAdmin,
  type SerAccount,
  SSO,
  type SsoCookie,
  User,
} from "@libs/shared/srvkit";
import { Any, ID } from "akanjs/base";
import { endpoint, internal, Public, Req, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import { Err } from "../dict";
import * as srv from "../srv";

export class UserInternal extends internal(srv.user, () => ({})) {}

export class UserSlice extends slice(
  srv.user,
  { guards: { root: Admin, get: Public, cru: Every, remove: SelfOrAdmin } },
  () => ({}),
) {}

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
  getSelf: query(cnst.User, { nullable: true })
    .with(Self, { nullable: true })
    .exec(async function (self) {
      if (!self) return null;
      return await this.userService.getUser(self.id);
    }),
  signinWithSignToken: mutation(cnst.util.AccessToken)
    .param("userId", ID)
    .body("signToken", String)
    .exec(async function (userId, signToken) {
      return makeAccessTokenResponse(await this.userService.signinWithSignToken(userId, signToken)) as never;
    }),
  signoutUser: mutation(cnst.util.AccessToken)
    .with(Account)
    .exec(async function (account) {
      return makeSignoutResponse(await this.userService.signoutUser(account)) as never;
    }),
  activateUser: mutation(cnst.util.AccessToken)
    .param("userId", ID)
    .with(Account)
    .exec(async function (userId, account) {
      return makeAccessTokenResponse(await this.userService.activateUser(userId, account)) as never;
    }),
  generatePrepareUser: mutation(cnst.User)
    .body("userId", ID, { nullable: true })
    .body("token", String)
    .exec(async function (userId, token) {
      // TODO: 임시 비활
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
      // TODO: 임시 비활
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
      // TODO: 임시 비활
      //if (!(await this.cloudflareService.isVerified(token))) throw new Error("Invalid Turnstile Token");
      return makeAccessTokenResponse(await this.userService.signinWithPassword(accountId, password, account)) as never;
    }),
  changePassword: mutation(Boolean, { guards: [Every] })
    .body("password", String)
    .body("prevPassword", String)
    .body("token", String)
    .with(Self)
    .exec(async function (password, prevPassword, token, self) {
      // TODO: 임시 비활
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
      return makeAccessTokenResponse(await this.userService.getAccessTokenByAdmin(userId)) as never;
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
    .body<"discord", { nickname?: string; user?: { username: string } }>("discord", Any)
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
  github: query(Any, { guards: [SSO.Github] })
    .with(Req)
    .exec((request) => makeOAuthRedirectResponse("github", request as Bun.BunRequest)),
  githubCallback: query(Any, { guards: [SSO.Github], path: "github/callback" })
    .with(Req)
    .exec(async function (request) {
      const req = request as Bun.BunRequest & { user?: GithubResponse; account?: SerAccount };
      const githubUser = req.user ?? (await extractGithubProfile(getSsoCode(req), getSsoOrigin(req)));
      const { username: accountId } = githubUser;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "github",
        req.cookies.toJSON() as unknown as SsoCookie,
        req.account as SerAccount | undefined,
      );
      return makeSsoRedirectResponse(redirect, cookie);
    }),
  google: query(Any, { guards: [SSO.Google] })
    .with(Req)
    .exec((request) => makeOAuthRedirectResponse("google", request as Bun.BunRequest)),
  googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
    .with(Req)
    .exec(async function (request) {
      const req = request as Bun.BunRequest & { user?: GoogleResponse; account?: SerAccount };
      const googleUser = req.user ?? (await extractGoogleProfile(getSsoCode(req), getSsoOrigin(req)));
      const accountId = googleUser.emails[0].value;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "google",
        req.cookies.toJSON() as unknown as SsoCookie,
        req.account as SerAccount | undefined,
      );
      return makeSsoRedirectResponse(redirect, cookie);
    }),
  facebook: query(Any, { guards: [SSO.Facebook] })
    .with(Req)
    .exec((request) => makeOAuthRedirectResponse("facebook", request as Bun.BunRequest)),
  facebookCallback: query(Any, { guards: [SSO.Facebook], path: "facebook/callback" })
    .with(Req)
    .exec(async function (request) {
      const req = request as Bun.BunRequest & { user?: FacebookResponse; account?: SerAccount };
      const facebookUser = req.user ?? (await extractFacebookProfile(getSsoCode(req), getSsoOrigin(req)));
      const accountId = facebookUser.emails[0].value;
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "facebook",
        req.cookies.toJSON() as unknown as SsoCookie,
        req.account as SerAccount | undefined,
      );
      return makeSsoRedirectResponse(redirect, cookie);
    }),
  apple: query(String, { guards: [SSO.Apple] }).exec(() => "unreachable"),
  appleCallback: query(Any, { guards: [SSO.Apple], path: "apple/callback" })
    .with(Req)
    .exec(async () => {
      // const sso = this.securityOption.sso.apple as AppleCredential;
      // if (!payload.code || !sso) throw new Error("Invalid Apple SSO");
      // return verifyAppleUser(payload, this.options.origin, sso);
    }),
  kakao: query(Any, { guards: [SSO.Kakao] })
    .with(Req)
    .exec((request) => makeOAuthRedirectResponse("kakao", request as Bun.BunRequest)),
  kakaoCallback: query(Any, { guards: [SSO.Kakao], path: "kakao/callback" })
    .with(Req)
    .exec(async function (request) {
      const req = request as Bun.BunRequest & { user?: KakaoResponse; account?: SerAccount };
      const { email: accountId } = req.user ?? (await extractKakaoProfile(getSsoCode(req), getSsoOrigin(req)));
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "kakao",
        req.cookies.toJSON() as unknown as SsoCookie,
        req.account as SerAccount | undefined,
      );
      return makeSsoRedirectResponse(redirect, cookie);
    }),
  naver: query(Any, { guards: [SSO.Naver] })
    .with(Req)
    .exec((request) => makeOAuthRedirectResponse("naver", request as Bun.BunRequest)),
  naverCallback: query(Any, { guards: [SSO.Naver], path: "naver/callback" })
    .with(Req)
    .exec(async function (request) {
      const req = request as Bun.BunRequest & { user?: NaverResponse; account?: SerAccount };
      const { email: accountId } = req.user ?? (await extractNaverProfile(getSsoCode(req), getSsoOrigin(req)));
      const { cookie, redirect } = await this.userService.handleSsoCallback(
        accountId,
        "naver",
        req.cookies.toJSON() as unknown as SsoCookie,
        req.account as SerAccount | undefined,
      );
      return makeSsoRedirectResponse(redirect, cookie);
    }),
  //*====================== SSO Area ======================*//
  //*======================================================*//
  refreshJwt: mutation(cnst.util.AccessToken)
    .body("refreshToken", String, { nullable: true })
    .with(Account)
    .with(Req)
    .exec(async function (refreshToken, account, request) {
      const token = refreshToken ?? (request as Bun.BunRequest).cookies.get("userRefreshToken");
      if (!token) throw new Err("user.error.noRefreshToken");
      const accessToken = await this.userService.refreshUserToken(token, account);
      return new Response(JSON.stringify(accessToken), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `userRefreshToken=${encodeURIComponent(accessToken.refreshToken ?? "")}; Path=/; SameSite=Lax; HttpOnly`,
        },
      }) as never;
    }),
})) {}
