import {
  createRefreshSession,
  hashPassword,
  revokeRefreshSessionBySid,
  revokeRefreshSessions,
  rotateRefreshSession,
  SignChallenge,
} from "@libs/shared/srvkit";
import { dayjs } from "akanjs/base";
import { by, documentQueryHelper, from, into, type SchemaOf } from "akanjs/document";
import * as cnst from "../cnst";

export class AdminFilter extends from(cnst.Admin, (filter) => ({
  query: {
    byAccountId: filter()
      .arg("accountId", String)
      .query((accountId) => ({ accountId })),
    bySearch: filter()
      .opt("text", String)
      .opt("roles", [cnst.AdminRole])
      .query((text, roles, q) =>
        q.all(text ? q.search(text, { prefix: true }) : {}, roles?.length ? { roles: q.oneOf(roles) } : {}),
      ),
  },
  sort: {},
})) {}
export class Admin extends by(cnst.Admin) {
  addRole(role: cnst.AdminRole["value"]) {
    if (!this.roles.includes(role)) this.roles = [...this.roles, role];
    return this;
  }
  subRole(role: cnst.AdminRole["value"]) {
    this.roles = this.roles.filter((r) => r !== role);
    return this;
  }
  setRoles(roles: cnst.AdminRole["value"][]) {
    this.roles = [...new Set(roles)];
    return this;
  }
  updateAccess() {
    this.lastLoginAt = dayjs();
    return this;
  }
}

export class AdminModel extends into(Admin, AdminFilter, cnst.admin, ({ byField }) => ({
  adminAccountIdLoader: byField("accountId"),
})) {
  private static readonly bcryptDigest = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

  static override _onSchema(schema: SchemaOf<AdminModel, Admin>) {
    // `isModified()` reports false on a create — the store hydrates the new row as its own original — so
    // guarding on it stored the root admin's password in cleartext, which `isPasswordMatch` then accepts through
    // its plaintext fallback. Hash anything that is not already a bcrypt digest instead; that covers both paths
    // and re-hashes a legacy cleartext row on its next save.
    schema.pre<Admin>("save", async function () {
      if (!this.password || AdminModel.bcryptDigest.test(this.password)) return;
      this.password = await hashPassword(this.password);
    });
    schema.index({ accountId: 1 });
  }
  async hasAnotherAdmin(accountId: string) {
    const q = documentQueryHelper;
    const exists = await this.Admin.exists(q.all({ accountId: q.ne(accountId) }, q.missing("removedAt")));
    return !!exists;
  }
  async findAdminSecret(accountId: string) {
    const q = documentQueryHelper;
    const query = q.all({ accountId }, q.missing("removedAt"));
    if (!(await this.Admin.exists(query))) return null;
    const adminSecret = await this.Admin.pickOne(query, { roles: true, password: true });
    return adminSecret as { id: string; roles: cnst.AdminRole["value"][]; password?: string };
  }
  get signChallenge() {
    return new SignChallenge(this.adminCache);
  }
  async createRefreshSession(
    adminId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    clientId?: string,
  ) {
    return await createRefreshSession(this.adminCache, {
      subject: "admin",
      subjectId: adminId,
      refreshTokenHash,
      expiresAt,
      userAgent,
      clientId,
    });
  }
  async rotateRefreshSession(refreshTokenHash: string, nextRefreshTokenHash: string, nextExpiresAt: Date) {
    return await rotateRefreshSession(this.adminCache, refreshTokenHash, nextRefreshTokenHash, nextExpiresAt);
  }
  async revokeRefreshSession(adminId: string, sessionId?: string) {
    await revokeRefreshSessionBySid(this.adminCache, "admin", adminId, sessionId);
  }
  async revokeRefreshSessions(adminId: string) {
    await revokeRefreshSessions(this.adminCache, "admin", adminId);
  }
}
