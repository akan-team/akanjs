import type { AkanNativeSettings } from "./types";

export class NativeFileSettings {
  static readonly #androidFilePattern = /^(?:res\/[^/]+\/[^/]+|assets\/.+)$/;
  static assert(settings: AkanNativeSettings, where: string, configPath: string) {
    const check = (
      files: Record<string, string> | undefined,
      at: string,
      valid: (to: string) => boolean,
      shape: string,
    ) => {
      for (const [to, from] of Object.entries(files ?? {})) {
        if (typeof from !== "string")
          throw new Error(
            `${at}["${to}"] in ${configPath} must name its source file, relative to the app folder, e.g. { "${shape}": "assets/chime.mp3" }.`,
          );
        if (!valid(to)) throw new Error(`${at}["${to}"] in ${configPath} must land at ${shape}.`);
      }
    };
    check(
      settings.ios?.files,
      `${where}.ios.files`,
      (to) => to.length > 0 && !to.startsWith("/") && !to.split("/").includes(".."),
      "<path in the app bundle>",
    );
    check(
      settings.android?.files,
      `${where}.android.files`,
      (to) => NativeFileSettings.#androidFilePattern.test(to),
      "res/<type>/<file> or assets/<path>",
    );
  }
}
