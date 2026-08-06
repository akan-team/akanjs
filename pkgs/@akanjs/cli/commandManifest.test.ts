import { describe, expect, test } from "bun:test";
import { getTargetCommandNames, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { CommandManifest } from "./commandManifest";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";

/**
 * `akan start` holds its process for the whole dev session, so this guards the property that keeps it
 * cheap: the entry resolves a command to exactly one module instead of importing all 17. The sibling
 * property — that no entry pulls a heavy dependency eagerly — moved to `entryModuleGraph.test.ts`,
 * which walks the chunk closure; the version that lived here only grepped the entry file and so could
 * not see a dependency reached through a shared chunk.
 */
describe("CommandManifest", () => {
  test("covers every command name declared by every command module", async () => {
    const manifest = await CommandManifest.generate();
    for (const id of commandModuleIds) {
      const command = await commandModules[id]();
      for (const targetMeta of getTargetMetas(command)) {
        for (const name of getTargetCommandNames(targetMeta)) {
          expect(manifest.byCommand[name]).toBeDefined();
        }
      }
    }
    // Sanity-check the hot path specifically: `start`/`s` must resolve, and to the app module.
    expect(manifest.byCommand.start).toBe("application" satisfies CommandModuleId);
    expect(manifest.byCommand.s).toBe("application" satisfies CommandModuleId);
  });

  test("falls back to loading every module when it cannot narrow argv", async () => {
    const manifest = await CommandManifest.generate();
    // Global help and unknown commands must load everything so commander can render full help and
    // its did-you-mean suggestions.
    expect(CommandManifest.resolve(manifest, ["bun", "akan"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "--help"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "no-such-command"])).toBeNull();
    expect(CommandManifest.resolve(null, ["bun", "akan", "start"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "start"])).toEqual(["application"]);
  });
});
