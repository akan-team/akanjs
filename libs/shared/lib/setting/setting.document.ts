import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";

export class SettingFilter extends from(cnst.Setting, (filter) => ({
  query: {},
  sort: {},
})) {}

export class Setting extends by(cnst.Setting) {}

export class SettingModel extends into(Setting, SettingFilter, cnst.setting, () => ({})) {}

export class SettingMiddleware extends beyond(SettingModel, Setting) {
  onSchema(schema: SchemaOf<SettingModel, Setting>) {
    // schema.index({ status: 1 })
  }
}
