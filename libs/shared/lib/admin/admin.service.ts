import type { Me, Self } from "@libs/shared/common";
import {
  type AdminAccess,
  type AuthTokenMeta,
  adminAccessHook,
  adminSsoPolicy,
  isPasswordMatch,
  RevokedSessions,
} from "@libs/shared/srvkit";
import type { Account } from "akanjs/fetch";
import { DatabaseAdaptorRole, InsightQuery, serve } from "akanjs/service";
import type * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";
import type * as option from "../option";
import type * as srv from "../srv";

export class AdminService extends serve(db.admin, ({ use, service, memory, signal, plug }) => ({
  rootAdminInfo: use<option.AccountInfo>(),
  securityService: service<srv.util.SecurityService>(),
  database: plug(DatabaseAdaptorRole),
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
    const storedPassword = await this.adminModel
      .getAdminSecret(this.rootAdminInfo.accountId)
      .then((adminSecret) => adminSecret.password)
      .catch(() => "");
    const isRootPasswordMatched = await isPasswordMatch(this.rootAdminInfo.password, storedPassword || "");
    if (!isRootPasswordMatched) await this.setPassword(rootAdmin.id, this.rootAdminInfo.password);
  }
  async getMe(adminId: string): Promise<Me> {
    return this._makeMe(await this.adminModel.getAdmin(adminId));
  }
  private _makeMe(admin: db.Admin): Me {
    return {
      id: admin.id,
      accountId: admin.accountId,
      roles: admin.roles,
      removedAt: admin.removedAt ?? null,
    };
  }
  async findMe(adminId: string): Promise<Me | null> {
    const admin = await this.adminModel.getAdmin(adminId).catch(() => null);
    return admin ? this._makeMe(admin) : null;
  }
  // The user identity a browser also holds rides along only while its own session is live; a restriction, a removal
  // and a password change all end that session.
  private async _carryUserIdentity(account?: Account): Promise<{ self?: Self; selfSid?: string }> {
    const { self, selfSid } = (account ?? {}) as { self?: Self; selfSid?: string };
    if (!self || !selfSid || (await RevokedSessions.has(selfSid))) return {};
    return { self, selfSid };
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
      { ...(await this._carryUserIdentity(account)), me, meSid: session.id },
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
      { ...(await this._carryUserIdentity(account)), me, meSid: session.id },
      { sid: session.id, jti: crypto.randomUUID() },
    );
    return { ...accessToken, refreshToken: nextRefreshToken.refreshToken };
  }
  async isAdminSystemInitialized() {
    return await this.adminModel.hasAnotherAdmin(this.rootAdminInfo.accountId);
  }
  async createAdminWithInitialize(data: db.AdminInput) {
    if (await this.isAdminSystemInitialized()) throw new Err("admin.error.adminSystemAlreadyInitialized");
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
    if (!matched) throw new Err("admin.error.passwordNotMatched");
    const admin = await this.adminModel.getAdmin(adminSecret.id);
    void admin.updateAccess().save();
    this._notifyAccess({ accountId: admin.accountId, method: "password" });
    return await this._issueAdminToken(admin, account);
  }
  async signoutAdmin(account: Account<{ me?: Me } & AuthTokenMeta>) {
    if (!account.me) throw new Err("admin.error.noAdminAccount");
    const admin = await this.adminModel.getAdmin(account.me.id);
    void admin.updateAccess().save();
    await this.adminModel.revokeRefreshSession(admin.id, account.meSid ?? account.sid);
    this._notifyAccess({ accountId: admin.accountId, method: "signout" });
    return { jwt: "" };
  }

  private _notifyAccess(access: AdminAccess) {
    const { onAccess } = adminAccessHook();
    if (!onAccess) return;
    void Promise.resolve()
      .then(() => onAccess(access))
      .catch((error: unknown) => this.logger.warn(`admin access hook failed - ${(error as Error).message}`));
  }
  /**
   * SSO 로그인. 계정이 없으면 앱이 허용한 경우에만 만들어 준다(`setAdminSsoPolicy`).
   *
   * 허용하지 않으면 예전처럼 던진다 — 자동 가입이 기본이면 이 라이브러리를 쓰는 앱 전부가 구글 계정
   * 아무에게나 열린다. 새로 만든 관리자의 등급도 앱이 정한다: 비어 있으면 로그인만 되고 가드가 전부 막는다.
   */
  async ssoSigninAdmin(accountId: string, account?: Account) {
    const admin = (await this.adminModel.findByAccountId(accountId)) ?? (await this._signupSsoAdmin(accountId));
    void admin.updateAccess().save();
    this._notifyAccess({ accountId: admin.accountId, method: "sso" });
    return await this._issueAdminToken(admin, account);
  }

  private async _signupSsoAdmin(accountId: string) {
    const policy = adminSsoPolicy();
    if (!policy.canSignup(accountId)) throw new Err("admin.error.adminSsoNotAllowed");
    const admin = await this.adminModel.createAdmin({ accountId } as db.AdminInput);
    const roles = policy.roles ?? [];
    return roles.length ? await admin.set({ roles: roles as cnst.AdminRole["value"][] }).save() : admin;
  }
  async runInsight(sql: string, limit?: number | null) {
    return await new InsightQuery(this.database).run(sql, { limit: limit ?? undefined });
  }
  async addRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await this.adminModel.getAdmin(adminId);
    return await admin.addRole(role).save();
  }
  // A demotion ends the admin's sessions: a token minted before it would otherwise keep the old roles for days.
  async subRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await this.adminModel.getAdmin(adminId);
    const demoted = await admin.subRole(role).save();
    await this.adminModel.revokeRefreshSessions(demoted.id);
    return demoted;
  }
}
