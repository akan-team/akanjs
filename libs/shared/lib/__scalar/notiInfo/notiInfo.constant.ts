import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class NotiSetting extends enumOf("notiSetting", ["disagree", "fewer", "normal", "block"]) {}

export class NotiInfo extends via((field) => ({
  setting: field(NotiSetting, { default: "normal" }),
  pauseUntil: field(Date, { default: () => dayjs() }),
  deviceTokens: field([String]),
})) {}
