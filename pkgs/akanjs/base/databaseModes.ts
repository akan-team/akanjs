import type { DatabaseMode } from "./baseEnv";

export interface DatabaseModeRequest {
  /** `AKAN_DATABASE_MODE`: the mode a deployment names. */
  requested: string | undefined;
  /** `AKAN_DATABASE_MODES`: what the build carries drivers for, first one the default. Unset allows any. */
  declared: string | undefined;
  /** A developer machine, which may leave the mode unnamed when the build carries several. */
  local: boolean;
}

/** The database modes, what each runs on, and how a process settles on one. The CLI and the server share it. */
export class DatabaseModes {
  static readonly all = ["single", "multiple", "cluster"] as const satisfies readonly DatabaseMode[];
  /** Packages a mode imports at runtime. A build carries them for every mode the app declares. */
  static readonly drivers: { [mode in DatabaseMode]: readonly string[] } = {
    single: [],
    multiple: ["bullmq", "ioredis"],
    cluster: ["bullmq", "ioredis", "postgres"],
  };
  static readonly #stores: { [mode in DatabaseMode]: string } = {
    single: "sqlite · solid",
    multiple: "sqlite · redis",
    cluster: "postgres · redis",
  };

  static describe(mode: DatabaseMode) {
    return `${mode} (${DatabaseModes.#stores[mode]})`;
  }

  static parse(value: string, source: string): DatabaseMode {
    const mode = value.trim();
    if ((DatabaseModes.all as readonly string[]).includes(mode)) return mode as DatabaseMode;
    throw new Error(`${source} must be one of ${DatabaseModes.all.join(", ")}, not "${value}"`);
  }

  static parseList(value: string, source: string): DatabaseMode[] {
    const modes = value
      .split(",")
      .filter((mode) => mode.trim())
      .map((mode) => DatabaseModes.parse(mode, source));
    if (!modes.length) throw new Error(`${source} names no database mode`);
    return [...new Set(modes)];
  }

  /**
   * The mode this process runs in, or the reason it cannot pick one. A deployment that names no mode when the build
   * carries several fails rather than falling back: the fallback would be a SQLite file inside each container, which a
   * cluster deployment would find out about only once its instances disagreed.
   */
  static resolve({ requested, declared, local }: DatabaseModeRequest): DatabaseMode {
    const modes = declared?.trim() ? DatabaseModes.parseList(declared, "AKAN_DATABASE_MODES") : null;
    if (requested?.trim()) {
      const mode = DatabaseModes.parse(requested, "AKAN_DATABASE_MODE");
      if (modes && !modes.includes(mode))
        throw new Error(
          `AKAN_DATABASE_MODE is ${mode}, but this build carries only ${modes.join(", ")}. Add "${mode}" to database.modes in akan.config.ts and rebuild.`,
        );
      return mode;
    }
    if (!modes) return "single";
    if (modes.length === 1 || local) return modes[0] as DatabaseMode;
    throw new Error(
      `This build runs in ${modes.join(" or ")} mode, and AKAN_DATABASE_MODE names neither. Set it to say which this deployment is.`,
    );
  }

  /** `resolve` for readers that cannot fail a boot; the boot itself resolves again and reports the reason. */
  static settle(request: DatabaseModeRequest): DatabaseMode | undefined {
    try {
      return DatabaseModes.resolve(request);
    } catch {
      return undefined;
    }
  }
}
