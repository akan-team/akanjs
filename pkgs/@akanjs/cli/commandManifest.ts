import path from "node:path";
import { getTargetCommandNames, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";

export interface CommandManifestData {
  /** CLI name → module id, including short aliases. */
  byCommand: Record<string, CommandModuleId>;
}

// Built at build time because a dev sandbox may run `akan start` only once; absent, the entry loads every module.
export class CommandManifest {
  static readonly fileName = "commandManifest.json";

  /** Builds the manifest by loading every command module. Build-time only — never on the CLI hot path. */
  static async generate(): Promise<CommandManifestData> {
    const byCommand: Record<string, CommandModuleId> = {};
    for (const id of commandModuleIds) {
      const command = await commandModules[id]();
      for (const targetMeta of getTargetMetas(command)) {
        for (const name of getTargetCommandNames(targetMeta)) {
          // First declaration wins, matching commander's registration in `commandModuleIds` order.
          byCommand[name] ??= id;
        }
      }
    }
    return { byCommand };
  }

  /** Reads the manifest emitted next to the running entry, or null when running from source. */
  static async read(dir: string = path.dirname(Bun.main)): Promise<CommandManifestData | null> {
    const file = Bun.file(path.join(dir, CommandManifest.fileName));
    if (!(await file.exists())) return null;
    const data = (await file.json()) as CommandManifestData;
    return data.byCommand && typeof data.byCommand === "object" ? data : null;
  }

  /** `null` means "cannot narrow": load everything so commander can render full help and did-you-mean. */
  static resolve(manifest: CommandManifestData | null, argv: string[]): CommandModuleId[] | null {
    const requested = argv[2];
    if (requested === "--version" || requested === "-V") return [];
    if (!manifest || !requested || requested.startsWith("-")) return null;
    const id = manifest.byCommand[requested];
    return id ? [id] : null;
  }
}
