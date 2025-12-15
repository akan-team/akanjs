import { endpoint, internal, slice } from "@akanjs/signal";
import { Admin } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class SettingInternal extends internal(srv.setting, () => ({})) {}

export class SettingSlice extends slice(srv.setting, { guards: { root: Admin, get: Admin, cru: Admin } }, () => ({})) {}

export class SettingEndpoint extends endpoint(srv.setting, ({ query }) => ({
  getActiveSetting: query(cnst.Setting).exec(async function () {
    return await this.settingService.getActiveSetting();
  }),
})) {}
