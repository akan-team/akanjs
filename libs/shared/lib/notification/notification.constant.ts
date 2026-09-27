import { enumOf, ID } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class NotiLevel extends enumOf("notiLevel", [
  "actionRequired",
  "notice",
  "essential",
  "suggestion",
  "advertise",
]) {}

export class NotificationType extends enumOf("notificationType", ["user", "all"]) {}

export class NotificationInput extends via((field) => ({
  userId: field(ID).optional(), // the one recipient of a `user` notification; an `all` one reaches every active user
  title: field(String, { text: "title" }),
  content: field(String, { text: "desc" }),
  url: field(String).optional(),
  field: field(String).optional(),
  image: field(File, { text: "thumb" }).optional(),
  type: field(NotificationType, { default: "user" }),
  level: field(NotiLevel, { default: "notice", text: "filter" }),
})) {}

export class NotificationObject extends via(NotificationInput, (field) => ({})) {}

export class LightNotification extends via(
  NotificationObject,
  ["type", "level", "title"] as const,
  (resolve) => ({}),
) {}

export class Notification extends via(NotificationObject, LightNotification, (resolve) => ({})) {}

export class NotificationInsight extends via(Notification, (field) => ({})) {}
