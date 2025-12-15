import { ID } from "@akanjs/base";
import { Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";
import { Account, Admin, Me, SuperAdmin } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class AdminInternal extends internal(srv.admin, ({ initialize }) => ({
  initializeAdmin: initialize().exec(async function () {
    await this.adminService.initializeAdmin();
  }),
})) {}

export class AdminSlice extends slice(
  srv.admin,
  { guards: { root: Admin, get: Public, cru: SuperAdmin } },
  () => ({})
) {}

export class AdminEndpoint extends endpoint(srv.admin, ({ query, mutation }) => ({
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
    .with(Me)
    .exec(async function (adminId, password, me) {
      if (!me.roles.includes("superAdmin") && me.id !== adminId) throw new Error("No Access to set password");
      await this.adminService.setPassword(adminId, password);
      return true;
    }),
  signinAdmin: mutation(cnst.util.AccessToken)
    .body("accountId", String)
    .body("password", String)
    .exec(async function (accountId, password) {
      return await this.adminService.signinAdmin(accountId, password);
    }),
  signoutAdmin: mutation(cnst.util.AccessToken)
    .with(Account)
    .exec(async function (account) {
      return await this.adminService.signoutAdmin(account);
    }),
  addAdminRole: mutation(cnst.Admin)
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const level = cnst.AdminRole.findIndex((r) => r === role);
      if (me.roles.every((adminRole) => cnst.AdminRole.findIndex((r) => r === adminRole) < level))
        throw new Error("Not Allowed");
      return await this.adminService.addRole(adminId, role);
    }),
  subAdminRole: mutation(cnst.Admin)
    .body("adminId", ID)
    .body("role", cnst.AdminRole)
    .with(Me)
    .exec(async function (adminId, role, me) {
      const level = cnst.AdminRole.findIndex((r) => r === role);
      if (me.roles.every((adminRole) => cnst.AdminRole.findIndex((r) => r === adminRole) < level))
        throw new Error("Not Allowed");
      return await this.adminService.subRole(adminId, role);
    }),
})) {}
