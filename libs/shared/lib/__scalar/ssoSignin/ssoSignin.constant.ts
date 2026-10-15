import { ID } from "akanjs/base";
import { via } from "akanjs/constant";

export class SsoSignin extends via((field) => ({
  jwt: field(String).optional(),
  refreshToken: field(String).optional(),
  prepareUserId: field(ID).optional(), // set instead of the tokens when the account has no user yet and must sign up
  signupToken: field(String).optional(), // set with prepareUserId; the sign-up steps require it
})) {}
