import {
  Account,
  Admin as AdminGuard,
  adminRolePolicy,
  Me,
  makeAdminAccessTokenResponse as makeAccessTokenResponse,
  makeAdminSignoutResponse as makeSignoutResponse,
  Person,
  PlatformAdminList,
  readRefreshTokenCookie,
  Staff,
  SuperAdmin,
} from "@libs/shared/srvkit";
import { ID, Int } from "akanjs/base";
import { endpoint, Ip, internal, Public, Req, slice } from "akanjs/signal";
import * as cnst from "../cnst";
import { Err } from "../dict";
import * as srv from "../srv";

export class AdminInternal extends internal(srv.admin, ({ initialize, process, resolveField }) => ({
  initializeAdmin: initialize().exec(async function () {
    await this.adminService.initializeAdmin();
  }),
})) {}

export class AdminSlice extends slice(
  srv.admin,
  // `mcp: { cru: false }`: creating or re-roling an operator account is the escalation every other guard is measured
  // against. It stays a deliberate act in the admin console.
  { guards: { root: AdminGuard, get: AdminGuard, cru: SuperAdmin }, mcp: { cru: false } },
  (init) => ({
    inMention: init({ guards: [Staff], mcp: false })
      .search("text", String)
      .exec(function (text) {
        return this.adminService.queryBySearch(text);
      }),
  }),
) {}

export class AdminEndpoint extends endpoint(srv.admin.with(srv.user), ({ query, mutation, pubsub, message }) => ({
  isAdminSystemInitialized: query(Boolean, { guards: [Public], mcp: false }).exec(async function () {
    return await this.adminService.isAdminSystemInitialized();
  }),
  // The root admin is seeded at boot from env, so adding the next one is a superAdmin act; left open, this call
  // mints a superAdmin for anyone while no other admin exists.
  createAdminWithInitialize: mutation(cnst.Admin, { guards: [SuperAdmin], mcp: false })
    .body("data", cnst.AdminInput)
    .exec(async function (data) {
      return await this.adminService.createAdminWithInitialize(data);
    }),
  me: query(cnst.Admin, { guards: [Public], nullable: true, mcp: false })
    .with(Me, { nullable: true })
    .exec(async function (me) {
      return me ? await this.adminService.getAdmin(me.id) : null;
    }),
  isPlatformAdmin: query(Boolean, { guards: [AdminGuard], mcp: false })
    .with(Me)
    .exec((me) => PlatformAdminList.includes(me.id)),
  setAdminPassword: mutation(Boolean, {
    guards: [Staff, Person],
    mcp: false,
    rateLimit: { calls: 10, by: "account" },
    errors: { 400: ["admin.error.noAccessToSetPassword", "admin.error.passwordNotMatched"] },
  })
    .body("adminId", ID)
    .body("password", String)
    .body("prevPassword", String, { nullable: true })
    .with(Me, { nullable: false })
    .exec(async function (adminId, password, prevPassword, me) {
      if (!me.roles.includes("superAdmin") && me.id !== adminId) throw new Err("admin.error.noAccessToSetPassword");
      if (me.id === adminId) await this.adminService.assertPassword(adminId, prevPassword ?? null);
      await this.adminService.setPassword(adminId, password);
      return true;
    }),
  signinAdmin: mutation(cnst.util.AccessToken, {
    guards: [Public],
    mcp: false,
    rateLimit: { calls: 20 },
    errors: { 400: ["admin.error.invalidCredentials", "admin.error.tooManySigninAttempts"] },
  })
    .body("accountId", String)
    .body("password", String)
    .with(Ip, { nullable: true })
    .exec(async function (accountId, password, ip) {
      return makeAccessTokenResponse(await this.adminService.signinAdmin(accountId, password, ip)) as never;
    }),
  signoutAdmin: mutation(cnst.util.AccessToken, { guards: [Staff], mcp: false })
    .with(Account)
    .exec(async function (account) {
      return makeSignoutResponse(await this.adminService.signoutAdmin(account)) as never;
    }),
  refreshAdminJwt: mutation(cnst.util.AccessToken, { guards: [Public], mcp: false, rateLimit: { calls: 60 } })
    .body("refreshToken", String, { nullable: true })
    .with(Account)
    .with(Req)
    .exec(async function (refreshToken, account, req) {
      const token = refreshToken ?? readRefreshTokenCookie(req, "admin");
      if (!token) throw new Err("admin.error.noRefreshToken");
      try {
        const readSelf = async (userId: string) => {
          const user = await this.userService.getUser(userId).catch(() => null);
          const signable = user ? await this.userService._assertSignable(user).catch(() => null) : null;
          return signable ? await this.userService.makeSelf(signable) : null;
        };
        return makeAccessTokenResponse(await this.adminService.refreshAdminToken(token, account, readSelf)) as never;
      } catch (error) {
        if (
          !refreshToken &&
          error instanceof Error &&
          /^shared\.error\.(expired|revoked|invalid)RefreshToken$/.test(error.message)
        ) {
          return makeSignoutResponse({ jwt: "" }) as never;
        }
        throw error;
      }
    }),
  // `mcp: false`: the statement is read-only by construction, but it answers with raw rows rather than a model,
  // so it is the one read that walks past `mask()` — `SELECT * FROM "user"` returns the columns every model
  // response strips. One injected instruction in an operator's agent would be the whole database.
  runAdminSql: mutation(cnst.InsightRows, { guards: [SuperAdmin, Person], mcp: false })
    .body("sql", String, { example: 'SELECT COUNT(*) AS total FROM "user"' })
    .body("limit", Int, { nullable: true })
    .exec(async function (sql, limit) {
      return await this.adminService.runInsight(sql, limit);
    }),
  addAdminRole: mutation(cnst.Admin, { guards: [AdminGuard, Person], mcp: false })
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const { canChange, onChange } = adminRolePolicy();
      const level = cnst.AdminRole.indexOf(role);
      const isRefused = canChange
        ? !canChange(me.roles, role)
        : (me.roles as cnst.AdminRole["value"][]).every((adminRole) => cnst.AdminRole.indexOf(adminRole) < level);
      if (isRefused) throw new Err("admin.error.notAllowed");
      const admin = await this.adminService.addRole(adminId, role);
      await onChange?.({ actor: me.accountId, adminId, role, verb: "add" });
      return admin;
    }),
  subAdminRole: mutation(cnst.Admin, { guards: [AdminGuard, Person], mcp: false })
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const { canChange, onChange } = adminRolePolicy();
      const level = cnst.AdminRole.indexOf(role);
      const isRefused = canChange
        ? !canChange(me.roles, role)
        : (me.roles as cnst.AdminRole["value"][]).every((adminRole) => cnst.AdminRole.indexOf(adminRole) < level);
      if (isRefused) throw new Err("admin.error.notAllowed");
      const admin = await this.adminService.subRole(adminId, role);
      await onChange?.({ actor: me.accountId, adminId, role, verb: "sub" });
      return admin;
    }),
  setAdminRoles: mutation(cnst.Admin, { guards: [AdminGuard, Person], mcp: false })
    .body("adminId", ID)
    .body("roles", [cnst.AdminRole])
    .with(Me)
    .exec(async function (adminId, roles, me) {
      return await this.adminService.setRoles(adminId, roles, me);
    }),
})) {}
