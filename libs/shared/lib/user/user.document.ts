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
import { createOpaqueToken, hashToken } from "@libs/util/srvkit";
import { type Dayjs, dayjs } from "akanjs/base";
import { plainFieldsOf } from "akanjs/common";
import { by, from, into, type SchemaOf } from "akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";
import { Err } from "../dict";

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
  //? Must equal the `maxlength` of `nickname` on cnst.UserInput.
  static readonly nicknameMaxLength = 12;
  static assertNickname(nickname: string) {
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length > User.nicknameMaxLength)
      throw new Err("user.error.invalidNicknameLength", { max: User.nicknameMaxLength });
  }
  rename(nickname: string) {
    User.assertNickname(nickname);
    this.nickname = nickname.trim();
    return this;
  }
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
  // profile: any → applied, once the active user has uploaded images to be judged.
  applyUserProfile() {
    if (this.status !== "active") throw new Err("user.error.profileExamNotAvailable");
    if (!this.appliedImages.length) throw new Err("user.error.imagesNotUploaded");
    this.profileStatus = "applied";
    return this;
  }
  // active or dormant → restricted until `until`; restricting a restricted account moves its end.
  restrict(reason: string, until: Dayjs) {
    if (this.status === "prepare") throw new Err("user.error.userNotActive");
    this.status = "restricted";
    //? A plain object: the document copies own properties, and a scalar instance keeps its Date in a prototype accessor.
    this.restrictInfo = { reason, until } as unknown as cnst.RestrictInfo;
    return this;
  }
  // restricted → active.
  release() {
    if (this.status !== "restricted") throw new Err("user.error.userNotRestricted");
    this.status = "active";
    this.restrictInfo = undefined;
    return this;
  }
  // profile: applied → approved; the applied images become the profile, so an empty application approves nothing.
  approveUserProfile() {
    if (this.status !== "active") throw new Err("user.error.profileExamNotAvailable");
    if (!this.appliedImages.length) throw new Err("user.error.imagesNotUploaded");
    this.images = this.appliedImages;
    this.image = this.appliedImages[0];
    this.appliedImages = [];
    this.profileStatus = "approved";
    return this;
  }
}

export class UserModel extends into(User, UserFilter, cnst.user, () => ({})) {
  //? bcrypt reads at most 72 bytes, so anything past them would be silently ignored.
  private static readonly passwordMaxBytes = 72;
  private static readonly passwordMinLength = 7;
  private static readonly maxCodeFails = 10;
  private static readonly maxSigninFails = 10;

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
  // A draft that was activated or removed since is not resumed, so a new sign-up starts instead.
  async findPrepareUser(userId: string) {
    const user = await this.User.findById(userId);
    return user?.status === "prepare" ? user : null;
  }
  async createPrepareUser() {
    return await this.createUser({ nickname: "", images: [], appliedImages: [] });
  }
  // Only the hash is kept and the first use consumes it; a sign-in token and a password token never stand in for each other.
  async setSignToken(userId: string, purpose: "signin" | "password", expireAt = dayjs().add(10, "minute")) {
    const signToken = createOpaqueToken();
    await this.userCache.set(`${purpose}Token`, hashToken(signToken), userId, { expireAt });
    return signToken;
  }
  async consumeSignToken(purpose: "signin" | "password", signToken: string) {
    return (await this.userCache.getDel<string>(`${purpose}Token`, hashToken(signToken))) ?? null;
  }
  // A fixed window per key; the count expires with the window it started.
  async takeSendSlot(topic: string, key: string, limit: number, windowEnd = dayjs().add(1, "day")) {
    return (await this.userCache.incr(topic, hashToken(key), 1, { expireAt: windowEnd })) <= limit;
  }
  async isSigninLocked(accountId: string) {
    const fails = Number((await this.userCache.get<number>("signinFails", hashToken(accountId))) ?? 0);
    return fails >= UserModel.maxSigninFails;
  }
  async failSignin(accountId: string) {
    await this.userCache.incr("signinFails", hashToken(accountId), 1, { expireAt: dayjs().add(15, "minute") });
  }
  async clearSigninFailures(accountId: string) {
    await this.userCache.delete("signinFails", hashToken(accountId));
  }
  // Written just before a removal: once removedAt is set the row is unreadable, so this is all a re-signup can check.
  async recordLeave(keys: string[], at = dayjs()) {
    await Promise.all(
      keys.map((key) => this.userCache.set("leftAt", hashToken(key), at.valueOf(), { expireAt: at.add(1, "year") })),
    );
  }
  async assertResignable(key: string, resignupDays: number) {
    if (!resignupDays) return;
    const leftAt = await this.userCache.get<number>("leftAt", hashToken(key));
    if (leftAt && dayjs(Number(leftAt)).add(resignupDays, "day").isAfter(dayjs()))
      throw new Err("user.error.resignupNotAvailable", { days: resignupDays });
  }
  async getLeaveKeys(userId: string) {
    const { accountId, phone } = (await this.User.pickById(userId, { accountId: true, phone: true })) as {
      accountId?: string;
      phone?: string;
    };
    return [accountId, phone].filter((key): key is string => !!key);
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
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    await this.assertResignable(accountId, resignupDays);
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset }) => ({ accountId: unset() }));
    // A verified email belongs to the address it was sent to, so a new address starts unverified again.
    await this.User.updateOne({ id: userId }, ({ pull }) => ({ verifies: pull("email") }));
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ pull }) => ({
      accountId,
      verifies: pull("password"),
    }));
    return !!modifiedCount;
  }
  async setAccountIdInActiveUser(userId: string, accountId: string) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset }) => ({ accountId: unset() }));
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { accountId });
    return !!modifiedCount;
  }
  static assertPassword(password: string) {
    const bytes = new TextEncoder().encode(password).length;
    if (password.length < UserModel.passwordMinLength || bytes > UserModel.passwordMaxBytes)
      throw new Err("user.error.invalidPasswordLength", { min: UserModel.passwordMinLength });
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    UserModel.assertPassword(password);
    const { accountId: existingAccountId } = await this.User.pickById(userId, { accountId: true });
    if (!existingAccountId) throw new Err("user.error.noAccountIdInUser");
    if (existingAccountId !== accountId) throw new Err("user.error.invalidAccountId");
    const hashedPassword = await hashPassword(password);
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      password: hashedPassword,
      verifies: addToSet("password"),
    }));
    return !!modifiedCount;
  }
  // Every miss looks the same to the caller, so a sign-in cannot tell which account ids exist.
  async findUserByPassword(accountId: string, password: string) {
    const auth = (await this.findByAccountId(accountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, password: true },
    })) as { id: string; password?: string } | null;
    if (!auth?.password || !(await isPasswordMatch(password, auth.password))) return null;
    return await this.getUser(auth.id);
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
    UserModel.assertPassword(password);
    const hashedPassword = await hashPassword(password);
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
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
  // One live code per account and purpose: a new request replaces the old one instead of adding a second guess.
  async registerPhoneCode(userId: string, phone: string, purpose: string, phoneCode: string) {
    await this.userCache.set("phoneCode", `${userId}:${purpose}`, `${phone}:${hashToken(phoneCode)}`, {
      expireAt: dayjs().add(3, "minute"),
    });
  }
  async isPhoneCodeValid(userId: string, phone: string, purpose: string, phoneCode: string) {
    await this.assertCodeAttemptsLeft(userId);
    const stored = await this.userCache.get<string>("phoneCode", `${userId}:${purpose}`);
    if (stored !== `${phone}:${hashToken(phoneCode)}`) {
      await this.failCodeAttempt(userId);
      return false;
    }
    await this.userCache.delete("phoneCode", `${userId}:${purpose}`);
    await this.userCache.delete("codeFails", userId);
    return true;
  }
  // Misses count for a day however many codes were sent, so asking for a fresh code never resets the guesses.
  private async assertCodeAttemptsLeft(userId: string) {
    const fails = Number((await this.userCache.get<number>("codeFails", userId)) ?? 0);
    if (fails >= UserModel.maxCodeFails) throw new Err("user.error.tooManyCodeFailures");
  }
  private async failCodeAttempt(userId: string) {
    await this.userCache.incr("codeFails", userId, 1, { expireAt: dayjs().add(1, "day") });
  }
  async assertPhoneOfUser(userId: string, phone: string) {
    const { phone: storedPhone } = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (!storedPhone || storedPhone !== phone) throw new Err("user.error.invalidPhoneNumber");
  }
  async registerEmailCode(userId: string, accountId: string, emailCode: string) {
    const sendNum = (await this.userCache.get<number>("emailCodeSends", accountId)) ?? 0;
    if (sendNum >= 5) throw new Err("user.error.tooManyEmailCodes");
    await this.userCache.set("emailCodeSends", accountId, sendNum + 1, { expireAt: dayjs().add(1, "hour") });
    await this.userCache.set("emailCode", userId, `${accountId}:${hashToken(emailCode)}`, {
      expireAt: dayjs().add(10, "minute"),
    });
  }
  async isEmailCodeValid(userId: string, accountId: string, emailCode: string) {
    await this.assertCodeAttemptsLeft(userId);
    const existingEmailCode = await this.userCache.get<string>("emailCode", userId);
    if (existingEmailCode !== `${accountId}:${hashToken(emailCode)}`) {
      await this.failCodeAttempt(userId);
      return false;
    }
    await this.userCache.delete("emailCode", userId);
    await this.userCache.delete("codeFails", userId);
    return true;
  }
  async verifyEmailInPrepareUser(userId: string, accountId: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId, accountId }, ({ addToSet }) => ({
      verifies: addToSet("email"),
    }));
    return !!modifiedCount;
  }
  async setPhoneInPrepareUser(userId: string, phone: string, resignupDays = 0) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");
    await this.assertResignable(phone, resignupDays);
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
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    await this.assertResignable(accountId, resignupDays);
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset, pull }) => ({
      accountId: unset(),
      verifies: pull(ssoType),
    }));
    await this.User.updateOne({ id: userId }, ({ pull }) => ({ verifies: pull("email") }));
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      accountId,
      verifies: addToSet(ssoType),
    }));
    return !!modifiedCount;
  }
  // A provider whose identifier for an account changed: the row moves onto the new id once, and only if it signed up
  // with that provider.
  async renameSsoAccountId(legacyAccountId: string, accountId: string, ssoType: cnst.SsoType["value"]) {
    if (await this.existsByAccountId(accountId)) return false;
    const legacy = (await this.findByAccountId(legacyAccountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, verifies: true },
    })) as Pick<User, "id" | "verifies"> | null;
    if (!legacy?.verifies.includes(ssoType)) return false;
    const { modifiedCount } = await this.User.updateOne({ id: legacy.id }, { accountId });
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
    const base = (seed.split("@")[0] ?? "").replace(/\s+/gu, " ").trim().slice(0, User.nicknameMaxLength) || fallback;
    for (let count = 0; count < 100; count++) {
      const suffix = count ? String(count) : "";
      const nickname = `${base.slice(0, User.nicknameMaxLength - suffix.length)}${suffix}`;
      if (!(await this.findIdByNickname(nickname, "active"))) return nickname;
    }
    return `${base.slice(0, User.nicknameMaxLength - 6)}${randomString(6)}`;
  }
  async setNickname(userId: string, nickname: string) {
    User.assertNickname(nickname);
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
  /**
   * `notiInfo` is written whole, never through a dotted path. A dotted write lands in a JSON object that may
   * not exist — the field carried no default until now, so every row predating it stores nothing — and it
   * reports a modified row anyway, because the search triggers on this table inflate `modifiedCount`. That
   * combination is why a registered device token was silently never stored.
   */
  // Two devices registering at once would each write back the list it read; a short per-user lock serializes them.
  private async withNotiInfoLock<T>(userId: string, write: () => Promise<T>) {
    const owner = createOpaqueToken(8);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await this.userCache.setIfAbsent("notiInfoLock", userId, owner, { expireAt: dayjs().add(5, "second") })) {
        try {
          return await write();
        } finally {
          if ((await this.userCache.get<string>("notiInfoLock", userId)) === owner)
            await this.userCache.delete("notiInfoLock", userId);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    //? Past a second of waiting the write goes ahead unlocked: losing a device token is worse than a rare race.
    return await write();
  }
  private async writeNotiInfo(userId: string, patch: Partial<db.NotiInfo>) {
    //? `pauseUntil` is a prototype accessor on a hydrated scalar, which a spread alone would drop.
    const current = plainFieldsOf((await this.getNotiInfo(userId)) ?? new cnst.NotiInfo());
    const notiInfo = { ...current, ...patch };
    await this.User.updateOne({ id: userId }, { notiInfo });
    const written = await this.getNotiInfo(userId);
    return !!written;
  }
  async setNotiSetting(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    return await this.withNotiInfoLock(userId, async () => await this.writeNotiInfo(userId, { setting: notiSetting }));
  }
  // The same token, or a new token from the same installation, replaces the entry it had.
  async addNotiDeviceToken(userId: string, { token, provider, platform, deviceId }: db.DeviceToken) {
    return await this.withNotiInfoLock(userId, async () => {
      const notiInfo = await this.getNotiInfo(userId);
      const others = (notiInfo?.deviceTokens ?? []).filter(
        (each) => each.token !== token && !(deviceId && each.deviceId === deviceId),
      );
      const registered: db.DeviceToken = { token, provider, platform, deviceId, updatedAt: dayjs() };
      return await this.writeNotiInfo(userId, { deviceTokens: [...others, registered] });
    });
  }
  async subNotiDeviceTokens(userId: string, tokens: string[]) {
    return await this.withNotiInfoLock(userId, async () => {
      const notiInfo = await this.getNotiInfo(userId);
      const deviceTokens = (notiInfo?.deviceTokens ?? []).filter((each) => !tokens.includes(each.token));
      return await this.writeNotiInfo(userId, { deviceTokens });
    });
  }
  async subNotiDeviceToken(userId: string, token: string) {
    return await this.subNotiDeviceTokens(userId, [token]);
  }
  async subNotiDevice(userId: string, deviceId: string) {
    return await this.withNotiInfoLock(userId, async () => {
      const notiInfo = await this.getNotiInfo(userId);
      const deviceTokens = (notiInfo?.deviceTokens ?? []).filter((each) => each.deviceId !== deviceId);
      return await this.writeNotiInfo(userId, { deviceTokens });
    });
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
