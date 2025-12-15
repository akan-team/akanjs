import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class SettingInput extends via((field) => ({
  resignupDays: field(Int, { default: 0 }),
})) {}

export class SettingObject extends via(SettingInput, (field) => ({})) {}

export class LightSetting extends via(SettingObject, ["resignupDays"] as const, (resolve) => ({})) {}

export class Setting extends via(SettingObject, LightSetting, (resolve) => ({})) {}

export class SettingInsight extends via(Setting, (field) => ({})) {}
