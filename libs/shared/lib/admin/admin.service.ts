import { serve } from "@akanjs/service";
import { Account } from "@akanjs/signal";
import { type Me } from "@shared/base";
import { isPasswordMatch } from "@shared/nest";

import * as cnst from "../cnst";
import * as db from "../db";
import type * as option from "../option";
import type * as srv from "../srv";

export class AdminService extends serve(db.admin, ({ use, service }) => ({
  rootAdminInfo: use<option.AccountInfo>(),
  securityService: service<srv.util.SecurityService>(),
})) {
  async initializeAdmin() {
    const rootAdmin =
      (await this.adminModel.findByAccountId(this.rootAdminInfo.accountId)) ??
      (await this.adminModel.createAdmin(this.rootAdminInfo));
    await rootAdmin.set({ roles: ["admin", "superAdmin"], password: this.rootAdminInfo.password }).save();
  }
  #makeMe(admin: db.Admin): Me {
    return {
      id: admin.id,
      accountId: admin.accountId,
      roles: admin.roles,
      removedAt: admin.removedAt ?? null,
    };
  }
  async isAdminSystemInitialized() {
    return await this.adminModel.hasAnotherAdmin(this.rootAdminInfo.accountId);
  }
  async createAdminWithInitialize(data: db.AdminInput) {
    if (await this.isAdminSystemInitialized()) throw new Error("Admin System Already Initialized");
    const admin = await this.adminModel.createAdmin(data);
    return await admin.set({ roles: ["admin", "superAdmin"] }).save();
  }
  async setPassword(adminId: string, password: string) {
    const admin = await this.adminModel.getAdmin(adminId);
    return await admin.set({ password }).save();
  }
  async signinAdmin(accountId: string, password: string, account?: Account) {
    const adminSecret = await this.adminModel.getAdminSecret(accountId);
    const matched = await isPasswordMatch(password, adminSecret.password || "");
    if (!matched) throw new Error(`not match`);
    const admin = await this.adminModel.getAdmin(adminSecret.id);
    void admin.updateAccess().save();
    return this.securityService.addJwt({ me: admin }, account);
  }
  async signoutAdmin(account: Account<{ me?: Me }>) {
    if (!account.me) throw new Error("No Admin Account");
    const admin = await this.adminModel.getAdmin(account.me.id);
    void admin.updateAccess().save();
    return this.securityService.subJwt(account, "me");
  }
  async ssoSigninAdmin(accountId: string, account?: Account) {
    const admin = await this.adminModel.pickByAccountId(accountId);
    void admin.updateAccess().save();
    const me = this.#makeMe(admin);
    return this.securityService.addJwt({ me }, account);
  }
  async addRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await this.adminModel.getAdmin(adminId);
    return await admin.addRole(role).save();
  }
  async subRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await this.adminModel.getAdmin(adminId);
    return await admin.subRole(role).save();
  }
}
