import {
  createRefreshSession,
  hashPassword,
  isPasswordMatch,
  revokeRefreshSessionBySid,
  revokeRefreshSessions,
  rotateRefreshSession,
} from "@libs/shared/srvkit";
import { randomString } from "@libs/util/common";
import { dayjs } from "akanjs/base";
import { by, documentQueryHelper, from, into, type SchemaOf } from "akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";
import { Err } from "../dict";

export class UserFilter extends from(cnst.User, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.UserStatus])
      .query((statuses, q) => (statuses?.length ? { status: q.oneOf(statuses) } : {})),
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.UserStatus])
      .query((text, statuses, q) =>
        q.all(q.search(text, { prefix: true }), statuses?.length ? { status: q.oneOf(statuses) } : {}),
      ),
    byNickname: filter()
      .arg("nickname", String)
      .opt("status", cnst.UserStatus)
      .query((nickname, status) => ({ nickname, ...(status ? { status } : {}) })),
    byAccountId: filter()
      .arg("accountId", String)
      .opt("statuses", [cnst.UserStatus])
      .query((accountId, statuses, q) => {
        return {
          accountId,
          ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
        };
      }),
    byPhone: filter()
      .arg("phone", String)
      .opt("statuses", [cnst.UserStatus])
      .query((phone, statuses, q) => ({
        phone,
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
      })),
    byLoginAt: filter()
      .opt("from", Date)
      .opt("to", Date)
      .opt("statuses", [cnst.UserStatus])
      .query((from, to, statuses, q) => {
        const lastLoginAtQuery =
          from && to
            ? { lastLoginAt: q.between(from.toDate(), to.toDate()) }
            : from
              ? { lastLoginAt: q.gte(from.toDate()) }
              : to
                ? { lastLoginAt: q.lte(to.toDate()) }
                : {};
        return { ...lastLoginAtQuery, ...(statuses?.length ? { status: q.oneOf(statuses) } : {}) };
      }),
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
    if (!["rejected", "active", "applied"].includes(this.status)) throw new Err("user.error.profileExamNotAvailable");
    // else if (!this.image || !this.images.length || !this.imageNum) throw new Error("Images are not uploaded.");
    else if (!this.appliedImages.length) throw new Err("user.error.imagesNotUploaded");
    this.profileStatus = "applied";
    return this;
  }
  approveUserProfile() {
    if (!["rejected", "active"].includes(this.status)) throw new Err("user.error.profileExamNotAvailable");
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
  static override _onSchema(schema: SchemaOf<UserModel, User>) {
    schema.pre<User>("save", function (next) {
      if (this.isModified("images")) {
        this.imageNum = this.images.length;
        if (this.profileStatus === "active") this.profileStatus = "prepare";
      }
    });
  }
  async getActiveUser(userId: string) {
    const user = await this.User.pickById(userId);
    if (user.status !== "active") throw new Err("user.error.userNotActive");
    return user;
  }
  async getPrepareUser(userId: string) {
    const user = await this.User.pickById(userId);
    if (user.status !== "prepare") throw new Err("user.error.userNotPrepare");
    return user;
  }
  async generatePrepareUser(userId?: string | null) {
    const user = userId
      ? await this.User.pickById(userId)
      : await this.createUser({ nickname: "", images: [], appliedImages: [] });
    if (user.status !== "prepare") throw new Err("user.error.userNotPrepare");
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
  async createRefreshSession(userId: string, refreshTokenHash: string, expiresAt: Date, userAgent?: string) {
    return await createRefreshSession(this.userCache, {
      subject: "user",
      subjectId: userId,
      refreshTokenHash,
      expiresAt,
      userAgent,
    });
  }
  async rotateRefreshSession(refreshTokenHash: string, nextRefreshTokenHash: string, nextExpiresAt: Date) {
    return await rotateRefreshSession(this.userCache, refreshTokenHash, nextRefreshTokenHash, nextExpiresAt);
  }
  async revokeRefreshSession(userId: string, sessionId?: string) {
    await revokeRefreshSessionBySid(this.userCache, "user", userId, sessionId);
  }
  async revokeRefreshSessions(userId: string) {
    await revokeRefreshSessions(this.userCache, "user", userId);
  }
  async getAccountId<Throw extends boolean = true>(
    userId: string,
    throwError: Throw = true as Throw,
  ): Promise<Throw extends true ? string : string | null> {
    const accountId = (await this.User.pickById(userId, { accountId: true })).accountId;
    if (!accountId && throwError) throw new Err("user.error.noAccountId");
    return accountId as Throw extends true ? string : string | null;
  }
  async setAccountIdInPrepareUser(userId: string, accountId: string, resignupDays = 0) {
    const q = documentQueryHelper;
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    const inactiveUser = await this.User.findOne(q.all({ accountId }, q.exists("removedAt"))).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Err("user.error.resignupNotAvailable", { days: resignupDays });
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset }) => ({ accountId: unset() }));
    const modifiedCount = await this.User.updateOne({ id: userId }, ({ pull }) => ({
      accountId,
      verifies: pull("password"),
    }));
    return !!modifiedCount;
  }
  async setAccountIdInActiveUser(userId: string, accountId: string) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset }) => ({ accountId: unset() }));
    const modifiedCount = await this.User.updateOne({ id: userId }, { accountId });
    return !!modifiedCount;
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    const { accountId: existingAccountId } = await this.User.pickById(userId, { accountId: true });
    if (!existingAccountId) throw new Err("user.error.noAccountIdInUser");
    if (existingAccountId !== accountId) throw new Err("user.error.invalidAccountId");
    const hashedPassword = await hashPassword(password);
    const modifiedCount = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      password: hashedPassword,
      verifies: addToSet("password"),
    }));
    return !!modifiedCount;
  }
  async getUserByPassword(accountId: string, password: string) {
    const auth = (await this.findByAccountId(accountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, password: true },
    })) as { accountId: string; password: string } | null;
    if (!auth) throw new Err("user.error.noAccount");
    if (!auth.accountId) throw new Err("user.error.noAccountIdInUser");
    if (!auth.password) throw new Err("user.error.noPasswordInUser");
    const isMatched = await isPasswordMatch(password, auth.password);
    if (!isMatched) throw new Err("user.error.wrongPassword");
    const user = await this.pickByAccountId(accountId);
    return user;
  }
  async setPasswordInActiveUser(userId: string, password: string) {
    const hashedPassword = await hashPassword(password);
    const modifiedCount = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      password: hashedPassword,
      verifies: addToSet("password"),
    }));
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
    if (!auth.accountId) throw new Err("user.error.noAccountIdInUser");
    if (auth.accountId !== accountId) throw new Err("user.error.invalidAccountId");
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      verifies: addToSet(ssoType),
    }));
    return !!modifiedCount;
  }
  async subSso(userId: string, accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.User.pickById(userId, { accountId: true })) as { accountId?: string };
    if (!auth.accountId) throw new Err("user.error.noAccountIdInUser");
    if (auth.accountId !== accountId) throw new Err("user.error.invalidAccountId");
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ pull }) => ({
      verifies: pull(ssoType),
    }));
    return !!modifiedCount;
  }
  async getUserBySso(accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.User.pickOne({ accountId }, { accountId: true, verifies: true })) as Pick<
      User,
      "accountId" | "verifies"
    >;
    if (!auth.accountId) throw new Err("user.error.noAccountIdInUser");
    if (!auth.verifies.includes(ssoType)) throw new Err("user.error.noSsoTypeInUser");
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
    if (existingPhoneCodes.length >= 5) throw new Err("user.error.tooManyPhoneCodes");
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
      ([p, pu, code]) => p === phone && pu === purpose && code === phoneCode,
    );
    if (!existingPhoneCode) return false;
    await this.userCache.delete("phoneCodes", userId);
    return true;
  }
  async setPhoneInPrepareUser(userId: string, phone: string, resignupDays = 0) {
    const q = documentQueryHelper;
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");
    const inactiveUser = await this.User.findOne(q.all({ phone }, q.exists("removedAt"))).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Err("user.error.resignupNotAvailable", { days: resignupDays });
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { phone });
    return !!modifiedCount;
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");

    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone !== phone) throw new Err("user.error.invalidPhoneNumber");

    await this.User.updateMany({ phone, status: "prepare" }, ({ unset, pull }) => ({
      phone: unset(),
      verifies: pull("phone"),
    }));
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      phone,
      verifies: addToSet("phone"),
    }));
    return !!modifiedCount;
  }
  async setPhoneInActiveUser(userId: string, phone: string) {
    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone === phone) throw new Err("user.error.phoneNumberUnchanged");
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");
    await this.User.updateMany({ phone, status: "prepare" }, ({ unset, pull }) => ({
      phone: unset(),
      verifies: pull("phone"),
    }));
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      phone,
      verifies: addToSet("phone"),
    }));
    return !!modifiedCount;
  }

  async setSsoInPrepareUser(userId: string, accountId: string, ssoType: cnst.SsoType["value"], resignupDays = 0) {
    const q = documentQueryHelper;
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    const inactiveUser = await this.User.findOne(q.all({ accountId }, q.exists("removedAt"))).sort({ createdAt: -1 });
    const isSignable = inactiveUser ? inactiveUser.createdAt.isBefore(dayjs().subtract(resignupDays, "day")) : true;
    if (!isSignable) throw new Err("user.error.resignupNotAvailable", { days: resignupDays });
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset, pull }) => ({
      accountId: unset(),
      verifies: pull(ssoType),
    }));
    const modifiedCount = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      accountId,
      verifies: addToSet(ssoType),
    }));
    return !!modifiedCount;
  }
  async getActiveUserBySso(accountId: string, ssoType: cnst.SsoType["value"]) {
    const auth = (await this.pickByAccountId(accountId, ["active", "restricted", "dormant"], {
      select: { accountId: true, verifies: true },
    })) as Pick<User, "id" | "accountId" | "verifies">;
    if (!auth.verifies.includes(ssoType)) throw new Err("user.error.noVerifiesInUser", { ssoType });
    const user = await this.getUser(auth.id);
    return user;
  }
  async setName(userId: string, name: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { name });
    return !!modifiedCount;
  }
  async setNickname(userId: string, nickname: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { nickname });
    return !!modifiedCount;
  }
  async setAppliedImages(userId: string, appliedImages: string[]) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { appliedImages });
    return !!modifiedCount;
  }
  async setAgreePolicies(userId: string, agreePolicies: string[]) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { agreePolicies });
    return !!modifiedCount;
  }
  async setDiscord(userId: string, discord: { nickname?: string; user?: { username: string } }) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { discord });
    return !!modifiedCount;
  }
  async setNotiSetting(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { "notiInfo.setting": notiSetting });
    return !!modifiedCount;
  }
  async addNotiDeviceToken(userId: string, token: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      "notiInfo.deviceTokens": addToSet(token),
    }));
    return !!modifiedCount;
  }
  async subNotiDeviceToken(userId: string, token: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ pull }) => ({
      "notiInfo.deviceTokens": pull(token),
    }));
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
      { id: userId },
      { "restrictInfo.reason": reason, "restrictInfo.until": until.toDate() },
    );
    return !!modifiedCount;
  }
  async release(userId: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ unset }) => ({
      "restrictInfo.reason": unset(),
      "restrictInfo.until": unset(),
    }));
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
      { id: userId },
      { "encourageInfo.journey": journey, "encourageInfo.journeyAt": journeyAt.toDate() },
    );
    return !!modifiedCount;
  }
  async setInquiry(userId: string, inquiry: cnst.Inquiry["value"], inquiryAt = dayjs()) {
    const { modifiedCount } = await this.User.updateOne(
      { id: userId },
      { "encourageInfo.inquiry": inquiry, "encourageInfo.inquiryAt": inquiryAt.toDate() },
    );
    return !!modifiedCount;
  }
}
