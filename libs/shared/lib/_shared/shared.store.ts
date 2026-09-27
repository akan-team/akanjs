import { saveRefreshToken } from "@libs/shared/webkit";
import { loadPushDeviceId } from "@libs/util/webkit";
import { router, setAuth } from "akanjs/client";
import { Logger } from "akanjs/common";
import { store } from "akanjs/store";
import type { LoginForm } from "akanjs/webkit";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch } from "../useClient";

export class SharedStore extends store("shared" as const, () => ({
  // state
})) {
  async login({ auth, redirect, unauthorize, jwt }: LoginForm) {
    if (jwt) setAuth({ jwt });
    try {
      // 1. Auth Process
      if (auth === "admin") await (this as unknown as RootStore).initAdminAuth();
      else await (this as unknown as RootStore).getSelf();
      // 2. Redirect
      if (redirect) router.push(redirect);
    } catch (err) {
      Logger.debug(`Login failed: ${err}`);
      // resetAuth();
      if (unauthorize) router.push(unauthorize);
    }
  }
  async logout() {
    const { jwt } = await fetch.signoutUser(await loadPushDeviceId());
    setAuth({ jwt });
    await saveRefreshToken("user", null);
    (this as unknown as RootStore).set({ me: new cnst.Admin(), self: new cnst.User() });
    void (this as unknown as RootStore).getSelf({ jwt });
    router.refresh();
  }
}
