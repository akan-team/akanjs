import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class NotificationInternal extends internal(srv.notification, () => ({})) {}

export class NotificationSlice extends slice(
  srv.notification,
  // `cru: false`: a notification is content that goes out to readers; composing one is a console action.
  { guards: { root: Admin, get: Public, cru: Admin }, mcp: { cru: false } },
  () => ({}),
) {}

export class NotificationEndpoint extends endpoint(srv.notification, ({ mutation }) => ({
  // `mcp: false`: this reaches every device that ever subscribed, and a push cannot be recalled.
  sendPushNotification: mutation(cnst.Notification, { guards: [Admin], mcp: false })
    .body("notificationInput", cnst.NotificationInput)
    .exec(async function (notificationInput) {
      return await this.notificationService.sendPushNotification(notificationInput);
    }),
})) {}
