import path from "node:path";
import { getTargetCommandNames, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";

export interface CommandManifestData {
  /** CLI name → module id, including short aliases. */
  byCommand: Record<string, CommandModuleId>;
}

/**
 * Maps a CLI command name to the single module that implements it, so the entry can import one module
 * instead of all sixteen. Generated at build time (see `build.ts`) because a dev sandbox may only ever
 * run `akan start` once — deriving it on first run would make that one run pay the full cost.
 *
 * When the file is absent (running from source, or an older published build) the entry falls back to
 * loading every module, i.e. the pre-manifest behavior.
 */
export class CommandManifest {
  static readonly fileName = "commandManifest.json";

  /** Builds the manifest by loading every command module. Build-time only — never on the CLI hot path. */
  static async generate(): Promise<CommandManifestData> {
    const byCommand: Record<string, CommandModuleId> = {};
    for (const id of commandModuleIds) {
      const command = await commandModules[id]();
      for (const targetMeta of getTargetMetas(command)) {
        for (const name of getTargetCommandNames(targetMeta)) {
          // First declaration wins, matching commander: `runCommands` registers modules in
          // `commandModuleIds` order and a later duplicate never takes over the name.
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

  /**
   * Module ids needed to serve this argv. `null` means "cannot narrow" — an unknown command, a global
   * `--help`, or no manifest — and the caller must load everything so commander can render full help
   * and its did-you-mean suggestions.
   */
  static resolve(manifest: CommandManifestData | null, argv: string[]): CommandModuleId[] | null {
    const requested = argv[2];
    if (!manifest || !requested || requested.startsWith("-")) return null;
    const id = manifest.byCommand[requested];
    return id ? [id] : null;
  }
}
