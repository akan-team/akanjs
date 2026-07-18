import type { Me } from "@libs/shared/base";
import { isPasswordMatch } from "@libs/shared/srvkit";
import type { Account } from "akanjs/fetch";
import { serve } from "akanjs/service";
import type * as cnst from "../cnst";
import * as db from "../db";
import type * as option from "../option";
import type * as srv from "../srv";

export class AdminService extends serve(db.admin, ({ use, service, memory, signal }) => ({
  rootAdminInfo: use<option.AccountInfo>(),
  securityService: service<srv.util.SecurityService>(),
})) {
  override async _postRemove(admin: db.Admin) {
    await this.adminModel.revokeRefreshSessions(admin.id);
    return admin;
  }
  async initializeAdmin() {
    const rootAdmin =
      (await this.adminModel.findByAccountId(this.rootAdminInfo.accountId)) ??
      (await this.adminModel.createAdmin(this.rootAdminInfo));
    await rootAdmin.set({ roles: ["admin", "superAdmin"] }).save();
    const isRootPasswordMatched = await isPasswordMatch(this.rootAdminInfo.password, rootAdmin.password || "");
    if (!isRootPasswordMatched) await this.setPassword(rootAdmin.id, this.rootAdminInfo.password);
  }
  private _makeMe(admin: db.Admin): Me {
    return {
      id: admin.id,
      accountId: admin.accountId,
      roles: admin.roles,
      removedAt: admin.removedAt ?? null,
    };
  }
  private _stripTokenMeta(account: Partial<Account> = {}) {
    const { exp, iat, jti, sid, tokenType, ...rest } = account as Account & {
      exp?: number;
      iat?: number;
      jti?: string;
      sid?: string;
      tokenType?: string;
    };
    return rest;
  }
  private async _issueAdminToken(admin: db.Admin, account?: Account, userAgent?: string): Promise<db.util.AccessToken> {
    const { refreshToken, refreshTokenHash, refreshTokenExpiresAt } = this.securityService.createRefreshToken();
    const session = await this.adminModel.createRefreshSession(
      admin.id,
      refreshTokenHash,
      refreshTokenExpiresAt,
      userAgent,
    );
    const me = this._makeMe(admin);
    const accessToken = await this.securityService.signAccessToken(
      { ...this._stripTokenMeta(account), me },
      { sid: session.id, jti: crypto.randomUUID() },
    );
    return { ...accessToken, refreshToken };
  }
  async refreshAdminToken(refreshToken: string, account?: Account) {
    const nextRefreshToken = this.securityService.createRefreshToken();
    const session = await this.adminModel.rotateRefreshSession(
      this.securityService.hashRefreshToken(refreshToken),
      nextRefreshToken.refreshTokenHash,
      nextRefreshToken.refreshTokenExpiresAt,
    );
    const admin = await this.adminModel.getAdmin(session.subjectId);
    const me = this._makeMe(admin);
    const accessToken = await this.securityService.signAccessToken(
      { ...this._stripTokenMeta(account), me },
      { sid: session.id, jti: crypto.randomUUID() },
    );
    return { ...accessToken, refreshToken: nextRefreshToken.refreshToken };
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
    const updatedAdmin = await admin.set({ password }).save();
    await this.adminModel.revokeRefreshSessions(admin.id);
    return updatedAdmin;
  }
  async signinAdmin(accountId: string, password: string, account?: Account) {
    const adminSecret = await this.adminModel.getAdminSecret(accountId);
    const matched = await isPasswordMatch(password, adminSecret.password || "");
    if (!matched) throw new Error(`not match`);
    const admin = await this.adminModel.getAdmin(adminSecret.id);
    void admin.updateAccess().save();
    return await this._issueAdminToken(admin, account);
  }
  async signoutAdmin(account: Account<{ me?: Me; sid?: string }>) {
    if (!account.me) throw new Error("No Admin Account");
    const admin = await this.adminModel.getAdmin(account.me.id);
    void admin.updateAccess().save();
    await this.adminModel.revokeRefreshSession(admin.id, account.sid);
    return { jwt: "" };
  }
  async ssoSigninAdmin(accountId: string, account?: Account) {
    const admin = await this.adminModel.pickByAccountId(accountId);
    void admin.updateAccess().save();
    return await this._issueAdminToken(admin, account);
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
