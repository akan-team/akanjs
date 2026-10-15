import { msg } from "@libs/shared/client";
import { saveRefreshToken } from "@libs/shared/webkit";
import { getApiPrefix } from "akanjs/base";
import { router, setAuth, setCookie } from "akanjs/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, () => ({
  me: new cnst.Admin(),
})) {
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
    this.set({ me: me ?? new cnst.Admin() });
  }
  async setAdminPassword(adminId: string, password: string) {
    await fetch.setAdminPassword(adminId, password);
    msg.success("base.success", { key: "setAdminPassword" });
  }
  async signinAdmin({ redirect }: { redirect?: string } = {}) {
    const { accountId, password } = this.get().adminForm;
    if (!accountId || !password) return;
    const accessToken = await fetch.signinAdmin(accountId, password);
    await saveRefreshToken("admin", accessToken.refreshToken);
    await (this as unknown as RootStore).login({ auth: "admin", jwt: accessToken.jwt, redirect });
  }
  // The callback reads these cookies to tell an operator's sign-in from a user's and to know where to land.
  async ssoSigninAdmin(ssoType: cnst.SsoType["value"], { redirect = "/admin" }: { redirect?: string } = {}) {
    const adminRedirect = encodeURIComponent(router.getPrefixedPath(redirect));
    setCookie("ssoFor", "admin");
    setCookie("adminRedirect", adminRedirect);
    setCookie("errorRedirect", adminRedirect);
    setCookie("ssoOrigin", location.origin);
    location.assign(`${getApiPrefix()}/user/${ssoType}`);
  }
  async signoutAdmin() {
    const { jwt } = await fetch.signoutAdmin();
    setAuth({ jwt });
    await saveRefreshToken("admin", null);
    this.set({ me: new cnst.Admin(), adminForm: new cnst.Admin() });
  }
}
