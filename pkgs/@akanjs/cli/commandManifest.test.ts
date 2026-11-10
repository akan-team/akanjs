import { describe, expect, test } from "bun:test";
import { getTargetCommandNames, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { CommandManifest } from "./commandManifest";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";

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
    expect(manifest.byCommand.start).toBe("application" satisfies CommandModuleId);
    expect(manifest.byCommand.s).toBe("application" satisfies CommandModuleId);
  });

  // commander refuses a duplicate name at registration, killing every invocation; `short: true` aliases derive from
  // initials, so two unrelated modules can claim the same letter without either file mentioning it.
  test("no two targets claim the same command name or short alias", async () => {
    const owners = new Map<string, string>();
    const collisions: string[] = [];
    for (const id of commandModuleIds) {
      const command = await commandModules[id]();
      for (const targetMeta of getTargetMetas(command)) {
        for (const name of getTargetCommandNames(targetMeta)) {
          const owner = owners.get(name);
          if (owner) collisions.push(`"${name}" is claimed by both ${owner} and ${id}`);
          else owners.set(name, `${id}.${targetMeta.key}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  test("every remove command that takes an app, lib, pkg or module is destructive, so none picks it", async () => {
    const targetTypes = new Set(["App", "Lib", "Sys", "Pkg", "Module", "Exec"]);
    const removes: string[] = [];
    for (const id of commandModuleIds) {
      const command = await commandModules[id]();
      for (const targetMeta of getTargetMetas(command)) {
        if (!targetMeta.key.startsWith("remove")) continue;
        if (!targetMeta.args.some((arg) => targetTypes.has(arg.type))) continue;
        removes.push(`${targetMeta.key}: ${targetMeta.targetOption.destructive === true}`);
      }
    }
    expect(removes.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "removeApplication: true",
      "removeLibrary: true",
      "removeModule: true",
      "removePackage: true",
      "removeScalar: true",
    ]);
  });

  test("falls back to loading every module when it cannot narrow argv", async () => {
    const manifest = await CommandManifest.generate();
    expect(CommandManifest.resolve(manifest, ["bun", "akan"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "--help"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "no-such-command"])).toBeNull();
    expect(CommandManifest.resolve(null, ["bun", "akan", "start"])).toBeNull();
    expect(CommandManifest.resolve(manifest, ["bun", "akan", "start"])).toEqual(["application"]);
  });
});
