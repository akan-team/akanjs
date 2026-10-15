import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class SettingInternal extends internal(srv.setting, ({ initialize }) => ({
  initializeSetting: initialize({ once: true }).exec(async function () {
    await this.settingService.initializeSetting();
  }),
})) {}

export class SettingSlice extends slice(srv.setting, { guards: { root: Admin, get: Admin, cru: Admin } }, () => ({})) {}

export class SettingEndpoint extends endpoint(srv.setting, ({ query }) => ({
  // `Public`: apps read it before anyone signs in (lu's minimum app version gate, akasys's studio guide).
  getActiveSetting: query(cnst.Setting, { guards: [Public], mcp: false }).exec(async function () {
    return await this.settingService.getActiveSetting();
  }),
})) {}
