// akan-native plugin check | codegen | stub (PL-10): the plugin spec is the definePlugin<Api, Events>
// interface in src/index.ts; these commands compare it with native-plugin.json and show the Swift /
// Kotlin code akan-native generates from it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs, stringFlag } from "../lib/args.ts";
import {
  buildModel,
  type GenModel,
  generateKotlin,
  generateSwift,
  kotlinStub,
  specProblems,
  swiftStub,
  untypedMembers,
} from "../lib/codegen.ts";
import { CliError, dim, log } from "../lib/log.ts";
import { androidPlugins, desktopModuleProblems, iosPlugins } from "../lib/native-plugins.ts";
import { findAppDir, loadProject, type NativeSubset, type ResolvedPlugin, resolvePlugins } from "../lib/project.ts";
import { readPluginSpec } from "../lib/spec.ts";
import { compileAndroidPlugins } from "../platforms/android.ts";
import { typecheckIosPlugins } from "../platforms/ios.ts";

export const PLUGIN_USAGE =
  "akan-native plugin check [dir] | akan-native plugin codegen [dir] [--out <dir>] | akan-native plugin stub <ios|android> [dir] | akan-native plugin compile <ios|android> [dir] [--only id,id]";

/** The plugin in `dir` (a folder with native-plugin.json), or every plugin of the app there. */
async function pluginsAt(dir: string): Promise<ResolvedPlugin[]> {
  if (existsSync(join(dir, "native-plugin.json"))) return resolvePlugins(dir, ["."]);
  return (await loadProject(findAppDir(dir))).plugins;
}

function onePlugin(plugins: ResolvedPlugin[], dir: string): ResolvedPlugin {
  if (plugins.length !== 1) throw new CliError(`${dir} is not a plugin folder (no native-plugin.json)`);
  return plugins[0]!;
}

const model = (plugin: ResolvedPlugin, platform?: "ios" | "android"): GenModel => {
  const native = platform ? plugin.manifest[platform] : undefined;
  const subset: NativeSubset = native && typeof native === "object" ? native : {};
  return buildModel(readPluginSpec(plugin.dir), plugin.manifest.id, {
    methods: subset.methods ?? plugin.manifest.methods,
    events: subset.events ?? plugin.manifest.events,
    source: relative(plugin.dir, join(plugin.dir, "src/index.ts")),
  });
};

async function check(dir: string): Promise<number> {
  let failed = 0;
  for (const plugin of await pluginsAt(dir)) {
    const id = plugin.manifest.id;
    try {
      const problems = [
        ...specProblems(plugin.manifest, readPluginSpec(plugin.dir)),
        ...(await desktopModuleProblems(plugin)),
      ];
      const untyped = untypedMembers(model(plugin));
      if (problems.length) {
        failed++;
        log.error(`${id}:\n    ${problems.join("\n    ")}`);
      } else log.ok(`${id}${plugin.manifest.codegen ? dim(" (codegen)") : ""}`);
      for (const u of untyped) log.info(dim(`untyped ${u}`));
    } catch (error) {
      failed++;
      log.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failed ? 1 : 0;
}

function codegen(plugin: ResolvedPlugin, out: string): number {
  const written: string[] = [];
  for (const platform of ["ios", "android"] as const) {
    const native = plugin.manifest[platform];
    const m = model(plugin, platform);
    const file =
      platform === "ios"
        ? join(out, "ios", `${m.prefix}PluginSpec.swift`)
        : join(out, "android", `${m.prefix}PluginSpec.kt`);
    const pkg =
      native && typeof native === "object" && "class" in native
        ? native.class.replace(/\.[^.]+$/, "")
        : `com.akanjs.plugins.${plugin.manifest.id.replace(/-/g, "")}`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, platform === "ios" ? generateSwift(m) : generateKotlin(m, pkg));
    written.push(relative(process.cwd(), file) || file);
  }
  log.ok(`wrote ${written.join(", ")}`);
  if (!plugin.manifest.codegen) log.info(dim('builds use these only with "codegen": true in native-plugin.json'));
  return 0;
}

function stub(plugin: ResolvedPlugin, platform: "ios" | "android"): number {
  const native = plugin.manifest[platform];
  const m = model(plugin, platform);
  const className = native && typeof native === "object" ? native.class.split(".").at(-1)! : `${m.prefix}Plugin`;
  if (platform === "ios") console.info(swiftStub(m, className));
  else {
    const pkg =
      native && typeof native === "object"
        ? native.class.replace(/\.[^.]+$/, "")
        : `com.akanjs.plugins.${plugin.manifest.id.replace(/-/g, "")}`;
    console.info(kotlinStub(m, pkg, className));
  }
  return 0;
}

/** Compiles the shell with just these plugins' native sources and generated bindings. */
async function compileNative(plugins: ResolvedPlugin[], platform: "ios" | "android", appDir: string): Promise<number> {
  const natives = platform === "ios" ? iosPlugins(plugins) : androidPlugins(plugins);
  if (!natives.length) throw new CliError(`none of these plugins has a native ${platform} implementation`);
  const ids = natives.map((n) => n.plugin.manifest.id).join(", ");
  log.step(`${platform === "ios" ? "swiftc -typecheck" : "kotlinc"}: shell + ${ids}`);
  const started = performance.now();
  const result =
    platform === "ios"
      ? await typecheckIosPlugins(iosPlugins(plugins), appDir)
      : await compileAndroidPlugins(androidPlugins(plugins), appDir);
  const output = `${result.stdout}${result.stderr}`.trim();
  if (output) console.info(output);
  if (result.code !== 0) {
    log.error(`${platform} compile failed`);
    return 1;
  }
  log.ok(`${platform}: compiled ${dim(`in ${Math.round(performance.now() - started)} ms`)}`);
  return 0;
}

export async function plugin(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [sub, ...rest] = args.positional;
  switch (sub) {
    case "check":
      return check(resolve(rest[0] ?? "."));
    case "codegen": {
      const dir = resolve(rest[0] ?? ".");
      const p = onePlugin(await pluginsAt(dir), dir);
      return codegen(p, resolve(stringFlag(args, "out") ?? join(p.dir, ".akan", "native", "codegen")));
    }
    case "stub": {
      const platform = rest[0];
      if (platform !== "ios" && platform !== "android") throw new CliError(`usage: ${PLUGIN_USAGE}`, 2);
      const dir = resolve(rest[1] ?? ".");
      return stub(onePlugin(await pluginsAt(dir), dir), platform);
    }
    case "compile": {
      const platform = rest[0];
      if (platform !== "ios" && platform !== "android") throw new CliError(`usage: ${PLUGIN_USAGE}`, 2);
      const dir = resolve(rest[1] ?? ".");
      const only = stringFlag(args, "only")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let plugins = await pluginsAt(dir);
      if (only) {
        const unknown = only.filter((id) => !plugins.some((p) => p.manifest.id === id));
        if (unknown.length) throw new CliError(`--only: no plugin ${unknown.join(", ")} here`);
        plugins = plugins.filter((p) => only.includes(p.manifest.id));
      }
      return compileNative(plugins, platform, existsSync(join(dir, "native-plugin.json")) ? dir : findAppDir(dir));
    }
    default:
      throw new CliError(`usage: ${PLUGIN_USAGE}`, 2);
  }
}
