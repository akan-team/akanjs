import { Account, makeAccessTokenResponse, makeSignupTicketResponse, SignupToken } from "@libs/shared/srvkit";
import { endpoint, internal, Public, Req } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class SignInternal extends internal(srv.sign, () => ({})) {}

export class SignEndpoint extends endpoint(srv.sign, ({ mutation }) => ({
  // The combined steps are each `[Public]` or held by the token this call mints, and the tightest of their limits applies.
  generatePrepareUserWithAccountId: mutation(cnst.SignupTicket, {
    guards: [Public],
    mcp: false,
    rateLimit: { calls: 60 },
    errors: { 400: ["user.error.signupAccountIdNotEmail"] },
  })
    .body("accountId", String)
    .body("requestEmailCode", Boolean)
    .exec(async function (accountId, requestEmailCode) {
      return makeSignupTicketResponse(
        await this.signService.openSignupWithAccountId(accountId, requestEmailCode),
      ) as never;
    }),
  startPhoneSign: mutation(cnst.SignupTicket, {
    guards: [Public],
    nullable: true,
    mcp: false,
    rateLimit: { calls: 20 },
  })
    .body("phone", String)
    .body("hash", String)
    .body("signupToken", String, { nullable: true })
    .with(Req)
    .exec(async function (phone, hash, signupToken, req) {
      const ticket = await this.signService.startPhoneSign(phone, hash, signupToken || SignupToken.cookieOf(req));
      return ticket ? (makeSignupTicketResponse(ticket) as never) : null;
    }),
  signinWithPhoneCode: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 20 } })
    .body("phone", String)
    .body("phoneCode", String)
    .with(Account)
    .exec(async function (phone, phoneCode, account) {
      return makeAccessTokenResponse(await this.signService.signinWithPhoneCode(phone, phoneCode, account)) as never;
    }),
})) {}
