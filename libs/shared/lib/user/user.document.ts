import { dayjs } from "@akanjs/base";
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";
import { hashPassword, isPasswordMatch } from "@shared/nest";
import { randomString } from "@util/common";

import * as cnst from "../cnst";
import type * as db from "../db";
import { Revert } from "../dict";

export class UserFilter extends from(cnst.User, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.UserStatus])
      .query((statuses) => (statuses?.length ? { status: { $in: statuses } } : {})),
    byNickname: filter()
      .arg("nickname", String)
      .opt("status", cnst.UserStatus)
      .query((nickname, status) => ({ nickname, ...(status ? { status } : {}) })),
    byAccountId: filter()
      .arg("accountId", String)
      .opt("statuses", [cnst.UserStatus])
      .query((accountId, statuses) => ({ accountId, ...(statuses ? { status: { $in: statuses } } : {}) })),
    byPhone: filter()
      .arg("phone", String)
      .opt("statuses", [cnst.UserStatus])
      .query((phone, statuses) => ({ phone, ...(statuses ? { status: { $in: statuses } } : {}) })),
    byLoginAt: filter()
      .opt("from", Date)
      .opt("to", Date)
      .opt("statuses", [cnst.UserStatus])
      .query((from, to, statuses) => ({
        lastLoginAt: { ...(from ? { $gte: from.toDate() } : {}), ...(to ? { $lte: to.toDate() } : {}) },
        ...(statuses ? { status: { $in: statuses } } : {}),
      })),
  },
  sort: {},
})) {}

export class User extends by(cnst.User) {
  addRole(role: cnst.UserRole["value"]) {
    if (!this.roles.includes(role)) this.roles = [...this.roles, role];
    // void (this.constructor as UserModel["User"]).addSummary(role);
    return this;
  }
  subRole(role: cnst.UserRole["value"]) {
    this.roles = this.roles.filter((r) => r !== role);
    // void (this.constructor as UserModel["User"]).subSummary(role);
    return this;
  }
  addBadgeCount() {
    this.badgeCount++;
    return this;
  }
  subBadgeCount() {
    this.badgeCount--;
    if (this.badgeCount < 0) this.badgeCount = 0;
    return this;
  }
  approveImages() {
    this.images = this.appliedImages;
    this.appliedImages = [];
    if (["reapplied", "applied"].includes(this.profileStatus)) this.profileStatus = "approved";
    return this;
  }
  applyUserProfile() {
    if (!["rejected", "active", "applied"].includes(this.status)) throw new Error("Profile exam is not available.");
    // else if (!this.image || !this.images.length || !this.imageNum) throw new Error("Images are not uploaded.");
    else if (!this.appliedImages.length) throw new Error("Images are not uploaded.");
    this.profileStatus = "applied";
    return this;
  }
  approveUserProfile() {
    if (!["rejected", "active"].includes(this.status)) throw new Error("Profile exam is not available.");
    // if (this.profileStatus === "reapplied") {
    this.images = this.appliedImages;
    this.image = this.appliedImages[0];
    this.appliedImages = [];
    // }
    this.profileStatus = "approved";
    return this;
  }
}

export class UserModel extends into(User, UserFilter, cnst.user, () => ({})) {
  async getActiveUser(userId: string) {
    const user = await this.User.pickById(userId);
    if (user.status !== "active") throw new Error("User is not in active status");
    return user;
  }
  async getPrepareUser(userId: string) {
    const user = await this.User.pickById(userId);
    if (user.status !== "prepare") throw new Error("User is not in prepare status");
    return user;
  }
  async generatePrepareUser(userId?: string | null) {
    const user = userId
      ? await this.User.pickById(userId)
      : await this.createUser({ nickname: "", images: [], appliedImages: [] });
    if (user.status !== "prepare") throw new Error("User is not in prepare status");
    return user;
  }
  async setSignToken(userId: string, signToken = randomString(36), expireAt = dayjs().add(30, "minute")) {
    await this.userCache.set("signToken", userId, signToken, { expireAt });
    return signToken;
  }
  async verifySignToken(userId: string, signToken: string) {
    const existingSignToken = await this.userCache.get<string>("signToken", userId);
    const isVerified = signToken === existingSignToken;
    if (!isVerified) return false;
    await this.userCache.delete("signToken", userId);
    return true;
  }
  async getAccountId<Throw extends boolean = true>(
    userId: string,
    throwError: Throw = true as Throw
  ): Promise<Throw extends true ? string : string | null> {
    const accountId = (await this.User.pickById(userId, { accountId: true })).accountId;
    if (!accountId && throwError) throw new Error("No Account Id");
    return accountId as Throw extends true ? string : string | null;
  }
  async setAccountIdInPrepareUser(userId: string, accountId: string, resignupDays = 0) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("AccountId already exists");
    const inactiveUser = await this.User.findOne({ accountId, removedAt: { $exists: true } }).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Error(`Retry after ${resignupDays} days`);
    await this.User.updateMany({ accountId, status: "prepare" }, { $unset: { accountId: "" } });
    const modifiedCount = await this.User.updateOne(
      { _id: userId },
      { $set: { accountId }, $pull: { verifies: "password" } }
    );
    return !!modifiedCount;
  }
  async setAccountIdInActiveUser(userId: string, accountId: string) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("AccountId already exists");
    await this.User.updateMany({ accountId, status: "prepare" }, { $unset: { accountId: "" } });
    const modifiedCount = await this.User.updateOne({ _id: userId }, { $set: { accountId } });
    return !!modifiedCount;
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    const { accountId: existingAccountId } = await this.User.pickById(userId, { accountId: true });
    if (!existingAccountId) throw new Error("No accountId in this user");
    if (existingAccountId !== accountId) throw new Error("Invalid accountId");
    const modifiedCount = await this.User.updateOne(
      { _id: userId },
      { $set: { password: await hashPassword(password) }, $addToSet: { verifies: "password" } }
    );
    return !!modifiedCount;
  }
  async getUserByPassword(accountId: string, password: string) {
    const auth = (await this.findByAccountId(accountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, password: true },
    })) as { accountId: string; password: string } | null;
    if (!auth) throw new Revert("user.error.noAccount");
    if (!auth.accountId) throw new Error("No accountId in this user");
    if (!auth.password) throw new Error("No password in this user");
    const isMatched = await isPasswordMatch(password, auth.password);
    if (!isMatched) throw new Revert("user.error.wrongPassword");
    const user = await this.pickByAccountId(accountId);
    return user;
  }
  async setPasswordInActiveUser(userId: string, password: string) {
    const modifiedCount = await this.User.updateOne(
      { _id: userId },
      { $set: { password: await hashPassword(password) }, $addToSet: { verifies: "password" } }
    );
    return !!modifiedCount;
  }
  async logResetTime(userId: string, at = dayjs()) {
    await this.userCache.set("lastResetAt", userId, at.toDate().getTime(), { expireAt: at.add(3, "minute") });
  }
  async isResetable(userId: string) {
    const lastResetTime = await this.userCache.get<number>("lastResetAt", userId);
    const lastResetAt = lastResetTime ? dayjs(lastResetTime) : undefined;
    const isResetable = !lastResetAt || lastResetAt.isBefore(dayjs().subtract(3, "minute"));
    return isResetable;
  }
  async addSso(userId: string, accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.User.pickById(userId, { accountId: true })) as { accountId?: string };
    if (!auth.accountId) throw new Error("No accountId in this user");
    if (auth.accountId !== accountId) throw new Error("Invalid accountId");
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $addToSet: { verifies: ssoType } });
    return !!modifiedCount;
  }
  async subSso(userId: string, accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.User.pickById(userId, { accountId: true })) as { accountId?: string };
    if (!auth.accountId) throw new Error("No accountId in this user");
    if (auth.accountId !== accountId) throw new Error("Invalid accountId");
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $pull: { verifies: ssoType } });
    return !!modifiedCount;
  }
  async getUserBySso(accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.User.pickOne({ accountId }, { accountId: true, verifies: true })) as Pick<
      User,
      "accountId" | "verifies"
    >;
    if (!auth.accountId) throw new Error("No accountId in this user");
    if (!auth.verifies.includes(ssoType)) throw new Error("No ssoType in this user");
    return await this.pickByAccountId(accountId);
  }
  async isSignableWithPhone(phone: string, resignupDays = 0) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    return !userExists;
  }
  async registerPhoneCode(userId: string, phone: string, purpose: string, phoneCode: string) {
    const existingPhoneCodesStr = await this.userCache.get<string>("phoneCodes", userId);
    const existingPhoneCodes = existingPhoneCodesStr
      ? existingPhoneCodesStr.split(",").map((str) => str.split(":") as [string, string, string])
      : [];
    if (existingPhoneCodes.length >= 5) throw new Error("Too many phone codes, try later");
    const newPhoneCodes = [...existingPhoneCodes, [phone, purpose, phoneCode]];
    const newPhoneCodesStr = newPhoneCodes
      .map(([phone, purpose, phoneCode]) => `${phone}:${purpose}:${phoneCode}`)
      .join(",");
    await this.userCache.set("phoneCodes", userId, newPhoneCodesStr, { expireAt: dayjs().add(3, "minute") });
    return phoneCode;
  }
  async isPhoneCodeValid(userId: string, phone: string, purpose: string, phoneCode: string) {
    const existingPhoneCodesStr = await this.userCache.get<string>("phoneCodes", userId);
    const existingPhoneCodes = existingPhoneCodesStr
      ? existingPhoneCodesStr.split(",").map((str) => str.split(":") as [string, string, string])
      : [];
    const existingPhoneCode = existingPhoneCodes.find(
      ([p, pu, code]) => p === phone && pu === purpose && code === phoneCode
    );
    if (!existingPhoneCode) return false;
    await this.userCache.delete("phoneCodes", userId);
    return true;
  }
  async setPhoneInPrepareUser(userId: string, phone: string, resignupDays = 0) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("Phone already exists");
    const inactiveUser = await this.User.findOne({ phone, removedAt: { $exists: true } }).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Error(`Retry after ${resignupDays} days`);
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { phone } });
    return !!modifiedCount;
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("Phone already exists");

    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone !== phone) throw new Error("Invalid phone number");

    await this.User.updateMany({ phone, status: "prepare" }, { $unset: { phone: "" }, $pull: { verifies: "phone" } });
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $set: { phone }, $addToSet: { verifies: "phone" } }
    );
    return !!modifiedCount;
  }
  async setPhoneInActiveUser(userId: string, phone: string) {
    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone === phone) throw new Error("Already set the same phone number");
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("Phone already exists");
    await this.User.updateMany({ phone, status: "prepare" }, { $unset: { phone: "" }, $pull: { verifies: "phone" } });
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $set: { phone }, $addToSet: { verifies: "phone" } }
    );
    return !!modifiedCount;
  }

  async setSsoInPrepareUser(userId: string, accountId: string, ssoType: cnst.SsoType["value"], resignupDays = 0) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Error("AccountId already exists");
    const inactiveUser = await this.User.findOne({ accountId, removedAt: { $exists: true } }).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Error(`Retry after ${resignupDays} days`);
    await this.User.updateMany(
      { accountId, status: "prepare" },
      { $unset: { accountId: "" }, $pull: { verifies: ssoType } }
    );
    const modifiedCount = await this.User.updateOne(
      { _id: userId },
      { $set: { accountId }, $addToSet: { verifies: ssoType } }
    );
    return !!modifiedCount;
  }
  async getActiveUserBySso(accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.pickByAccountId(accountId, ["active", "restricted", "dormant"], {
      select: { accountId: true, verifies: true },
    })) as Pick<User, "id" | "accountId" | "verifies">;
    if (!auth.verifies.includes(ssoType)) throw new Error(`No verifies ${ssoType} in this user`);
    const user = await this.getUser(auth.id);
    return user;
  }
  async setName(userId: string, name: string) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { name } });
    return !!modifiedCount;
  }
  async setNickname(userId: string, nickname: string) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { nickname } });
    return !!modifiedCount;
  }
  async setAppliedImages(userId: string, appliedImages: string[]) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { appliedImages } });
    return !!modifiedCount;
  }
  async setAgreePolicies(userId: string, agreePolicies: string[]) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { agreePolicies } });
    return !!modifiedCount;
  }
  async setDiscord(userId: string, discord: { nickname?: string; user?: { username: string } }) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { discord } });
    return !!modifiedCount;
  }
  async setNotiSetting(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $set: { "notiInfo.setting": notiSetting } });
    return !!modifiedCount;
  }
  async addNotiDeviceToken(userId: string, token: string) {
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $addToSet: { "notiInfo.deviceTokens": token } }
    );
    return !!modifiedCount;
  }
  async subNotiDeviceToken(userId: string, token: string) {
    const { modifiedCount } = await this.User.updateOne({ _id: userId }, { $pull: { "notiInfo.deviceTokens": token } });
    return !!modifiedCount;
  }
  async getRestrictInfo(userId: string) {
    const { restrictInfo } = (await this.User.pickById(userId, { restrictInfo: true })) as {
      restrictInfo?: db.RestrictInfo;
    };
    return restrictInfo;
  }
  async restrict(userId: string, reason: string, until = dayjs().add(1, "year")) {
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $set: { "restrictInfo.reason": reason, "restrictInfo.until": until.toDate() } }
    );
    return !!modifiedCount;
  }
  async release(userId: string) {
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $unset: { "restrictInfo.reason": "", "restrictInfo.until": "" } }
    );
    return !!modifiedCount;
  }
  async getEncourageInfo(userId: string) {
    const { encourageInfo } = (await this.User.pickById(userId, { encourageInfo: true })) as {
      encourageInfo: db.EncourageInfo;
    };
    return encourageInfo;
  }
  async setJourney(userId: string, journey: cnst.Journey["value"], journeyAt = dayjs()) {
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $set: { "encourageInfo.journey": journey, "encourageInfo.journeyAt": journeyAt.toDate() } }
    );
    return !!modifiedCount;
  }
  async setInquiry(userId: string, inquiry: cnst.Inquiry["value"], inquiryAt = dayjs()) {
    const { modifiedCount } = await this.User.updateOne(
      { _id: userId },
      { $set: { "encourageInfo.inquiry": inquiry, "encourageInfo.inquiryAt": inquiryAt.toDate() } }
    );
    return !!modifiedCount;
  }
  async setRemoteAuthToken(remoteId: string, token: string) {
    await this.userCache.set("remoteAuthToken", remoteId, token, { expireAt: dayjs().add(30, "second") });
  }
  async getRemoteAuthToken(remoteId: string) {
    return await this.userCache.get<string>("remoteAuthToken", remoteId);
  }
}

export class UserMiddleware extends beyond(UserModel, User) {
  onSchema(schema: SchemaOf<UserModel, User>) {
    schema.pre<User>("save", function (next) {
      if (this.isModified("images")) {
        this.imageNum = this.images.length;
        // if (["approved", "reserved", "rejected"].includes(this.profileStatus)) this.profileStatus = "applied";
        if (this.profileStatus === "active") this.profileStatus = "prepare";
      }
      next();
    });
  }
}
