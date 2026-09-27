import { Admin, User } from "@libs/shared/srvkit";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class NotificationInternal extends internal(srv.notification, () => ({})) {}

export class NotificationSlice extends slice(
  srv.notification,
  // `cru: false`: a notification is content that goes out to readers; composing one is a console action.
  // `get: Admin`: the full record carries the device token or topic it was addressed to, and the field is not
  // secret — a public read would hand out the push address of whoever it was sent to.
  { guards: { root: Admin, get: Admin, cru: Admin }, mcp: { cru: false } },
  () => ({}),
) {}

export class NotificationEndpoint extends endpoint(srv.notification, ({ mutation }) => ({
  // `mcp: false`: a push token belongs to a running browser or device, and there is none on the other end of
  // an MCP call.
  subscribeToMegaphone: mutation(Boolean, { guards: [User], mcp: false })
    .param("token", String)
    .exec(async function (token) {
      await this.notificationService.subscribeToMegaphone(token);
      return true;
    }),
  // `mcp: false`: this reaches every device that ever subscribed, and a push cannot be recalled.
  sendPushNotification: mutation(cnst.Notification, { guards: [Admin], mcp: false })
    .body("notificationInput", cnst.NotificationInput)
    .exec(async function (notificationInput) {
      return await this.notificationService.sendPushNotification(notificationInput);
    }),
})) {}
