#!/usr/bin/env bun

import { runCommands } from "@akanjs/devkit/commandDecorators";
import { BunVersionGuard } from "./bunVersionGuard";
import { CommandManifest } from "./commandManifest";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";
import { engines } from "./package.json";

const bunRefusal = BunVersionGuard.refusal(Bun.version, engines.bun);
if (bunRefusal) {
  console.error(bunRefusal);
  process.exit(1);
}

// Only the module that owns `argv[2]` is imported: every command module carries its own heavy stack.
const ids: CommandModuleId[] = CommandManifest.resolve(await CommandManifest.read(), process.argv) ?? commandModuleIds;
const commands = await Promise.all(ids.map(async (id) => await commandModules[id]()));

// Awaited, not voided: on Windows Bun exits during a missing file's `Bun.file` read unless an entry await is pending.
await runCommands(...commands);
