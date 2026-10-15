import { serve } from "akanjs/service";

import * as db from "../db";

export class SettingService extends serve(db.setting, () => ({})) {
  async initializeSetting() {
    if (await this.settingModel.findAny()) return;
    await this.settingModel.createSetting({ resignupDays: 0 });
  }
  async getActiveSetting() {
    return await this.settingModel.pickAny();
  }
}
