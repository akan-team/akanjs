// What every call of the programmatic API (api.ts, api-updates.ts) runs through: its options and results, the one
// error type, the build under a folder's lock, and the log sink and abort signal of a call.

import { resolve } from "node:path";
import type { AkanNativeConfig } from "../config.ts";
import { PLATFORM_TARGETS, type TargetPlatform } from "../platforms/index.ts";
import { CancelledError, withSignal } from "./exec.ts";
import { CliError, type LogSink, ToolchainError, ToolError, withLogSink } from "./log.ts";
import {
  type BuildContext,
  type BuildOptions,
  type BuildProfile,
  type IosSigningResult,
  prepare,
  SigningError,
  WebBuildError,
  WebInputError,
} from "./prepare.ts";
import { ConfigError, type Project, projectFromConfig } from "./project.ts";

export type AkanNativeErrorCode =
  | "CONFIG_INVALID"
  | "TOOLCHAIN_MISSING"
  | "WEB_INPUT_INVALID"
  | "WEB_BUILD_FAILED"
  | "NATIVE_BUILD_FAILED"
  | "SIGNING_FAILED"
  | "DEVICE_FAILED"
  | "CANCELLED"
  | "INTERNAL";

export class AkanNativeError extends Error {
  constructor(
    readonly code: AkanNativeErrorCode,
    message: string,
    readonly details: { problems?: string[]; hint?: string; logTail?: string[]; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AkanNativeError";
  }
  get problems(): string[] | undefined {
    return this.details.problems;
  }
  get hint(): string | undefined {
    return this.details.hint;
  }
  get logTail(): string[] | undefined {
    return this.details.logTail;
  }
}

export interface TaskOptions {
  /** Base of the config's relative paths (web.dir, icon, relative plugin folders). */
  appDir: string;
  /** What akan-native.config.ts would export. No file is read. */
  config: AkanNativeConfig;
  platform: TargetPlatform;
  /** Default <appDir>/.akan/native/build/<platform>. */
  outDir?: string;
  /** Picks .env.<mode>. Default "production" for build, "development" for run. */
  mode?: string;
  /** false: no .env files from appDir. Default true. */
  envFiles?: boolean;
  /** PUBLIC_ values above .env files and config.env. */
  env?: Record<string, string>;
  /** Skip config.web.build and use web.dir as it is. */
  skipWebBuild?: boolean;
  /** Where plugin package names resolve from. Default appDir. */
  resolveFrom?: string;
  /** Receives the log. Without it nothing is logged. */
  log?: LogSink;
  /** Kills the running tools and rejects with CANCELLED. */
  signal?: AbortSignal;
}

export interface Artifact {
  kind: "app" | "apk" | "aab" | "ipa" | "folder" | "web" | "installer";
  path: string;
  signing: "none" | "adhoc" | "debug" | "development" | "distribution";
  device?: "simulator" | "device";
}

export interface BuildResult {
  platform: TargetPlatform;
  profile: BuildProfile;
  outDir: string;
  artifacts: Artifact[];
  warnings: string[];
  durationMs: number;
  /** iPhone builds: the identity and provisioning profile found (docs/api.md §3 "Finding the signing"). */
  signing?: IosSigningResult;
  /**
   * Android builds that contain pinned libraries (push's FCM module, iap): the license notices file
   * (akan-native-licenses.json, also served in the app at /akan-native-licenses.json).
   */
  licenses?: string;
}

/** Builds with one outDir at a time: a second call for the same folder waits for the first. */
const outDirLocks = new Map<string, Promise<unknown>>();

export async function buildIn(
  options: TaskOptions,
  profile: BuildProfile,
  mode: string,
  warnings: string[],
  extra: Pick<
    BuildOptions,
    "android" | "ios" | "windows" | "macos" | "linux" | "arch" | "devServer" | "startPath"
  > = {},
): Promise<{ ctx: BuildContext; artifact: string; result: BuildResult }> {
  const started = performance.now();
  const appDir = resolve(options.appDir);
  let project: Project;
  try {
    project = projectFromConfig(options.config, appDir, { resolveFrom: options.resolveFrom });
  } catch (error) {
    throw toAkanNativeError(error, "CONFIG_INVALID");
  }
  const outDir = resolve(options.outDir ?? resolve(appDir, ".akan", "native", "build", options.platform));
  const previous = outDirLocks.get(outDir) ?? Promise.resolve();
  const mine = previous
    .catch(() => {})
    .then(async () => {
      const ctx = await prepare(project, options.platform, {
        mode,
        profile,
        skipWebBuild: options.skipWebBuild ?? false,
        outDir,
        envFiles: options.envFiles,
        env: options.env,
        api: true,
        ...extra,
      }).catch((error) => {
        throw toAkanNativeError(error, "CONFIG_INVALID");
      });
      const artifact = await PLATFORM_TARGETS[options.platform].build(ctx).catch((error) => {
        throw toAkanNativeError(error, "NATIVE_BUILD_FAILED");
      });
      return { ctx, artifact };
    });
  outDirLocks.set(outDir, mine);
  try {
    const { ctx, artifact } = await mine;
    const artifacts = [
      describe(options.platform, artifact, ctx),
      ...ctx.artifacts.map((a): Artifact => ({ kind: a.kind, path: a.path, signing: ctx.signedAs ?? "none" })),
    ];
    const result: BuildResult = {
      platform: options.platform,
      profile,
      outDir: ctx.outDir,
      artifacts,
      warnings,
      durationMs: Math.round(performance.now() - started),
      ...(ctx.iosSigning ? { signing: ctx.iosSigning } : {}),
      ...(ctx.licenses ? { licenses: ctx.licenses } : {}),
    };
    return { ctx, artifact, result };
  } finally {
    if (outDirLocks.get(outDir) === mine) outDirLocks.delete(outDir);
  }
}

function describe(platform: TargetPlatform, path: string, ctx: BuildContext): Artifact {
  switch (platform) {
    case "web":
      return { kind: "web", path, signing: "none" };
    case "macos":
      return { kind: "app", path, signing: ctx.signedAs ?? "adhoc" };
    case "windows":
    case "linux":
      return { kind: "folder", path, signing: ctx.signedAs ?? "none" };
    case "ios":
      return ctx.ios?.device
        ? { kind: "app", path, signing: ctx.signedAs ?? "development", device: "device" }
        : { kind: "app", path, signing: "adhoc", device: "simulator" };
    case "android":
      return { kind: "apk", path, signing: ctx.signedAs ?? "debug" };
  }
}

/** Runs an API call with its own log sink (warnings collected) and abort signal; failures become AkanNativeError. */
export async function task<T>(
  options: { log?: LogSink; signal?: AbortSignal },
  fn: (warnings: string[]) => Promise<T>,
): Promise<T> {
  const warnings: string[] = [];
  const sink: LogSink = (event) => {
    if (event.level === "warn") warnings.push(event.message);
    options.log?.(event);
  };
  if (options.signal?.aborted) throw new AkanNativeError("CANCELLED", "cancelled before it started");
  try {
    return await withLogSink(sink, () => withSignal(options.signal, () => fn(warnings)));
  } catch (error) {
    throw toAkanNativeError(error, "INTERNAL");
  }
}

/** An error as an AkanNativeError: its own kind decides the code, else the phase it happened in. */
export function toAkanNativeError(error: unknown, phase: AkanNativeErrorCode): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  if (error instanceof CancelledError || (error as Error)?.name === "AbortError")
    return new AkanNativeError("CANCELLED", "cancelled", { cause: error });
  if (error instanceof ConfigError)
    return new AkanNativeError("CONFIG_INVALID", error.message, { problems: error.problems, cause: error });
  if (error instanceof ToolchainError)
    return new AkanNativeError("TOOLCHAIN_MISSING", error.message, { hint: "akan-native doctor", cause: error });
  if (error instanceof WebBuildError) return new AkanNativeError("WEB_BUILD_FAILED", error.message, { cause: error });
  if (error instanceof WebInputError) return new AkanNativeError("WEB_INPUT_INVALID", error.message, { cause: error });
  if (error instanceof SigningError)
    return new AkanNativeError("SIGNING_FAILED", error.message, {
      ...(error.problems.length ? { problems: error.problems } : {}),
      cause: error,
    });
  if (error instanceof ToolError)
    return new AkanNativeError(phase === "CONFIG_INVALID" ? "NATIVE_BUILD_FAILED" : phase, error.message, {
      logTail: error.tail,
      cause: error,
    });
  if (error instanceof CliError) return new AkanNativeError(phase, error.message, { cause: error });
  return new AkanNativeError("INTERNAL", (error as Error)?.message ?? String(error), { cause: error });
}
