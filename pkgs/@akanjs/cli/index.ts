#!/usr/bin/env bun

import { runCommands } from "@akanjs/devkit/commandDecorators";
import { CommandManifest } from "./commandManifest";
import { type CommandModuleId, commandModuleIds, commandModules } from "./commandModules";

// Only the module that owns `argv[2]` is imported: every command module carries its own heavy stack,
// and `akan start` holds the process for the whole dev session. See `commandManifest.ts`.
const ids: CommandModuleId[] = CommandManifest.resolve(await CommandManifest.read(), process.argv) ?? commandModuleIds;
const commands = await Promise.all(ids.map(async (id) => await commandModules[id]()));

void runCommands(...commands);
