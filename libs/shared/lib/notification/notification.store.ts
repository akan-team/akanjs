import { msg } from "@libs/shared/client";
import type { PushToken } from "@libs/util/webkit";
import { dayjs } from "akanjs/base";
import { store } from "akanjs/store";

import type * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class NotificationStore extends store(sig.notification, () => ({
  // state
  deviceToken: null as string | null,
  pushPermission: "default" as NotificationPermission,
  // `unknown` until the server has been asked: the token list lives on a secret field, so the client cannot
  // derive it from `self`, and a `false` default would draw the switch off for someone who has push on.
  pushRegistered: "unknown" as "unknown" | boolean,
  notiSetting: "normal" as cnst.NotiSetting["value"],
})) {
  // action

  // A native shell answers `"prompt"` where the browser answers `"default"`, so the caller hands over whatever its
  // platform said and the mapping happens once, here. `notiSetting` rides along because the screen has one
  // mount-time read it cannot avoid — the push token only exists in the browser — and this keeps it to one.
  async loadPushState(token: string | null, permission: string, notiSetting?: cnst.NotiSetting["value"]) {
    const pushPermission: NotificationPermission =
      permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default";
    const setting = notiSetting ? { notiSetting } : {};
    if (!token) {
      this.set({ deviceToken: null, pushPermission, pushRegistered: false, ...setting });
      return;
    }
    const pushRegistered = await fetch.hasNotiDeviceTokenOfSelf(token);
    this.set({ deviceToken: token, pushPermission, pushRegistered, ...setting });
  }

  async registerPushToken({ token, provider, platform, deviceId }: PushToken) {
    await fetch.addNotiDeviceTokenOfSelf({ token, provider, platform, deviceId, updatedAt: dayjs() });
    this.set({ deviceToken: token, pushPermission: "granted", pushRegistered: true });
  }

  async unregisterPushToken(token: string) {
    await fetch.subNotiDeviceTokenOfSelf(token);
    this.set({ pushRegistered: false });
  }

  async setNotiSettingOfSelf(userId: string, notiSetting: cnst.NotiSetting["value"]) {
    await fetch.setNotiSettingOfUser(userId, notiSetting);
    this.set({ notiSetting });
    msg.success("notification.setNotiSettingSuccess");
  }
}
