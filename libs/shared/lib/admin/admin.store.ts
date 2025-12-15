import { setAuth } from "@akanjs/client";
import { store } from "@akanjs/store";
import { msg } from "@shared/client";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, {
  me: cnst.admin.getDefault() as cnst.Admin,
}) {
  async addAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.addAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
  async subAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.subAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
  async initAdminAuth() {
    const me = await fetch.me();
    this.set({ me });
  }
  async setAdminPassword(adminId: string, password: string) {
    await fetch.setAdminPassword(adminId, password);
    msg.success("base.success", { key: "setAdminPassword" });
  }
  async signinAdmin() {
    try {
      const { accountId, password } = this.get().adminForm;
      const jwt = (await fetch.signinAdmin(accountId, password ?? "")).jwt;
      await (this as unknown as RootStore).login({ auth: "admin", jwt });
    } catch (e) {
      //
    }
  }
  async signoutAdmin() {
    const { jwt } = await fetch.signoutAdmin();
    setAuth({ jwt });
    this.set({ me: cnst.admin.getDefault() as cnst.Admin, adminForm: cnst.admin.getDefault() });
  }
}
