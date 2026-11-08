//* Set in a PR preview's pod: its code is unreviewed, so mail, SMS, Discord and push log a skip and GitHub writes fail.
export class PreviewMode {
  static readonly env = "AKAN_PREVIEW";
  static readonly #offValues = ["", "0", "false", "off", "no"];

  static isOn() {
    const value = process.env[PreviewMode.env]?.trim().toLowerCase();
    return value !== undefined && !PreviewMode.#offValues.includes(value);
  }
}
