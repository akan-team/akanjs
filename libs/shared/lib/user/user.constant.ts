import { Any, dayjs, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { EncourageInfo } from "../__scalar/encourageInfo/encourageInfo.constant";
import { LeaveInfo } from "../__scalar/leaveInfo/leaveInfo.constant";
import { NotiInfo } from "../__scalar/notiInfo/notiInfo.constant";
import { RestrictInfo } from "../__scalar/restrictInfo/restrictInfo.constant";
import { File } from "../file/file.constant";

export class SsoType extends enumOf("ssoType", ["naver", "kakao", "github", "google", "apple", "facebook"] as const) {}

export class Verify extends enumOf("verify", [...SsoType.values, "wallet", "password", "phone", "email"] as const) {
  //? github is not one: its accountId is the GitHub user id, not an address.
  static provesEmail = ["email", "google", "kakao", "naver", "apple", "facebook"] as const;
  //? A password proves nothing about who signs up, so on its own it would let anyone claim someone else's address.
  static provesIdentity = [...SsoType.values, "wallet", "phone", "email"] as const;
  static isEmailProof(verify: string) {
    return (Verify.provesEmail as readonly string[]).includes(verify);
  }
}

export class UserRole extends enumOf("userRole", ["root", "admin", "user", "business", "guest"] as const) {}

export class ProfileStatus extends enumOf("profileStatus", [
  "active",
  "prepare",
  "applied",
  "approved",
  "reapplied",
  "featured",
  "reserved",
  "rejected",
] as const) {}

export class UserStatus extends enumOf("userStatus", ["prepare", "active", "dormant", "restricted"] as const) {}

export class UserInput extends via((field) => ({
  nickname: field(String, { default: "", maxlength: 20, text: "title" }),
  image: field(File, { text: "thumb" }).optional(),
  images: field([File]),
})) {}

export class UserObject extends via(UserInput, (field) => ({
  name: field.secret(String).optional(),
  agreePolicies: field.secret([String]),
  discord: field.secret<{ nickname?: string; user?: { username: string } }>(Any, { default: {} }),
  accountId: field.secret(String).optional(),
  password: field.secret(String).optional(),
  phone: field.secret(String).optional(),
  notiInfo: field.secret(NotiInfo, { default: () => new NotiInfo() }),
  imageNum: field.secret(Int, { default: 0 }),
  encourageInfo: field.secret(EncourageInfo, { default: () => new EncourageInfo() }),
  restrictInfo: field.secret(RestrictInfo).optional(),
  leaveInfo: field.secret(LeaveInfo).optional(),
  verifies: field([Verify]),
  verifiedEmails: field.secret([String]), // addresses proven after sign-up, lowercased; none of them signs in
  roles: field([UserRole], { default: ["user"], text: "filter" }),
  playing: field([String]),
  isOnline: field(Boolean, { default: true }),
  lastLoginAt: field(Date, { default: () => dayjs() }),
  joinAt: field(Date).optional(),
  profileStatus: field(ProfileStatus, { default: "prepare", text: "filter" }),
  badgeCount: field(Int, { default: 0 }),
  status: field(UserStatus, { default: "prepare", text: "filter" }),
})) {}

export class LightUser extends via(
  UserObject,
  ["image", "nickname", "playing", "profileStatus", "lastLoginAt", "status"] as const,
  (resolve) => ({}),
) {}

export class User extends via(UserObject, LightUser, (resolve) => ({})) {}

export class UserInsight extends via(User, (field) => ({})) {}
