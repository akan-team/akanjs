import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class NotificationInternal extends internal(srv.notification, () => ({})) {}

export class NotificationSlice extends slice(
  srv.notification,
  // `cru: false`: a notification is content that goes out to readers; composing one is a console action.
  // `get: Admin`: the full record names the user it was addressed to, and the field is not secret — a public
  // read would tell anyone who was sent what.
  { guards: { root: Admin, get: Admin, cru: Admin }, mcp: { cru: false } },
  () => ({}),
) {}

export class NotificationEndpoint extends endpoint(srv.notification, ({ mutation }) => ({
  // `mcp: false`: an `all` notification reaches every active user's devices, and a push cannot be recalled.
  sendPushNotification: mutation(cnst.Notification, { guards: [Admin], mcp: false })
    .body("notificationInput", cnst.NotificationInput)
    .exec(async function (notificationInput) {
      return await this.notificationService.sendPushNotification(notificationInput);
    }),
})) {}
