import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";

export class NotificationFilter extends from(cnst.Notification, (filter) => ({
  query: {},
  sort: {},
})) {}

export class Notification extends by(cnst.Notification) {}

export class NotificationModel extends into(Notification, NotificationFilter, cnst.notification, () => ({})) {}

export class NotificationMiddleware extends beyond(NotificationModel, Notification) {
  onSchema(schema: SchemaOf<NotificationModel, Notification>) {
    // schema.index({ status: 1 })
  }
}
