import { Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";
import { Admin, Every, Self } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class NotificationInternal extends internal(srv.notification, () => ({})) {}

export class NotificationSlice extends slice(
  srv.notification,
  { guards: { root: Admin, get: Public, cru: Every } },
  () => ({})
) {}

export class NotificationEndpoint extends endpoint(srv.notification, ({ mutation }) => ({
  subscribeToMegaphone: mutation(Boolean)
    .param("token", String)
    .exec(async function (token) {
      await this.notificationService.subscribeToMegaphone(token);
      return true;
    }),
  subscribeToSelf: mutation(Boolean)
    .param("token", String)
    .with(Self)
    .exec(async function (token, self) {
      await this.notificationService.subscribeToSelf(token, self.id);
      return true;
    }),
  sendPushNotification: mutation(cnst.Notification, { guards: [Admin] })
    .body("notificationInput", cnst.NotificationInput)
    .exec(async function (notificationInput) {
      return await this.notificationService.sendPushNotification(notificationInput);
    }),
})) {}
