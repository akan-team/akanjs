import { dayjs } from "@akanjs/base";
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";
import { hashPassword } from "@shared/nest";

import * as cnst from "../cnst";

export class AdminFilter extends from(cnst.Admin, (filter) => ({
  query: {
    byAccountId: filter()
      .arg("accountId", String)
      .query((accountId) => ({ accountId })),
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
  updateAccess() {
    this.lastLoginAt = dayjs();
    return this;
  }
}

export class AdminModel extends into(Admin, AdminFilter, cnst.admin, ({ byField }) => ({
  adminAccountIdLoader: byField("accountId"),
})) {
  async hasAnotherAdmin(accountId: string) {
    const exists = await this.Admin.exists({ accountId: { $ne: accountId }, status: "active" });
    return !!exists;
  }
  async getAdminSecret(accountId: string): Promise<{ id: string; roles: cnst.AdminRole["value"][]; password: string }> {
    const adminSecret = await this.Admin.pickOne(
      { accountId, removedAt: { $exists: false } },
      { roles: true, password: true }
    );
    return adminSecret as { id: string; roles: cnst.AdminRole["value"][]; password: string };
  }
}

export class AdminMiddleware extends beyond(AdminModel, Admin) {
  onSchema(schema: SchemaOf<AdminModel, Admin>) {
    schema.pre<Admin>("save", async function (next) {
      if (!this.isModified("password") || !this.password) {
        next();
        return;
      }
      const encryptedPassword = await hashPassword(this.password);
      this.password = encryptedPassword;
      next();
    });
    schema.index({ accountId: "text" });
  }
}
