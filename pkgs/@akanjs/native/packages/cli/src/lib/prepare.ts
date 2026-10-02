// Common build steps for every platform (docs/architecture.md §8, step 1).

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Platform } from "../../../core/src/index.ts";
import { aclWarnings, resolveAcl } from "./acl.ts";
import { buildCsp, hasCspMeta, injectCspMeta } from "./csp.ts";
import { ENV_TYPES_FILE, loadEnv, writeEnvTypes } from "./env.ts";
import { exec } from "./exec.ts";
import { findExternalScripts, injectEarlyErrors, injectInitScript } from "./html.ts";
import { CliError, dim, log } from "./log.ts";
import type { MacosBuild } from "./macossigning.ts";
import { buildNumberProblem, ConfigError, dependencyProblems, type Project } from "./project.ts";
import { type DesktopArch, hostArch } from "./updates.ts";
import type { WindowsSigning } from "./windowssigning.ts";

/**
 * debug: inspectable webview, dev signing, runtime env overrides, the dev server (akan-native run, dev,
 * test). release: none of that (akan-native build, update publish). Independent of `mode`, which only
 * picks the .env files, so a staging build is still a release build.
 */
export type BuildProfile = "debug" | "release";

/** The bundled page of a dev build without a built SPA (its pages come from the dev server). */
const DEV_SERVER_PAGE = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dev server</title></head>
<body style="font: 16px system-ui; padding: 24px"><p>This development build loads its pages from the dev server, which is not reachable. Start it, then reload.</p></body>
</html>
`;

export interface WindowsBuild {
  installer?: boolean;
  /** Authenticode for every PE file, the setup program and its uninstaller (lib/windowssigning.ts). */
  signing?: WindowsSigning;
}

export interface BuildOptions {
  mode: string;
  profile: BuildProfile;
  /** Skip `web.build` and use what is already in web.dir. */
  skipWebBuild: boolean;
  /**
   * `akan-native dev --hmr`: the dev gateway the native host fetches pages from instead of its bundled
   * files (lib/hmr.ts). Ignored by release builds, which never contain it.
   */
  devServer?: string;
  /** Default <app>/.akan/native/build/<platform>. */
  outDir?: string;
  /**
   * Dev builds: the path and query of the first page (akanjs readiness O4-5), e.g.
   * "/en/?csr=true&akanMobileTarget=default". Release builds always start at "/".
   */
  startPath?: string;
  /** false: no .env files (docs/api.md envFiles). Default true. */
  envFiles?: boolean;
  /** PUBLIC_ values above every other source (docs/api.md env). */
  env?: Record<string, string>;
  /**
   * Called through the programmatic API (docs/api.md): nothing is written into the app folder (no
   * akan-native-env.d.ts), and signing comes only from the options, never from AKAN_NATIVE_ANDROID_* or
   * AKAN_NATIVE_IOS_* variables.
   */
  api?: boolean;
  /** Android release output (akanjs readiness O1-5). */
  android?: AndroidRelease;
  /** iOS devices (akanjs readiness O1-2, O1-3). */
  ios?: IosBuild;
  /** Windows: an NSIS setup program next to the app folder (platforms/windows-installer.ts). */
  windows?: WindowsBuild;
  /** macOS: Developer ID signing, notarization and a dmg (lib/macossigning.ts). */
  macos?: MacosBuild;
  /** Linux: an AppImage beside the app folder (platforms/linux-appimage.ts). */
  linux?: LinuxBuild;
  /** Desktop builds: the CPU the app runs on, of the same OS; a macOS app is arm64 only. Default this computer's. */
  arch?: DesktopArch;
}

export interface LinuxBuild {
  appImage?: boolean;
}

/** Which identity and profile an iOS device build signs with; unset: found in the keychain and Xcode's profiles. */
export interface IosSigning {
  /** A certificate name ("Apple Development: …") or its SHA-1. Default: found (docs/api.md §3). */
  identity?: string;
  /** A .mobileprovision file. Default: the fitting local profile (docs/api.md §3). */
  provisioningProfile?: string;
  /** Only this team's profiles (when several teams have one for the app). */
  teamId?: string;
  /** Release builds: an App Store profile (default) or, only when asked for, an ad hoc one. */
  distribution?: "app-store" | "ad-hoc";
}

/** What an iPhone build was signed with (BuildResult.signing), for the caller to show. */
export interface IosSigningResult {
  identity: string;
  identitySha1: string;
  profile: string;
  profileUuid: string;
  teamId: string;
  kind: string;
  /** ISO date. */
  expires: string;
}

export interface IosBuild {
  /** An iPhone build (iphoneos, signed with a certificate and a profile) instead of the simulator's. Release builds also get an .ipa. */
  device?: boolean;
  signing?: IosSigning;
  /** The iPhone this build is installed on (run, dev): a development or ad hoc profile must list its UDID. */
  target?: { udid: string; name?: string };
}

/** An upload or release key in a keystore (JKS or PKCS12). The passwords never reach a command line. */
export interface AndroidSigning {
  keystore: string;
  alias: string;
  storePassword: string;
  /** Default the store password (PKCS12 keystores have one password). */
  keyPassword?: string;
}

export interface AndroidRelease {
  /** Release builds only; without it they are signed with ~/.akan/native/debug.keystore (with a warning). */
  signing?: AndroidSigning;
  /** Also build an App Bundle (.aab), signed with the same key. */
  bundle?: boolean;
}

/** The release key is missing or does not sign (AkanNativeError SIGNING_FAILED). */
/** Signing failed; `problems`: the candidates, or why each profile did not fit. */
export class SigningError extends CliError {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(problems.length ? `${message}\n  - ${problems.join("\n  - ")}` : message);
  }
}

export interface BuildContext {
  project: Project;
  platform: Platform;
  mode: string;
  profile: BuildProfile;
  /** profile === "debug" */
  dev: boolean;
  /** <app>/.akan/native/build/<platform> */
  outDir: string;
  /** Absolute web.dir */
  webDir: string;
  /** index.html with the init script injected */
  html: string;
  env: Record<string, string>;
  /** Dev builds only: see BuildOptions.devServer. The native builders write it to shell.json. */
  devServer?: string;
  /** Dev builds only: see BuildOptions.startPath. */
  startPath?: string;
  android?: AndroidRelease;
  ios?: IosBuild;
  windows?: WindowsBuild;
  macos?: MacosBuild;
  linux?: LinuxBuild;
  /** Desktop builds: see BuildOptions.arch, resolved. */
  arch?: DesktopArch;
  /** Artifacts besides the one the builder returns (an .aab next to the .apk, a Windows setup program). */
  artifacts: { kind: "aab" | "ipa" | "installer"; path: string }[];
  /** What the builder signed with, when it signs (Android: the app's release key or the debug key). */
  signedAs?: "adhoc" | "debug" | "development" | "distribution";
  /** Called through the API (BuildOptions.api). */
  api: boolean;
  /** Android builds with pinned libraries: the license notices file written next to the app (BuildResult.licenses). */
  licenses?: string;
  /** iPhone builds: the identity and profile they were signed with. */
  iosSigning?: IosSigningResult;
}

/** A dev start path: a path on the app's origin, not one of akan-native's (/__akan_native/*). */
export function checkStartPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /^\/__akan_native(\/|$|\?)/.test(path) || /\s/.test(path)) {
    throw new CliError(
      `the start path must be a path on the app's origin like "/en/?csr=true" (got ${JSON.stringify(path)})`,
    );
  }
  return path;
}

/** The app's own web build failed (AkanNativeError WEB_BUILD_FAILED). */
export class WebBuildError extends CliError {}
/** web.dir cannot be used as it is (AkanNativeError WEB_INPUT_INVALID). */
export class WebInputError extends CliError {}

export async function prepare(project: Project, platform: Platform, options: BuildOptions): Promise<BuildContext> {
  const { appDir, config } = project;
  const webDir = resolve(appDir, config.web.dir);
  const buildProblem = buildNumberProblem(config.app.build, platform);
  if (buildProblem) throw new ConfigError("the build number", [buildProblem]);
  const needs = dependencyProblems(project.plugins, platform);
  if (needs.length) throw new CliError(`plugin dependencies on ${platform}:\n  - ${needs.join("\n  - ")}`);
  const arch = desktopArch(platform, options.arch);

  if (config.web.build && !options.skipWebBuild) {
    log.step(`web build: ${config.web.build}`);
    // A shell command line, as package.json scripts are (npm runs them with cmd.exe /d /s /c on Windows).
    const shell =
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", config.web.build]
        : ["/bin/sh", "-c", config.web.build];
    const { code } = await exec(shell, {
      cwd: appDir,
      echo: false,
      inherit: true,
      tool: "web-build",
      env: { AKAN_NATIVE_PLATFORM: platform, AKAN_NATIVE_MODE: options.mode, AKAN_NATIVE_PROFILE: options.profile },
    });
    if (code !== 0) throw new WebBuildError(`web build failed with exit code ${code}`);
  }

  const outDir = options.outDir ? resolve(options.outDir) : join(appDir, ".akan", "native", "build", platform);
  const indexPath = join(webDir, "index.html");
  let pageDir = webDir;
  let source: string;
  if (existsSync(indexPath)) source = readFileSync(indexPath, "utf8");
  else if (options.devServer && options.profile === "debug") {
    // A dev build whose pages come from a dev server (akanjs's, or Bun's with --hmr) needs no built
    // SPA: the bundled page only shows while the dev server cannot be reached. Beside outDir, not in it:
    // the desktop builders empty outDir before they copy the page into the app.
    pageDir = `${outDir}.dev-web`;
    rmSync(pageDir, { recursive: true, force: true });
    mkdirSync(pageDir, { recursive: true });
    source = DEV_SERVER_PAGE;
    log.info(dim(`web: no ${config.web.dir}/index.html; pages come from the dev server`));
  } else throw new WebInputError(`${relative(process.cwd(), indexPath)} not found (web.dir = ${config.web.dir})`);
  if (existsSync(join(webDir, "__akan_native")))
    throw new WebInputError(`${config.web.dir}/__akan_native is reserved for akan-native`);

  const external = findExternalScripts(source);
  if (external.length) {
    log.warn(`index.html loads external scripts (the single-file rule expects inlined JS): ${external.join(", ")}`);
  }
  let html = injectInitScript(source, platform === "web" ? config.web.base : "/");
  if (options.profile === "debug" && platform !== "web") html = injectEarlyErrors(html);
  const csp = config.security?.csp;
  if (csp !== undefined) {
    // SEC-4: hash the final document's inline scripts and styles into the policy.
    const built = buildCsp(csp, html);
    html = injectCspMeta(html, built.policy);
    for (const warning of built.warnings) log.warn(warning);
    log.info(
      dim(
        `csp: ${csp === "strict" ? "strict" : "custom"} policy, ${built.scripts} inline script / ${built.styles} style hashes`,
      ),
    );
  } else if (options.profile === "release" && !hasCspMeta(html)) {
    log.info(dim('csp: none (set security.csp, e.g. "strict", to add a Content-Security-Policy)'));
  }

  if (options.profile === "release" && config.updates && !secureUpdateUrl(config.updates.url)) {
    // Signatures keep a release intact, but plain http lets anyone on the path withhold updates
    // or feed an oversized manifest; iOS and Android refuse it in release builds anyway.
    throw new CliError(
      `updates.url must be https in a release build (http only for this machine): ${config.updates.url}`,
    );
  }
  for (const warning of aclWarnings(resolveAcl(config.capabilities, project.plugins, platform), project.plugins))
    log.warn(warning);
  if (options.profile === "release" && config.capabilities === undefined && project.plugins.length) {
    // PL-11: defaults are conservative (filesystem: the app's folders; http: no URL), not least-privilege.
    log.warn(
      "no capabilities in akan-native.config: every plugin runs with its default permissions; list the permissions the app uses",
    );
  }

  const envResult = loadEnv(appDir, options.mode, platform, config.env, {
    files: options.envFiles ?? true,
    overrides: options.env ?? {},
  });
  if (envResult.dropped.length) {
    log.warn(`env keys without the PUBLIC_ prefix are not passed to the app: ${envResult.dropped.join(", ")}`);
  }
  log.info(
    dim(
      `env: ${Object.keys(envResult.env).length} keys from ${["akan-native.config", ...envResult.files].join(" < ")} (mode ${options.mode}, ${options.profile} build)`,
    ),
  );
  if (!options.api && writeEnvTypes(appDir, config.env)) log.info(dim(`env types: wrote ${ENV_TYPES_FILE}`));

  return {
    project,
    platform,
    mode: options.mode,
    profile: options.profile,
    dev: options.profile === "debug",
    outDir,
    webDir: pageDir,
    api: options.api ?? false,
    html,
    env: envResult.env,
    ...(options.profile === "debug" && options.devServer ? { devServer: options.devServer } : {}),
    ...(options.profile === "debug" && options.startPath ? { startPath: checkStartPath(options.startPath) } : {}),
    ...(options.android ? { android: options.android } : {}),
    ...(options.ios ? { ios: options.ios } : {}),
    ...(options.windows ? { windows: options.windows } : {}),
    ...(options.macos ? { macos: options.macos } : {}),
    ...(options.linux ? { linux: options.linux } : {}),
    ...(arch ? { arch } : {}),
    artifacts: [],
  };
}

/** The arch a build makes: the one asked for, checked against the platform, else this computer's for a desktop. */
export function desktopArch(platform: Platform, arch: DesktopArch | undefined): DesktopArch | undefined {
  const desktop = platform === "macos" || platform === "windows" || platform === "linux";
  if (arch !== undefined && !desktop) throw new CliError(`a CPU is chosen for a desktop build, not for ${platform}`);
  if (arch !== undefined && arch !== "arm64" && arch !== "x64")
    throw new CliError(`the arch is arm64 or x64 (got ${JSON.stringify(arch)})`);
  if (platform === "macos" && arch === "x64") throw new CliError("a macOS app is built for Apple silicon (arm64) only");
  return arch ?? (desktop ? hostArch() : undefined);
}

/** https, or http to this machine (a local test server, `akan-native update serve`). */
export function secureUpdateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        (u.hostname === "localhost" || u.hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(u.hostname)))
    );
  } catch {
    return false;
  }
}
