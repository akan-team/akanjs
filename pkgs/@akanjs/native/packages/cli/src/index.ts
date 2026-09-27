#!/usr/bin/env bun
import { BUILD_USAGE, build, RUN_USAGE, run } from "./commands/build.ts";
import { COMPAT_USAGE, compat } from "./commands/compat.ts";
import { DEV_USAGE, dev } from "./commands/dev.ts";
import { doctor } from "./commands/doctor.ts";
import { PLUGIN_USAGE, plugin } from "./commands/plugin.ts";
import { SIGNING_USAGE, signing } from "./commands/signing.ts";
import { TEST_USAGE, test } from "./commands/test.ts";
import { TOOLCHAIN_USAGE, toolchain } from "./commands/toolchain.ts";
import { UPDATE_USAGE, update } from "./commands/update.ts";
import { CliError, log } from "./lib/log.ts";

type Command = (args: string[]) => Promise<number>;

const COMMANDS: Record<string, { run: Command; summary: string; usage?: string }> = {
  doctor: {
    run: doctor,
    summary: "Check the toolchains required for each platform (--fix installs what akan-native can)",
    usage: "akan-native doctor [web|macos|ios|android] [--fix]",
  },
  toolchain: {
    run: toolchain,
    summary: "List or install the pinned toolchains (kotlinc, JDK, Rust, Android SDK)",
    usage: TOOLCHAIN_USAGE,
  },
  build: { run: build, summary: "Build the app for a platform", usage: BUILD_USAGE },
  run: { run, summary: "Build and launch the app (browser, simulator, emulator, desktop)", usage: RUN_USAGE },
  test: { run: test, summary: "Run the app's self-test on one or all platforms", usage: TEST_USAGE },
  dev: { run: dev, summary: "Build, launch and rebuild on every change (live reload)", usage: DEV_USAGE },
  signing: {
    run: signing,
    summary: "A stable self-signed identity for macOS dev builds (TCC and Keychain survive rebuilds)",
    usage: SIGNING_USAGE,
  },
  update: {
    run: update,
    summary: "Signing key, signed releases and a local server for over-the-air updates (UP-1, UP-2)",
    usage: UPDATE_USAGE,
  },
  compat: {
    run: compat,
    summary: "Whether the app still runs as a web-only update in an earlier binary (bundle.json)",
    usage: COMPAT_USAGE,
  },
  plugin: {
    run: plugin,
    summary: "Check a plugin's TypeScript spec against its manifest, or show the Swift / Kotlin generated from it",
    usage: PLUGIN_USAGE,
  },
};

function usage(): void {
  console.info("Usage: akan-native <command> [args]\n\nCommands:");
  for (const [name, { summary, usage }] of Object.entries(COMMANDS)) {
    console.info(`  ${name.padEnd(10)} ${summary}`);
    if (usage) console.info(`  ${"".padEnd(10)} ${usage}`);
  }
}

const [name, ...args] = process.argv.slice(2);
const command = name ? COMMANDS[name] : undefined;

if (!command) {
  if (name && name !== "help" && name !== "--help") console.error(`Unknown command: ${name}\n`);
  usage();
  process.exit(name && name !== "help" && name !== "--help" ? 2 : 0);
}

try {
  process.exit(await command.run(args));
} catch (error) {
  if (error instanceof CliError) {
    log.error(error.message);
    process.exit(error.exitCode);
  }
  throw error;
}
