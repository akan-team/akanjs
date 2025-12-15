import { enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

import { File } from "../file/file.constant";

export class NotiLevel extends enumOf("notiLevel", [
  "actionRequired",
  "notice",
  "essential",
  "suggestion",
  "advertise",
]) {}

export class NotificationType extends enumOf("notificationType", ["topic", "token"]) {}

export class NotificationInput extends via((field) => ({
  token: field(String).optional(),
  title: field(String),
  content: field(String),
  field: field(String).optional(),
  image: field(File).optional(),
  type: field(NotificationType, { default: "token" }),
  level: field(NotiLevel, { default: "notice" }),
})) {}

export class NotificationObject extends via(NotificationInput, (field) => ({})) {}

export class LightNotification extends via(
  NotificationObject,
  ["type", "level", "title"] as const,
  (resolve) => ({})
) {}

export class Notification extends via(NotificationObject, LightNotification, (resolve) => ({})) {}

export class NotificationInsight extends via(Notification, (field) => ({})) {}
