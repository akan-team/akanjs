import {
  CacheLock,
  createRefreshSession,
  hashPassword,
  type RotateRefreshSessionOptions,
  revokeRefreshSessionBySid,
  revokeRefreshSessions,
  rotateRefreshSession,
  SignChallenge,
} from "@libs/shared/srvkit";
import { randomString } from "@libs/util/common";
import { type Dayjs, dayjs } from "akanjs/base";
import { isEmail, plainFieldsOf } from "akanjs/common";
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
  sort: {
    latestLoginAt: { lastLoginAt: -1 },
  },
})) {}

export class User extends by(cnst.User) {
  //? Must equal the `maxlength` of `nickname` on cnst.UserInput.
  static readonly nicknameMaxLength = 20;
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
    return this;
  }
  subRole(role: cnst.UserRole["value"]) {
    this.roles = this.roles.filter((r) => r !== role);
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
}

export class UserModel extends into(User, UserFilter, cnst.user, () => ({})) {
  static override _onSchema(schema: SchemaOf<UserModel, User>) {
    schema.pre<User>("save", function (next) {
      if (this.isModified("images")) this.imageNum = this.images.length;
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
    return await this.createUser({ nickname: "", images: [] });
  }
  get signChallenge() {
    return new SignChallenge(this.userCache);
  }
  async assertResignable(key: string, resignupDays: number) {
    await this.signChallenge.assertResignable(key, resignupDays);
  }
  async writeLeaveInfo(userId: string, leaveInfo: db.LeaveInfo) {
    await this.User.updateById(userId, { leaveInfo: plainFieldsOf(leaveInfo) }, { withRemoved: true });
  }
  async getLeaveKeys(userId: string) {
    const { accountId, phone } = ((await this.User.findById(
      userId,
      { accountId: true, phone: true },
      { withRemoved: true },
    )) ?? {}) as {
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
    await this.signChallenge.assertResignable(accountId, resignupDays);
    return await this.claimAccountId(userId, accountId, await this.verifiesKeptOnAccountId(userId, accountId));
  }
  // Verifies other than phone and wallet vouch for the accountId they were earned under, so a new id drops them.
  private async verifiesKeptOnAccountId(userId: string, accountId: string) {
    const user = (await this.User.pickById(userId, { accountId: true, verifies: true })) as Pick<User, "verifies"> & {
      accountId?: string | null;
    };
    if (user.accountId === accountId) return user.verifies;
    return user.verifies.filter((verify) => verify === "phone" || verify === "wallet");
  }
  // An email proof vouches for the address it was earned under, so the new address starts without one.
  async setAccountIdInActiveUser(userId: string, accountId: string) {
    const userExists = await this.existsByAccountId(accountId, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.accountIdAlreadyExists");
    const { verifies } = (await this.User.pickById(userId, { verifies: true })) as Pick<User, "verifies">;
    return await this.claimAccountId(
      userId,
      accountId,
      verifies.filter((verify) => !cnst.Verify.isEmailProof(verify)),
    );
  }
  // The id leaves every draft that typed it, taking a verify earned under it along when one is named.
  private async claimAccountId(
    userId: string,
    accountId: string,
    verifies: cnst.Verify["value"][],
    droppedVerify?: cnst.Verify["value"],
  ) {
    await this.User.updateMany({ accountId, status: "prepare" }, ({ unset, pull }) =>
      droppedVerify ? { accountId: unset(), verifies: pull(droppedVerify) } : { accountId: unset() },
    );
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { accountId, verifies });
    return !!modifiedCount;
  }
  async setPasswordInPrepareUser(userId: string, accountId: string, password: string) {
    SignChallenge.assertPassword(password);
    const { accountId: existingAccountId } = await this.User.pickById(userId, { accountId: true });
    if (!existingAccountId) throw new Err("user.error.noAccountIdInUser");
    if (existingAccountId !== accountId) throw new Err("user.error.invalidAccountId");
    return await this.setPasswordInActiveUser(userId, password);
  }
  async setPasswordInActiveUser(userId: string, password: string) {
    SignChallenge.assertPassword(password);
    return await this.storePassword(userId, password);
  }
  async storePassword(userId: string, password: string) {
    const hashedPassword = await hashPassword(password);
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      password: hashedPassword,
      verifies: addToSet("password"),
    }));
    return !!modifiedCount;
  }
  async verifyEmailInPrepareUser(userId: string, accountId: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId, accountId }, ({ addToSet }) => ({
      verifies: addToSet("email"),
    }));
    return !!modifiedCount;
  }
  //? The accountId is proven the way sign-up proves it; any other address, or one the accountId just moved off, is
  //? listed beside it and never signs in.
  async addVerifiedEmail(userId: string, email: string) {
    const accountId = await this.getAccountId(userId, false);
    if (accountId?.trim().toLowerCase() === email && (await this.verifyEmailInPrepareUser(userId, accountId))) return;
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ addToSet }) => ({
      verifiedEmails: addToSet(email),
    }));
    if (!modifiedCount) throw new Err("user.error.emailVerifyNotSaved");
  }
  async removeVerifiedEmail(userId: string, email: string) {
    if (!(await this.getVerifiedEmails(userId)).includes(email)) throw new Err("user.error.verifiedEmailNotFound");
    await this.User.updateOne({ id: userId }, ({ pull }) => ({ verifiedEmails: pull(email) }));
  }
  async getVerifiedEmails(userId: string) {
    const { verifiedEmails } = (await this.User.pickById(userId, { verifiedEmails: true })) as {
      verifiedEmails?: string[] | null;
    };
    return verifiedEmails ?? [];
  }
  async setPhoneInPrepareUser(userId: string, phone: string, resignupDays = 0) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");
    await this.signChallenge.assertResignable(phone, resignupDays);
    const { modifiedCount } = await this.User.updateOne({ id: userId }, { phone });
    return !!modifiedCount;
  }
  async verifyPhoneInPrepareUser(userId: string, phone: string) {
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");

    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone !== phone) throw new Err("user.error.invalidPhoneNumber");
    return await this.claimVerifiedPhone(userId, phone);
  }
  async setPhoneInActiveUser(userId: string, phone: string) {
    const auth = (await this.User.pickById(userId, { phone: true })) as { phone?: string };
    if (auth.phone === phone) throw new Err("user.error.phoneNumberUnchanged");
    const userExists = await this.existsByPhone(phone, ["active", "dormant", "restricted"]);
    if (userExists) throw new Err("user.error.phoneAlreadyExists");
    return await this.claimVerifiedPhone(userId, phone);
  }
  // The number leaves every draft that typed it, so only the account that proved it carries the phone verify.
  private async claimVerifiedPhone(userId: string, phone: string) {
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
    await this.signChallenge.assertResignable(accountId, resignupDays);
    const verifies = await this.verifiesKeptOnAccountId(userId, accountId);
    return await this.claimAccountId(
      userId,
      accountId,
      [...verifies.filter((verify) => verify !== ssoType), ssoType],
      ssoType,
    );
  }
  // A provider whose identifier for an account changed: the row moves onto the new id once, only if it signed up with
  // that provider and holds an address the provider verified for the account. Answers the row it refused, if any.
  async renameSsoAccountId(
    legacyAccountId: string,
    accountId: string,
    ssoType: cnst.SsoType["value"],
    providerEmails: string[],
  ): Promise<{ renamed: boolean; unprovenUserId?: string }> {
    if (await this.existsByAccountId(accountId)) return { renamed: false };
    const legacy = (await this.findByAccountId(legacyAccountId, ["active", "dormant", "restricted"], {
      select: { accountId: true, verifies: true, verifiedEmails: true },
    })) as Pick<User, "id" | "verifies" | "verifiedEmails"> | null;
    if (!legacy?.verifies.includes(ssoType)) return { renamed: false };
    const storedEmails = [legacyAccountId, ...(legacy.verifiedEmails ?? [])].filter((email) => isEmail(email));
    if (!providerEmails.some((email) => storedEmails.some((stored) => stored.toLowerCase() === email.toLowerCase())))
      return { renamed: false, unprovenUserId: legacy.id };
    // The provider that renamed the id still vouches for it; an email proof earned under the old id does not.
    const verifies = legacy.verifies.filter((verify) => verify === ssoType || !cnst.Verify.isEmailProof(verify));
    const { modifiedCount } = await this.User.updateOne({ id: legacy.id }, { accountId, verifies });
    return { renamed: !!modifiedCount };
  }
  /**
   * `notiInfo` is written whole, never through a dotted path. A dotted write lands in a JSON object that may
   * not exist — the field carried no default until now, so every row predating it stores nothing — and it
   * reports a modified row anyway, because the search triggers on this table inflate `modifiedCount`. That
   * combination is why a registered device token was silently never stored.
   */
  // Two devices registering at once would each write back the list it read; a short per-user lock serializes them.
  private get notiInfoLock() {
    return new CacheLock(this.userCache, "notiInfoLock");
  }
  //? `pauseUntil` is a prototype accessor on a hydrated scalar, which a spread alone would drop.
  private static wholeNotiInfo(notiInfo: db.NotiInfo | undefined, patch: Partial<db.NotiInfo>) {
    return { ...plainFieldsOf(notiInfo ?? new cnst.NotiInfo()), ...patch };
  }
  private async writeNotiInfo(userId: string, patch: Partial<db.NotiInfo>) {
    const notiInfo = UserModel.wholeNotiInfo(await this.getNotiInfo(userId), patch);
    await this.User.updateOne({ id: userId }, { notiInfo });
    const written = await this.getNotiInfo(userId);
    return !!written;
  }
  async setNotiSetting(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    return await this.notiInfoLock.hold(
      [userId],
      async () => await this.writeNotiInfo(userId, { setting: notiSetting }),
    );
  }
  // The same token, or a new token from the same installation, replaces the entry it had.
  async addNotiDeviceToken(userId: string, { token, provider, platform, deviceId }: db.DeviceToken) {
    return await this.notiInfoLock.hold([userId], async () => {
      const notiInfo = await this.getNotiInfo(userId);
      const others = (notiInfo?.deviceTokens ?? []).filter(
        (each) => each.token !== token && !(deviceId && each.deviceId === deviceId),
      );
      const registered: db.DeviceToken = { token, provider, platform, deviceId, updatedAt: dayjs() };
      return await this.writeNotiInfo(userId, { deviceTokens: [...others, registered] });
    });
  }
  private async keepDeviceTokens(userId: string, keep: (deviceToken: db.DeviceToken) => boolean) {
    return await this.notiInfoLock.hold([userId], async () => {
      const notiInfo = await this.getNotiInfo(userId);
      return await this.writeNotiInfo(userId, { deviceTokens: (notiInfo?.deviceTokens ?? []).filter(keep) });
    });
  }
  async subNotiDeviceToken(userId: string, token: string) {
    return await this.keepDeviceTokens(userId, (each) => each.token !== token);
  }
  async subNotiDevice(userId: string, deviceId: string) {
    return await this.keepDeviceTokens(userId, (each) => each.deviceId !== deviceId);
  }
  // Every owner's dead tokens leave in one read and one write, under the per-user locks a registration takes.
  async subNotiDeviceTokensOfUsers(tokensByUser: Map<string, string[]>) {
    const userIds = [...tokensByUser.keys()];
    if (!userIds.length) return;
    await this.notiInfoLock.hold(userIds, async () => {
      const operations = (await this.listNotiInfos(userIds)).map(({ id, notiInfo }) => {
        const deadTokens = tokensByUser.get(id) ?? [];
        const deviceTokens = (notiInfo?.deviceTokens ?? []).filter((each) => !deadTokens.includes(each.token));
        return {
          updateOne: { filter: { id }, update: { notiInfo: UserModel.wholeNotiInfo(notiInfo, { deviceTokens }) } },
        };
      });
      await this.User.bulkWrite(operations);
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
  async clearRestrictInfo(userId: string) {
    const { modifiedCount } = await this.User.updateOne({ id: userId }, ({ unset }) => ({ restrictInfo: unset() }));
    return !!modifiedCount;
  }
  async makeUniqueNickname(seed: string, fallback = "user") {
    const base = (seed.split("@")[0] ?? "").replace(/\s+/gu, " ").trim().slice(0, User.nicknameMaxLength) || fallback;
    for (let count = 0; count < 100; count++) {
      const suffix = count ? String(count) : "";
      const nickname = `${base.slice(0, User.nicknameMaxLength - suffix.length)}${suffix}`;
      if (!(await this.findIdByNickname(nickname, "active"))) return nickname;
    }
    return `${base.slice(0, User.nicknameMaxLength - 6)}${randomString(6)}`;
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
