// env merge (docs/architecture.md §7, ENV-1/ENV-2/ENV-6):
//   env.defaults < .env < .env.<mode> < env.platforms.<p> < .env.<p> < .env.<mode>.<p>
// Only PUBLIC_ keys reach the app. Everything else is dropped with a warning.
// akan-native-env.d.ts types the keys for `import { env } from "../../../core/src/index.ts"` (ENV-7).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Platform } from "../../../core/src/index.ts";
import { TARGETS } from "../platforms/targets.ts";
import { CliError } from "./log.ts";

export const PUBLIC_PREFIX = "PUBLIC_";

/** Parses a dotenv file: KEY=value, `export KEY=value`, # comments, '' literal and "" escaped values. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!;
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      // Allow a quoted value to continue over several lines.
      let rest = value.slice(1);
      while (!hasClosingQuote(rest, quote) && i + 1 < lines.length) rest += `\n${lines[++i]}`;
      const end = closingQuoteIndex(rest, quote);
      value = end >= 0 ? rest.slice(0, end) : rest;
      if (quote === '"') {
        value = value.replace(
          /\\([nrt"\\])/g,
          (_, c: string) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[c]!,
        );
      }
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trim();
    }
    out[key] = value;
  }
  return out;
}

function closingQuoteIndex(text: string, quote: string): number {
  for (let i = 0; i < text.length; i++) {
    if (quote === '"' && text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

function hasClosingQuote(text: string, quote: string): boolean {
  return closingQuoteIndex(text, quote) >= 0;
}

/** App config `env` (ENV-1, ENV-6). */
export interface EnvConfig {
  defaults: Record<string, string>;
  platforms: Partial<Record<Platform, Record<string, string>>>;
}

export interface EnvResult {
  env: Record<string, string>;
  /** Sources that had values, lowest precedence first ("akan-native.config", ".env", "akan-native.config (android)", ...). */
  files: string[];
  /** Keys dropped because they lack the PUBLIC_ prefix. */
  dropped: string[];
  /** Every source that set each kept key, lowest precedence first (for the generated types). */
  sources: Record<string, string[]>;
}

const PLATFORMS: readonly Platform[] = ["web", "macos", "windows", "linux", "ios", "android"];

/**
 * The build-time layers for one mode and platform, lowest precedence first: the shared chain,
 * then the same chain for the platform, so a platform value wins over every shared one (the way
 * Tauri merges tauri.<platform>.conf.json over tauri.conf.json, tauri-utils config/parse.rs:50-66).
 *
 *   env.defaults < .env < .env.<mode> < env.platforms.<p> < .env.<p> < .env.<mode>.<p>
 */
export interface EnvLoadOptions {
  /** false: skip the .env files (docs/api.md envFiles). Default true. */
  files?: boolean;
  /** Values above every other layer (docs/api.md env), shown as the source "api". */
  overrides?: Record<string, string>;
}

function envLayers(
  appDir: string,
  mode: string,
  platform: Platform,
  config: EnvConfig,
  options: EnvLoadOptions = {},
): { source: string; values: Record<string, string> }[] {
  if ((PLATFORMS as readonly string[]).includes(mode))
    throw new CliError(`--mode ${mode} is a platform name, which .env.${mode} already means`);
  const file = (name: string) => {
    const path = join(appDir, name);
    return options.files !== false && existsSync(path)
      ? [{ source: name, values: parseDotenv(readFileSync(path, "utf8")) }]
      : [];
  };
  const overrides =
    options.overrides && Object.keys(options.overrides).length ? [{ source: "api", values: options.overrides }] : [];
  const own = config.platforms[platform];
  return [
    { source: "akan-native.config", values: config.defaults },
    ...file(".env"),
    ...file(`.env.${mode}`),
    ...(own ? [{ source: `akan-native.config (${platform})`, values: own }] : []),
    ...file(`.env.${platform}`),
    ...file(`.env.${mode}.${platform}`),
    ...overrides,
  ];
}

export function loadEnv(
  appDir: string,
  mode: string,
  platform: Platform,
  config: EnvConfig,
  options: EnvLoadOptions = {},
): EnvResult {
  const env: Record<string, string> = {};
  const sources: Record<string, string[]> = {};
  const dropped = new Set<string>();
  const files: string[] = [];
  for (const { source, values } of envLayers(appDir, mode, platform, config, options)) {
    if (source !== "akan-native.config") files.push(source);
    for (const [key, value] of Object.entries(values)) {
      if (!key.startsWith(PUBLIC_PREFIX)) {
        dropped.add(key);
        continue;
      }
      env[key] = String(value);
      sources[key] = [...(sources[key] ?? []), source];
    }
  }
  return { env, files, dropped: [...dropped].sort(), sources };
}

/** Checks `env` in akan-native.config.ts. */
export function validateEnvConfig(raw: unknown, problems: string[]): EnvConfig {
  const config: EnvConfig = { defaults: {}, platforms: {} };
  if (raw === undefined) return config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push('env must be an object like { defaults: { PUBLIC_API_URL: "..." } }');
    return config;
  }
  const { defaults, platforms, ...rest } = raw as { defaults?: unknown; platforms?: unknown };
  for (const key of Object.keys(rest)) problems.push(`env.${key} is not supported (use defaults, platforms)`);
  const values = (what: string, value: unknown): Record<string, string> => {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${what} must be an object of strings`);
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(value)) {
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean")
        problems.push(`${what}.${key} must be a string`);
      else out[key] = String(v);
    }
    return out;
  };
  config.defaults = values("env.defaults", defaults);
  if (platforms !== undefined) {
    if (!platforms || typeof platforms !== "object" || Array.isArray(platforms))
      problems.push("env.platforms must be an object like { android: { ... } }");
    else {
      for (const [platform, value] of Object.entries(platforms)) {
        if (!(PLATFORMS as readonly string[]).includes(platform))
          problems.push(`env.platforms.${platform}: unknown platform (use ${PLATFORMS.join(", ")})`);
        else config.platforms[platform as Platform] = values(`env.platforms.${platform}`, value);
      }
    }
  }
  return config;
}

export const ENV_TYPES_FILE = "akan-native-env.d.ts";

/** development, production and every mode that has its own .env file. */
function envModes(appDir: string): string[] {
  const modes = new Set(["development", "production"]);
  for (const name of readdirSync(appDir)) {
    const [, first, second] = /^\.env\.([^.]+)(?:\.([^.]+))?$/.exec(name) ?? [];
    if (!first) continue;
    if (
      second === undefined
        ? !(PLATFORMS as readonly string[]).includes(first)
        : (PLATFORMS as readonly string[]).includes(second)
    )
      modes.add(first);
  }
  return [...modes].sort();
}

/**
 * akan-native-env.d.ts (ENV-7): the PUBLIC_ keys the build can give the app, over every mode and build
 * target. A key all of them get is `string`, the rest are optional. Only key names go in the file.
 * Keys that exist only at run time (AKAN_NATIVE_PUBLIC_*, a replaced env.runtime.json) still read as
 * the index signature on `env` in @akanjs/native/core.
 */
export function envTypes(appDir: string, config: EnvConfig): string {
  const combos = envModes(appDir).flatMap((mode) => TARGETS.map((platform) => ({ mode, platform })));
  const keys = new Map<string, { count: number; sources: Set<string> }>();
  for (const { mode, platform } of combos) {
    for (const [key, sources] of Object.entries(loadEnv(appDir, mode, platform, config).sources)) {
      const entry = keys.get(key) ?? { count: 0, sources: new Set<string>() };
      entry.count++;
      for (const source of sources) entry.sources.add(source);
      keys.set(key, entry);
    }
  }
  const members = [...keys]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { count, sources }]) => {
      const everywhere = count === combos.length;
      const doc = `${[...sources].join(", ")}${everywhere ? "" : " (not in every mode and platform)"}`;
      return `    /** ${doc} */\n    readonly ${key}${everywhere ? "" : "?"}: string;`;
    });
  return [
    "// Generated by akan-native from akan-native.config and the .env files (ENV-7). Do not edit: every build rewrites it.",
    "// Key names only; the values stay in those files.",
    "export {};",
    "",
    'declare module "@akanjs/native/core" {',
    "  interface AkanNativeEnv {",
    ...members,
    "  }",
    "}",
    "",
  ].join("\n");
}

/** Whether the app (or a folder above it) is a TypeScript project. */
function hasTsconfig(appDir: string): boolean {
  for (let dir = appDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "tsconfig.json"))) return true;
    if (dirname(dir) === dir) return false;
  }
}

/** Writes akan-native-env.d.ts next to akan-native.config.ts when it changed. Returns whether it wrote. */
export function writeEnvTypes(appDir: string, config: EnvConfig): boolean {
  if (!hasTsconfig(appDir)) return false;
  const path = join(appDir, ENV_TYPES_FILE);
  const text = envTypes(appDir, config);
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}
