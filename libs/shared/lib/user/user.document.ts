import {
  createRefreshSession,
  hashPassword,
  isPasswordMatch,
  type RotateRefreshSessionOptions,
  revokeRefreshSessionBySid,
  revokeRefreshSessions,
  rotateRefreshSession,
} from "@libs/shared/srvkit";
import { randomString } from "@libs/util/common";
import { dayjs } from "akanjs/base";
import { plainFieldsOf } from "akanjs/common";
import { by, documentQueryHelper, from, into, type SchemaOf } from "akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";
import { Err } from "../dict";

/** cnst.UserInput 의 nickname maxlength 와 같아야 한다. */
const NICKNAME_MAX_LENGTH = 12;

export class UserFilter extends from(cnst.User, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.UserStatus])
      .query((statuses, q) => (statuses?.length ? { status: q.oneOf(statuses) } : {})),
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
  async createRefreshSession(
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    clientId?: string,
  ) {
    return await createRefreshSession(this.userCache, {
      subject: "user",
      subjectId: userId,
      refreshTokenHash,
      expiresAt,
      userAgent,
      clientId,
    });
  }
  async rotateRefreshSession(
    refreshTokenHash: string,
    nextRefreshTokenHash: string,
    nextExpiresAt: Date,
    options: Pick<RotateRefreshSessionOptions, "graceMs" | "reuseRevokes"> = {},
  ) {
    return await rotateRefreshSession(this.userCache, refreshTokenHash, nextRefreshTokenHash, nextExpiresAt, options);
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
    // A verified email belongs to the address it was sent to, so a new address starts unverified again.
    await this.User.updateOne({ id: userId }, ({ pull }) => ({ verifies: pull("email") }));
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
  // A reset only offers a second password; the stored one changes when the mailbox owner signs in with it, so
  // asking for a reset cannot lock the account out.
  async setResetPassword(userId: string, password: string, expireAt = dayjs().add(30, "minute")) {
    await this.userCache.set("resetPassword", userId, await hashPassword(password), { expireAt });
  }
  async consumeResetPassword(accountId: string, password: string) {
    const userId = await this.findIdByAccountId(accountId, ["active"]);
    if (!userId) return null;
    const hashedPassword = await this.userCache.get<string>("resetPassword", userId);
    if (!hashedPassword || !(await isPasswordMatch(password, hashedPassword))) return null;
    await this.userCache.delete("resetPassword", userId);
    await this.setPasswordInActiveUser(userId, password);
    await this.revokeRefreshSessions(userId);
    return await this.getUser(userId);
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
    if (!existingPhoneCode) {
      await this.failCode("phoneCodes", userId);
      return false;
    }
    await this.userCache.delete("phoneCodes", userId);
    await this.userCache.delete("phoneCodesFails", userId);
    return true;
  }
  // A six-digit code falls to guessing without a cap, so enough misses burn every code issued to this user.
  private async failCode(codeKey: string, userId: string, maxFails = 5) {
    const failKey = `${codeKey}Fails`;
    const fails = ((await this.userCache.get<number>(failKey, userId)) ?? 0) + 1;
    if (fails < maxFails) {
      await this.userCache.set(failKey, userId, fails, { expireAt: dayjs().add(10, "minute") });
      return;
    }
    await this.userCache.delete(codeKey, userId);
    await this.userCache.delete(failKey, userId);
  }
  async assertPhoneOfUser(userId: string, phone: string) {
    const { phone: storedPhone } = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (!storedPhone || storedPhone !== phone) throw new Err("user.error.invalidPhoneNumber");
  }
  async registerEmailCode(userId: string, accountId: string, emailCode: string) {
    const sendNum = (await this.userCache.get<number>("emailCodeSends", accountId)) ?? 0;
    if (sendNum >= 5) throw new Err("user.error.tooManyEmailCodes");
    await this.userCache.set("emailCodeSends", accountId, sendNum + 1, { expireAt: dayjs().add(1, "hour") });
    await this.userCache.set("emailCode", userId, `${accountId}:${emailCode}`, { expireAt: dayjs().add(10, "minute") });
    await this.userCache.delete("emailCodeFails", userId);
  }
  async isEmailCodeValid(userId: string, accountId: string, emailCode: string) {
    const existingEmailCode = await this.userCache.get<string>("emailCode", userId);
    if (!existingEmailCode || existingEmailCode !== `${accountId}:${emailCode}`) {
      await this.failCode("emailCode", userId);
      return false;
    }
    await this.userCache.delete("emailCode", userId);
    await this.userCache.delete("emailCodeFails", userId);
    return true;
  }
  async verifyEmailInPrepareUser(userId: string, accountId: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId, accountId }, ({ addToSet }) => ({
      verifies: addToSet("email"),
    }));
    return !!modifiedCount;
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
    await this.User.updateOne({ id: userId }, ({ pull }) => ({ verifies: pull("email") }));
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
  /** SSO 프로필 이름을 nickname 규격(최대 12자, active 유저와 중복 불가)으로 다듬는다. */
  async makeUniqueNickname(seed: string, fallback = "user") {
    const base = (seed.split("@")[0] ?? "").replace(/\s+/gu, " ").trim().slice(0, NICKNAME_MAX_LENGTH) || fallback;
    for (let count = 0; count < 100; count++) {
      const suffix = count ? String(count) : "";
      const nickname = `${base.slice(0, NICKNAME_MAX_LENGTH - suffix.length)}${suffix}`;
      if (!(await this.findIdByNickname(nickname, "active"))) return nickname;
    }
    return `${base.slice(0, NICKNAME_MAX_LENGTH - 6)}${randomString(6)}`;
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
  /**
   * `notiInfo` is written whole, never through a dotted path. A dotted write lands in a JSON object that may
   * not exist — the field carried no default until now, so every row predating it stores nothing — and it
   * reports a modified row anyway, because the search triggers on this table inflate `modifiedCount`. That
   * combination is why a registered device token was silently never stored.
   */
  private async writeNotiInfo(userId: string, patch: Partial<db.NotiInfo>) {
    //? `pauseUntil` is a prototype accessor on a hydrated scalar, which a spread alone would drop.
    const current = plainFieldsOf((await this.getNotiInfo(userId)) ?? new cnst.NotiInfo());
    const notiInfo = { ...current, ...patch };
    await this.User.updateOne({ id: userId }, { notiInfo });
    const written = await this.getNotiInfo(userId);
    return !!written;
  }
  async setNotiSetting(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    return await this.writeNotiInfo(userId, { setting: notiSetting });
  }
  // The same token, or a new token from the same installation, replaces the entry it had.
  async addNotiDeviceToken(userId: string, { token, provider, platform, deviceId }: db.DeviceToken) {
    const notiInfo = await this.getNotiInfo(userId);
    const others = (notiInfo?.deviceTokens ?? []).filter(
      (each) => each.token !== token && !(deviceId && each.deviceId === deviceId),
    );
    const registered: db.DeviceToken = { token, provider, platform, deviceId, updatedAt: dayjs() };
    return await this.writeNotiInfo(userId, { deviceTokens: [...others, registered] });
  }
  async subNotiDeviceToken(userId: string, token: string) {
    const notiInfo = await this.getNotiInfo(userId);
    const deviceTokens = (notiInfo?.deviceTokens ?? []).filter((each) => each.token !== token);
    return await this.writeNotiInfo(userId, { deviceTokens });
  }
  async subNotiDevice(userId: string, deviceId: string) {
    const notiInfo = await this.getNotiInfo(userId);
    const deviceTokens = (notiInfo?.deviceTokens ?? []).filter((each) => each.deviceId !== deviceId);
    return await this.writeNotiInfo(userId, { deviceTokens });
  }
  //? Rows written before tokens carried a provider hold bare strings, which no sender can route. They are dropped
  //? here, and the next write stores the list without them; the device registers again on its next visit.
  static withRoutableTokens(notiInfo: db.NotiInfo | undefined) {
    if (!notiInfo) return notiInfo;
    notiInfo.deviceTokens = (notiInfo.deviceTokens ?? []).filter(
      (each) => typeof each?.token === "string" && !!each.token,
    );
    return notiInfo;
  }
  // `notiInfo` is a secret field, so every read of it names itself explicitly — it carries the device tokens
  // and must never ride along in an ordinary user response.
  async getNotiInfo(userId: string) {
    const { notiInfo } = (await this.User.pickById(userId, { notiInfo: true })) as { notiInfo?: db.NotiInfo };
    return UserModel.withRoutableTokens(notiInfo);
  }
  async listNotiInfos(userIds: string[]) {
    if (!userIds.length) return [];
    const users = (await this.User.find({ id: { oneOf: userIds } }, { notiInfo: true })) as unknown as {
      id: string;
      notiInfo?: db.NotiInfo;
    }[];
    return users.map(({ id, notiInfo }) => ({ id, notiInfo: UserModel.withRoutableTokens(notiInfo) }));
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
