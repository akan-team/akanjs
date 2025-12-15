import { serve } from "@akanjs/service";

import * as db from "../db";

export class SettingService extends serve(db.setting, () => ({})) {
  protected setting: db.Setting;

  async getActiveSetting() {
    this.setting = (await this.settingModel.findAny()) ?? (await this.settingModel.createSetting({ resignupDays: 0 }));
    return this.setting;
  }
}
