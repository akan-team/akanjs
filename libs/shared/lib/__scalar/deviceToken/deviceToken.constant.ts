import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PushProvider extends enumOf("pushProvider", ["apns", "fcm"] as const) {}

export class DevicePlatform extends enumOf("devicePlatform", ["ios", "android", "web"] as const) {}

export class DeviceToken extends via((field) => ({
  token: field(String),
  provider: field(PushProvider, { default: "fcm" }),
  platform: field(DevicePlatform, { default: "web" }),
  deviceId: field(String).optional(), // a random id the client keeps for its installation, so a rotated token replaces the one it had
  updatedAt: field(Date, { default: () => dayjs() }),
})) {}
