import { describe, expect, test } from "bun:test";
import { getTargetCommandNames, getTargetMetas, type TargetOption } from "@akanjs/devkit/commandDecorators";
import { WorkspaceVersionCheck } from "@akanjs/devkit/commandDecorators/workspaceVersionCheck";
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

describe("the commands a CLI of another major.minor refuses", () => {
  const optionsOf = async () => {
    const byName = new Map<string, TargetOption>();
    for (const id of commandModuleIds)
      for (const targetMeta of getTargetMetas(await commandModules[id]()))
        for (const name of getTargetCommandNames(targetMeta)) byName.set(name, targetMeta.targetOption);
    return byName;
  };

  test("are the ones that write, for the arguments and options they run with", async () => {
    const byName = await optionsOf();
    const readsOnly = (name: string, values: { [name: string]: unknown } = {}) => {
      const option = byName.get(name);
      if (!option) throw new Error(`no command ${name}`);
      return WorkspaceVersionCheck.readsOnly(option, values);
    };
    for (const name of ["sync", "sync-all", "create-module", "add-field", "verify", "repair", "start", "build", "mcp"])
      expect([name, readsOnly(name)]).toEqual([name, false]);
    expect(readsOnly("lint", { fix: true })).toBe(false);
    expect(readsOnly("lint", { fix: false })).toBe(true);
    expect(readsOnly("workflow", { action: "apply", dryRun: false })).toBe(false);
    expect(readsOnly("workflow", { action: "plan", dryRun: false })).toBe(true);
    expect(readsOnly("quality", { action: "baseline" })).toBe(false);
    expect(readsOnly("typecheck", { write: true })).toBe(false);
    expect(readsOnly("typecheck", { write: false })).toBe(true);
    expect(readsOnly("agent", { action: "install", check: false })).toBe(false);
    expect(readsOnly("agent", { action: "hook", check: false })).toBe(true);
    for (const name of ["context", "doctor", "logs", "guideline", "version", "library-status", "pipeline"])
      expect([name, readsOnly(name)]).toEqual([name, true]);
  });
});
