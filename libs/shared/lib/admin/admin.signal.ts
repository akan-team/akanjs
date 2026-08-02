import {
  Account,
  Admin as AdminGuard,
  Me,
  makeAdminAccessTokenResponse as makeAccessTokenResponse,
  makeAdminSignoutResponse as makeSignoutResponse,
  SuperAdmin,
} from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, Req, slice } from "akanjs/signal";
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
  { guards: { root: AdminGuard, get: AdminGuard, cru: SuperAdmin } },
  () => ({}),
) {}

export class AdminEndpoint extends endpoint(srv.admin, ({ query, mutation, pubsub, message }) => ({
  isAdminSystemInitialized: query(Boolean).exec(async function () {
    return await this.adminService.isAdminSystemInitialized();
  }),
  createAdminWithInitialize: mutation(cnst.Admin)
    .body("data", cnst.AdminInput)
    .exec(async function (data) {
      return await this.adminService.createAdminWithInitialize(data);
    }),
  me: query(cnst.Admin)
    .with(Me)
    .exec(async function (me) {
      return await this.adminService.getAdmin(me.id);
    }),
  setAdminPassword: mutation(Boolean)
    .body("adminId", ID)
    .body("password", String)
    .with(Me, { nullable: false })
    .exec(async function (adminId, password, me) {
      if (!me.roles.includes("superAdmin") && me.id !== adminId) throw new Err("admin.error.noAccessToSetPassword");
      await this.adminService.setPassword(adminId, password);
      return true;
    }),
  signinAdmin: mutation(cnst.util.AccessToken)
    .body("accountId", String)
    .body("password", String)
    .exec(async function (accountId, password) {
      return makeAccessTokenResponse(await this.adminService.signinAdmin(accountId, password)) as never;
    }),
  signoutAdmin: mutation(cnst.util.AccessToken)
    .with(Account)
    .exec(async function (account) {
      return makeSignoutResponse(await this.adminService.signoutAdmin(account)) as never;
    }),
  refreshAdminJwt: mutation(cnst.util.AccessToken)
    .body("refreshToken", String, { nullable: true })
    .with(Account)
    .with(Req)
    .exec(async function (refreshToken, account, request) {
      const token = refreshToken ?? (request as Bun.BunRequest).cookies.get("adminRefreshToken");
      if (!token) throw new Err("admin.error.noRefreshToken");
      try {
        return makeAccessTokenResponse(await this.adminService.refreshAdminToken(token, account)) as never;
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
  addAdminRole: mutation(cnst.Admin)
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const level = cnst.AdminRole.indexOf(role);
      if ((me.roles as cnst.AdminRole["value"][]).every((adminRole) => cnst.AdminRole.indexOf(adminRole) < level))
        throw new Err("admin.error.notAllowed");
      return await this.adminService.addRole(adminId, role);
    }),
  subAdminRole: mutation(cnst.Admin)
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const level = cnst.AdminRole.indexOf(role);
      if ((me.roles as cnst.AdminRole["value"][]).every((adminRole) => cnst.AdminRole.indexOf(adminRole) < level))
        throw new Err("admin.error.notAllowed");
      return await this.adminService.subRole(adminId, role);
    }),
})) {}
