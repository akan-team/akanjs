// akan-native build android: an APK built with the SDK tools only, no Gradle (docs/research/android.md §2.3):
//   aapt2 compile (theme, colors, launcher icon) + aapt2 link → kotlinc → d8 (dev, with a cached kotlin-stdlib dex) or R8 (release)
//   → Bun APK assembler (dex + assets, 4-byte alignment) → apksigner (v3, ~/.akan/native/debug.keystore)

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { assembleApk, assembleBundleModule, fileEntry, writeZip } from "../lib/apk.ts";
import { closureFor, type Library, licenseNotices, loadMavenLock, mavenCache, prepareLibraries } from "../lib/maven.ts";
import {
  androidSdkRoot,
  type Jdk,
  javaEnv,
  type KotlinToolchain,
  resolveBuildTools,
  resolveBundletool,
  resolveJdk,
  resolveKotlin,
  TOOLCHAIN,
} from "../lib/toolchains.ts";

/** The license notices of an Android build with pinned Maven libraries, in the web root. */
export const LICENSES_FILE = "akan-native-licenses.json";

import { apiVersionsFor, checkApiLevels, formatApiProblems, loadApiVersions } from "../lib/apilevel.ts";
import type { ParsedArgs } from "../lib/args.ts";
import { makeNativeBoot } from "../lib/boot.ts";
import { type ExecResult, exec, execOrThrow } from "../lib/exec.ts";
import { googleServicesXml } from "../lib/googleservices.ts";
import { writeAndroidRes } from "../lib/icons.ts";
import {
  type Device,
  envFromProcess,
  follow,
  type Launched,
  type LaunchOptions,
  pipeLines,
  printLine,
} from "../lib/launch.ts";
import { CliError, dim, log, ToolchainError } from "../lib/log.ts";
import { mergeLibraryManifests } from "../lib/manifestmerge.ts";
import { androidNameProblems } from "../lib/names.ts";
import {
  androidPermissions,
  androidPlugins,
  kotlinFeatures,
  kotlinRegistry,
  type NativePlugin,
  pluginMinSdk,
  writePluginBindings,
} from "../lib/native-plugins.ts";
import { androidFeaturesFor, androidPermissionsFor } from "../lib/permissions.ts";
import { type AndroidSigning, type BuildContext, SigningError } from "../lib/prepare.ts";
import type { AndroidManifest, ResolvedConfig } from "../lib/project.ts";
import { PACKAGE_ROOT } from "../lib/root.ts";
import { updatesResource } from "../lib/updates.ts";
import { kotlinVectorData } from "../lib/vectors.ts";

const SHELL_SRC = join(PACKAGE_ROOT, "native", "android", "src");
/** Android 10. Newer framework APIs live in ApiN classes behind SDK_INT checks (lib/apilevel.ts). */
export const MIN_SDK = 29;
/** Chromium major: akan-native's runtime (Object.hasOwn 93) and unlowered ES2022 class static blocks (94). */
export const MIN_WEBVIEW = 94;
const TARGET_SDK = TOOLCHAIN.android.compileSdk;
const ACTIVITY = "com.akanjs.runtime.AkanNativeActivity";

interface AndroidTools {
  sdk: string;
  androidJar: string;
  aapt2: string;
  d8: string;
  d8Jar: string;
  apksigner: string;
  adb: string;
  emulator: string;
}

let buildToolsWarned = false;

/** SDK tools, pinned build-tools first (CLI-10). No JDK or Kotlin needed: see javaToolchain(). */
export function androidTools(): AndroidTools {
  const sdk = androidSdkRoot();
  if (!sdk) throw new ToolchainError("Android SDK not found (set ANDROID_HOME). Run `akan-native doctor android`.");
  const bt = resolveBuildTools(sdk);
  if (!bt)
    throw new ToolchainError(
      `Android build-tools ${TOOLCHAIN.android.buildTools} not found. Run \`akan-native doctor android\`.`,
    );
  if (bt.warning && !buildToolsWarned) {
    log.warn(bt.warning);
    buildToolsWarned = true;
  }
  const androidJar = join(sdk, "platforms", `android-${TARGET_SDK}`, "android.jar");
  if (!existsSync(androidJar))
    throw new ToolchainError(`${androidJar} missing: sdkmanager "platforms;android-${TARGET_SDK}"`);
  return {
    sdk,
    androidJar,
    aapt2: join(bt.dir, "aapt2"),
    d8: join(bt.dir, "d8"),
    d8Jar: join(bt.dir, "lib", "d8.jar"),
    apksigner: join(bt.dir, "apksigner"),
    adb: join(sdk, "platform-tools", "adb"),
    emulator: join(sdk, "emulator", "emulator"),
  };
}

interface JavaToolchain {
  jdk: Jdk;
  kotlin: KotlinToolchain;
  /** JAVA_HOME + PATH for kotlinc, d8, R8, apksigner and keytool: one JDK for every Java tool. */
  env: Record<string, string>;
}

/** The JDK and the pinned kotlinc (installed on first use, CLI-10). */
async function javaToolchain(): Promise<JavaToolchain> {
  const jdk = resolveJdk();
  if (!jdk) {
    throw new ToolchainError(
      `no JDK ${TOOLCHAIN.jdk.minMajor}+ found (JAVA_HOME, Android Studio, java_home, PATH). ` +
        "Install Android Studio, or run `akan-native toolchain install jdk`, or set JAVA_HOME.",
    );
  }
  const env = javaEnv(jdk);
  const kotlin = await resolveKotlin({ javaEnv: env });
  if (kotlin.warning) log.warn(kotlin.warning);
  log.info(dim(`kotlinc ${kotlin.version} (${kotlin.source}), JDK ${jdk.version} (${jdk.source})`));
  return { jdk, kotlin, env };
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every config change the activity handles itself; recreating it would reload the WebView.
const CONFIG_CHANGES =
  "orientation|screenSize|screenLayout|smallestScreenSize|density|keyboard|keyboardHidden|navigation|uiMode|locale|layoutDirection|fontScale|fontWeightAdjustment|colorMode|touchscreen|mcc|mnc|grammaticalGender";

/**
 * The applicationId: app.id, plus android.debugAppIdSuffix in debug builds so they install next to
 * the release app (and match, say, a server's assetlinks entry for "<id>.debug").
 */
export function androidAppId(ctx: BuildContext): string {
  const { app, android } = ctx.project.config;
  return app.id + (ctx.dev ? (android?.debugAppIdSuffix ?? "") : "");
}

export function androidManifest(
  ctx: BuildContext,
  permissions: string[],
  applicationXml: string[],
  manifestXml: string[] = [],
  icon = false,
  activityXml: string[] = [],
  applicationAttrs: [string, string][] = [],
): string {
  const { config } = ctx.project;
  const { app } = config;
  const appId = androidAppId(ctx);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by akan-native build. Do not edit. -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${appId}"
    android:versionCode="${app.build}"
    android:versionName="${xml(app.version)}">

    <uses-sdk android:minSdkVersion="${MIN_SDK}" android:targetSdkVersion="${TARGET_SDK}" />
    <uses-permission android:name="android.permission.INTERNET" />
${permissions.map((p) => `    <uses-permission android:name="${xml(p)}" />`).join("\n")}
${manifestXml.map((x) => `    ${x.replaceAll("${applicationId}", appId)}`).join("\n")}

    <application
        android:name="com.akanjs.runtime.AkanNativeApplication"
        android:label="${xml(app.name)}"
${icon ? `        android:icon="@mipmap/ic_launcher"\n` : ""}${ctx.dev ? `        android:networkSecurityConfig="@xml/akan_native_network_security"\n` : ""}        android:theme="@style/AkanNativeTheme"
        android:allowBackup="false"
        android:supportsRtl="true"
${applicationAttrs.map(([n, v]) => `        ${n}="${xml(v)}"\n`).join("")}        android:enableOnBackInvokedCallback="true">

        <activity
            android:name="${ACTIVITY}"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="${CONFIG_CHANGES}">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
${config.deepLinks.schemes
  .map(
    (scheme) => `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${xml(scheme)}" />
            </intent-filter>`,
  )
  .join("\n")}
${config.deepLinks.domains
  .map(
    ({
      host,
      pathPrefixes,
    }) => `            <!-- App link (O5-2): verified against https://${xml(host)}/.well-known/assetlinks.json -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" />
                <data android:host="${xml(host)}" />
${pathPrefixes.map((prefix) => `                <data android:pathPrefix="${xml(prefix)}" />\n`).join("")}            </intent-filter>`,
  )
  .join("\n")}
${activityXml.map((x) => `            ${x.replaceAll("${applicationId}", appId)}`).join("\n")}
        </activity>

        <!-- Framework-only replacement for androidx FileProvider (camera EXTRA_OUTPUT, plugins.md C4) -->
        <provider
            android:name="com.akanjs.runtime.AkanNativeFileProvider"
            android:authorities="${appId}.akan-native.files"
            android:exported="false"
            android:grantUriPermissions="true" />
${applicationXml.map((x) => `        ${x.replaceAll("${applicationId}", appId)}`).join("\n")}
    </application>
</manifest>
`;
}

const PROGUARD = `# Generated by akan-native build.
# The R8 command line does not read the manifest: keep its entry points explicitly.
-keep class com.akanjs.runtime.AkanNativeActivity { *; }
-keep class com.akanjs.runtime.AkanNativeApplication { *; }
-keep class com.akanjs.runtime.AkanNativeFileProvider { *; }
-keepattributes *Annotation*,SourceFile,LineNumberTable
-dontobfuscate
# kotlin-stdlib is compiled against the compile-only annotations-13.0.jar
-dontwarn org.jetbrains.annotations.**
`;

function sha(parts: (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

/** Files of a folder tree with their content, for fingerprints. */
function treeParts(dir: string, prefix = ""): (string | Uint8Array)[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory()
        ? treeParts(path, `${prefix}${name}/`)
        : [`${prefix}${name}`, readFileSync(path)];
    });
}

function kotlinSources(dir: string): string[] {
  return [...new Bun.Glob("**/*.kt").scanSync({ cwd: dir, absolute: true })].sort();
}

/** kotlin-stdlib dexed once per Kotlin version (dev builds put it in classes2.dex). */
async function stdlibDex(tools: AndroidTools, java: JavaToolchain): Promise<Uint8Array> {
  const stdlib = java.kotlin.stdlib;
  const key = sha([stdlib, String(statSync(stdlib).size), String(MIN_SDK)]).slice(0, 16);
  const dir = join(homedir(), ".akan", "native", "cache", `kotlin-stdlib-dex-${key}`);
  const dex = join(dir, "classes.dex");
  if (!existsSync(dex)) {
    log.step("dex: kotlin-stdlib (once per Kotlin version)");
    mkdirSync(dir, { recursive: true });
    await execOrThrow(
      [tools.d8, "--debug", "--min-api", String(MIN_SDK), "--lib", tools.androidJar, "--output", dir, stdlib],
      { env: java.env },
    );
  }
  return new Uint8Array(readFileSync(dex));
}

async function debugKeystore(java: JavaToolchain): Promise<string> {
  const path = join(homedir(), ".akan", "native", "debug.keystore");
  if (!existsSync(path)) {
    log.step("sign: creating ~/.akan/native/debug.keystore");
    mkdirSync(join(homedir(), ".akan", "native"), { recursive: true });
    // JDK keytool defaults to PKCS12, where store and key passwords must match.
    await execOrThrow(
      [
        join(java.jdk.home, "bin", "keytool"),
        "-genkeypair",
        "-keystore",
        path,
        "-storepass",
        "android",
        "-keypass",
        "android",
        "-alias",
        "androiddebugkey",
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-dname",
        "CN=Android Debug,O=Android,C=US",
        "-noprompt",
      ],
      { echo: false, env: java.env },
    );
  }
  return path;
}

export async function buildAndroid(ctx: BuildContext): Promise<string> {
  const tools = androidTools();
  const java = await javaToolchain();
  const stdlib = java.kotlin.stdlib;
  const { project, outDir } = ctx;
  const { config } = project;
  const release = !ctx.dev;
  const plugins = androidPlugins(project.plugins);
  // O8: the pinned Maven closure of the plugins that ask for one (push's FCM module, iap's Billing).
  const libraries = await mavenLibraries(plugins);
  const libraryManifest = libraries.length
    ? mergeLibraryManifests(
        libraries
          .filter((l) => l.manifest)
          .map((l) => ({ from: l.coordinate, xml: readFileSync(l.manifest!, "utf8") })),
        androidAppId(ctx),
      )
    : null;

  const gen = join(outDir, "gen");
  const obj = join(outDir, "obj");
  const assets = join(outDir, "assets");
  // Every Kotlin file under gen/kotlin is compiled: a file an earlier build wrote elsewhere must not stay.
  rmSync(join(gen, "kotlin"), { recursive: true, force: true });
  mkdirSync(join(gen, "kotlin", "com", "akanjs", "generated"), { recursive: true });
  mkdirSync(obj, { recursive: true });

  // 1. generated sources and resources (theme with the splash colors, launcher icon: CLI-8, SH-6)
  const res = join(gen, "res");
  rmSync(res, { recursive: true, force: true });
  const { icon } = writeAndroidRes(res, config);
  if (ctx.dev) {
    // Dev builds may use plain http to the Mac (akan-native update serve, local APIs): only these hosts.
    // Android blocks cleartext by default; release builds keep that.
    mkdirSync(join(res, "xml"), { recursive: true });
    writeFileSync(
      join(res, "xml", "akan_native_network_security.xml"),
      `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`,
    );
  }
  // O6-2: the Firebase project's values, for the push plugin's FCM module.
  if (config.android?.googleServices) {
    mkdirSync(join(res, "values"), { recursive: true });
    writeFileSync(
      join(res, "values", "google_services.xml"),
      googleServicesXml(
        readFileSync(resolve(project.appDir, config.android.googleServices), "utf8"),
        androidAppId(ctx),
        config.app.id,
      ),
    );
  } else if (plugins.some(({ plugin }) => plugin.manifest.id === "push")) {
    log.warn(
      "the push plugin needs android.googleServices (the Firebase project's google-services.json); register() fails without it",
    );
  }
  // N13: the push plugin's channel, status bar icon and color, as Firebase reads them from the manifest.
  const pushXml = plugins.some(({ plugin }) => plugin.manifest.id === "push")
    ? pushResources(res, config, project.appDir)
    : [];
  if (!pushXml.length && config.push?.android && !plugins.some(({ plugin }) => plugin.manifest.id === "push"))
    log.warn("push.android is set, but the push plugin is not in plugins");
  // O5-3: the app's resource files (android/res/<type>/<name>).
  for (const r of config.native?.resources ?? []) {
    if (!r.to.startsWith("android/res/")) continue;
    const target = join(res, r.to.slice("android/res/".length));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(project.appDir, r.from), target);
  }
  // Plugins' XML first, then the app's own (native.android, O5-1): the app's comes last.
  const appNative = config.native?.android ?? {};
  const applicationXml = [
    ...plugins.flatMap(({ native }) => (native.applicationXml ? [native.applicationXml] : [])),
    ...pushXml,
    ...(appNative.application ?? []),
  ];
  const manifestXml = [
    ...plugins.flatMap(({ native }) => (native.manifestXml ? [native.manifestXml] : [])),
    ...androidFeaturesFor(config.permissions),
    ...(appNative.manifest ?? []),
  ];
  const permissions = androidPermissions(plugins, androidPermissionsFor(config.permissions)); // app-level C8 too
  // The libraries' manifests merged (O8): their permissions, <queries> and components.
  const allPermissions = [...new Set([...permissions, ...(libraryManifest?.permissions ?? [])])].filter(
    (p) => p !== "android.permission.INTERNET",
  );
  writeFileSync(
    join(gen, "AndroidManifest.xml"),
    androidManifest(
      ctx,
      allPermissions,
      [...applicationXml, ...(libraryManifest?.applicationXml ?? [])],
      [...manifestXml, ...(libraryManifest?.manifestXml ?? [])],
      icon,
      appNative.activity ?? [],
      libraryManifest?.applicationAttrs ?? [],
    ),
  );
  writeFileSync(
    join(gen, "kotlin", "com", "akanjs", "generated", "AkanNativeGeneratedPlugins.kt"),
    kotlinRegistry(plugins, MIN_SDK, TOOLCHAIN.android.compileSdk),
  );
  // Debug builds carry the shared vectors for the self-test ($host.vectors); release builds none.
  mkdirSync(join(gen, "kotlin", "com", "akanjs", "runtime"), { recursive: true });
  writeFileSync(join(gen, "kotlin", "com", "akanjs", "runtime", "AkanNativeVectorData.kt"), kotlinVectorData(ctx.dev));
  writeFileSync(
    join(gen, "kotlin", "com", "akanjs", "runtime", "AkanNativeFeatures.kt"),
    kotlinFeatures({
      dev: ctx.dev,
      updates: config.updates !== null || plugins.some((p) => p.plugin.manifest.id === "updates"),
    }),
  );
  const bindings = writePluginBindings(plugins, "android", join(gen, "spec"), project.appDir);
  const clashes = androidNameProblems({
    plugins: plugins.map((p) => ({
      id: p.plugin.manifest.id,
      className: p.native.class,
      sources: p.sources.filter((s) => s.endsWith(".kt")),
    })),
    generated: bindings.filter((s) => s.endsWith(".kt")),
  });
  if (clashes.length) throw new CliError(`names clash in the Android app:\n  - ${clashes.join("\n  - ")}`);
  // R8 does not read the manifest: keep every component class a plugin declares there
  // (a receiver without its constructor crashes release builds: "Unable to instantiate receiver").
  const components = [...applicationXml.join("\n").matchAll(/android:name="([A-Za-z_][\w.$]*)"/g)]
    .map((m) => m[1]!)
    .filter((name) => name.includes(".") && !name.startsWith("android.")); // not intent actions or permissions
  const services = mergedServices(libraries);
  const keep = [...new Set([...components, ...(libraryManifest?.components ?? [])])].map(
    (name) => `-keep class ${name} { <init>(...); *; }`,
  );
  // ServiceLoader implementations of the libraries (kotlinx-coroutines' main dispatcher) are found by name.
  const serviceKeeps = [...services.values()].flat().map((impl) => `-keep class ${impl} { <init>(); }`);
  const extra = plugins.flatMap(({ native }) => native.proguard ?? []);
  writeFileSync(
    join(gen, "proguard.pro"),
    [PROGUARD, ...keep, ...serviceKeeps, ...extra, ...(libraries.length ? [MAVEN_PROGUARD] : []), ""].join("\n"),
  );

  // 2. assets: the web app plus boot data (outside assets/app, so not reachable by URL)
  rmSync(assets, { recursive: true, force: true });
  cpSync(ctx.webDir, join(assets, "app"), { recursive: true });
  writeFileSync(join(assets, "app", "index.html"), ctx.html);
  // The pinned libraries' licenses and notices, served at /akan-native-licenses.json for the app's
  // open-source licenses screen (and next to the APK for the release notes).
  if (libraries.length) {
    if (existsSync(join(ctx.webDir, LICENSES_FILE)))
      throw new CliError(
        `${LICENSES_FILE} in web.dir is reserved: akan-native writes the Android build's license notices there`,
      );
    const notices = `${JSON.stringify(licenseNotices(libraries), null, 1)}\n`;
    writeFileSync(join(assets, "app", LICENSES_FILE), notices);
    writeFileSync(join(outDir, LICENSES_FILE), notices);
    ctx.licenses = join(outDir, LICENSES_FILE);
  }
  for (const r of config.native?.resources ?? []) {
    if (!r.to.startsWith("android/assets/")) continue; // never app/ or akan-native/ (project.ts checks)
    const target = join(assets, r.to.slice("android/assets/".length));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(project.appDir, r.from), target, { recursive: true });
  }
  mkdirSync(join(assets, "akan-native"), { recursive: true });
  const boot = makeNativeBoot(ctx, "android");
  writeFileSync(join(assets, "akan-native", "boot.json"), JSON.stringify(boot));
  if (config.updates)
    writeFileSync(
      join(assets, "akan-native", "updates.json"),
      updatesResource(config.updates, config.app, "android", boot.nativeApi, ctx.dev),
    );
  writeFileSync(join(assets, "akan-native", "env.runtime.json"), JSON.stringify(ctx.env, null, 2));
  writeFileSync(
    join(assets, "akan-native", "shell.json"),
    JSON.stringify({
      backgroundColor: config.shell.backgroundColor,
      backgroundColorDark: config.shell.backgroundColorDark,
      devtools: ctx.dev,
      splash: { autoHide: config.splash.autoHide, timeout: config.splash.timeout },
      // L0: schemes the app adds to what links and the opener may hand to the OS.
      externalSchemes: config.security?.shell?.externalSchemes ?? [],
      minWebViewVersion: config.android?.minWebViewVersion ?? MIN_WEBVIEW,
      autoplay: config.android?.autoplay === true,
      // Before the page runs (O6-1): the keyboard mode keyboard.setResizeMode() changes later.
      keyboardResize: config.keyboard?.resize ?? "resize",
      // akan-native dev --hmr: pages come from the dev gateway (lib/hmr.ts). Never in release builds.
      ...(ctx.dev && ctx.devServer ? { devServer: ctx.devServer } : {}),
      ...(ctx.dev && ctx.startPath ? { startPath: ctx.startPath } : {}),
    }),
  );

  // 3. aapt2 compile (skipped when res/ is unchanged) + link. With pinned libraries (O8) their res/ is
  // linked as overlays into the app's package, and R classes are generated for their packages: library
  // code reads R fields, and Firebase looks its strings up by name in the app's package.
  const compiled = join(obj, "res.zip");
  const resFingerprint = sha([tools.aapt2, ...treeParts(res)]);
  const resStamp = join(obj, "res.sha256");
  if (!existsSync(compiled) || !existsSync(resStamp) || readFileSync(resStamp, "utf8") !== resFingerprint) {
    log.step("aapt2 compile: theme and icon");
    rmSync(compiled, { force: true });
    await execOrThrow([tools.aapt2, "compile", "--dir", res, "-o", compiled], { echo: false });
    writeFileSync(resStamp, resFingerprint);
  }
  const overlays: string[] = [];
  for (const lib of libraries) {
    const flat = await compiledLibraryRes(tools.aapt2, lib);
    if (flat) overlays.push("-R", flat);
  }
  const libraryPackages = [...new Set(libraries.filter((l) => l.hasResources && l.package).map((l) => l.package!))];
  const linkArgs = [
    "--manifest",
    join(gen, "AndroidManifest.xml"),
    "-I",
    tools.androidJar,
    compiled,
    ...overlays,
    ...(overlays.length ? ["--auto-add-overlay"] : []),
    "--min-sdk-version",
    String(MIN_SDK),
    "--target-sdk-version",
    String(TARGET_SDK),
    "--version-code",
    String(config.app.build),
    "--version-name",
    config.app.version,
    ...(release ? [] : ["--debug-mode"]),
  ];
  const base = join(obj, "base.apk");
  const rJava = join(obj, "r-java");
  rmSync(rJava, { recursive: true, force: true });
  // aapt2 --proguard: keep rules for every class the merged manifest names (components, and the
  // libraries' appComponentFactory, which nothing else references), for R8.
  const manifestKeeps = join(obj, "manifest-keep.pro");
  await execOrThrow(
    [
      tools.aapt2,
      "link",
      "-o",
      base,
      ...linkArgs,
      "--proguard",
      manifestKeeps,
      ...(libraryPackages.length ? ["--java", rJava, "--extra-packages", libraryPackages.join(":")] : []),
    ],
    { echo: false },
  );
  const rJar = libraryPackages.length
    ? await compileRClasses(java, rJava, join(obj, "r-classes"), join(obj, "r.jar"))
    : null;

  // 4. Kotlin → dex, skipped when no source changed (HTML/env-only rebuilds take about a second)
  const sources = [
    ...kotlinSources(SHELL_SRC),
    ...plugins.flatMap((p) => p.sources),
    ...kotlinSources(join(gen, "kotlin")),
    ...bindings,
  ];
  const libraryJars = libraries.map((l) => l.classes);
  const fingerprint = sha([
    release ? "release" : "debug",
    java.kotlin.version,
    java.kotlin.home,
    java.jdk.home,
    tools.androidJar,
    ...libraryJars,
    // Release: R8 takes the R classes and the manifest's keep rules too.
    ...(release && rJar ? [readFileSync(rJar)] : []),
    ...(release ? [readFileSync(manifestKeeps)] : []),
    ...sources.flatMap((s) => [s, readFileSync(s)]),
  ]);
  const stamp = join(obj, "kotlin.sha256");
  const classesDex = join(obj, "dex", "classes.dex");
  if (!existsSync(stamp) || readFileSync(stamp, "utf8") !== fingerprint || !existsSync(classesDex)) {
    log.step(`kotlinc: ${sources.length} files`);
    rmSync(join(obj, "dex"), { recursive: true, force: true });
    mkdirSync(join(obj, "dex"), { recursive: true });
    const jar = join(obj, "classes.jar");
    await execOrThrow(
      [
        java.kotlin.kotlinc,
        ...sources,
        "-d",
        jar,
        "-classpath",
        [tools.androidJar, stdlib, ...libraryJars].join(":"),
        // -no-jdk: compile against android.jar's java.* instead of the JRE kotlinc runs on.
        "-jvm-target",
        "17",
        "-no-jdk",
        "-no-stdlib",
        "-no-reflect",
        ...(release ? ["-Xno-param-assertions", "-Xno-call-assertions", "-Xno-receiver-assertions"] : []),
      ],
      { echo: false, env: java.env },
    );
    checkApis(jar, plugins, tools.androidJar);
    if (release) {
      log.step("dex: R8 (shrinks kotlin-stdlib)");
      await execOrThrow(
        [
          java.jdk.java,
          "-cp",
          tools.d8Jar,
          "com.android.tools.r8.R8",
          "--release",
          "--min-api",
          String(MIN_SDK),
          "--lib",
          tools.androidJar,
          "--pg-conf",
          join(gen, "proguard.pro"),
          "--pg-conf",
          manifestKeeps,
          "--pg-map-output",
          join(obj, "mapping.txt"),
          // The libraries' consumer rules (jar-embedded META-INF rules R8 finds itself).
          ...libraries.flatMap((l) => (l.proguard ? ["--pg-conf", l.proguard] : [])),
          "--output",
          join(obj, "dex"),
          jar,
          stdlib,
          ...libraryJars,
          ...(rJar ? [rJar] : []),
        ],
        { echo: false, env: java.env },
      );
    } else {
      log.step("dex: d8 (app classes)");
      await execOrThrow(
        [
          tools.d8,
          "--debug",
          "--min-api",
          String(MIN_SDK),
          "--lib",
          tools.androidJar,
          ...[stdlib, ...libraryJars].flatMap((cp) => ["--classpath", cp]),
          "--output",
          join(obj, "dex"),
          jar,
        ],
        { echo: false, env: java.env },
      );
    }
    writeFileSync(stamp, fingerprint);
  } else {
    log.info(dim("kotlin: unchanged, reusing dex"));
  }

  // 5. assemble + sign. R8 or d8 may write several dex files (classes.dex, classes2.dex, …).
  const dexFiles = readdirSync(join(obj, "dex"))
    .filter((f) => /^classes\d*\.dex$/.test(f))
    .sort((a, b) => dexIndex(a) - dexIndex(b));
  const dex: Uint8Array[] = dexFiles.map((f) => new Uint8Array(readFileSync(join(obj, "dex", f))));
  if (!release) {
    dex.push(await stdlibDex(tools, java));
    // Debug (O8): the libraries dexed once per closure, the R classes per build.
    if (libraries.length) dex.push(...(await libraryDex(tools, java, libraryJars)));
    if (rJar) dex.push(...(await dexFilesOf(tools, java, rJar, join(obj, "r-dex"))));
  }
  // Native libraries and ServiceLoader files of the pinned libraries (O8).
  const packaged = [
    ...[...services].map(([name, impls]) => ({
      name: `META-INF/services/${name}`,
      bytes: new TextEncoder().encode(`${impls.join("\n")}\n`),
    })),
    ...libraries.flatMap((l) =>
      l.nativeLibs.map((n) => ({ name: `lib/${n.abi}/${n.name}`, bytes: new Uint8Array(readFileSync(n.path)) })),
    ),
  ];
  const key = await signingKey(ctx, java);
  const unsigned = join(obj, "unsigned.apk");
  writeFileSync(
    unsigned,
    assembleApk({ base: new Uint8Array(readFileSync(base)), dex, assetsDir: assets, extra: packaged }),
  );
  const apk = join(outDir, `${basename(config.app.id)}${release ? "" : "-debug"}.apk`);
  try {
    await execOrThrow(
      [
        tools.apksigner,
        "sign",
        "--ks",
        key.keystore,
        "--ks-key-alias",
        key.alias,
        "--ks-pass",
        "env:AKAN_NATIVE_KS_PASS",
        "--key-pass",
        "env:AKAN_NATIVE_KEY_PASS",
        "--v1-signing-enabled",
        "false",
        "--out",
        apk,
        unsigned,
      ],
      { echo: false, env: { ...java.env, ...key.env } },
    );
  } catch (error) {
    if (key.release)
      throw new SigningError(
        `signing with ${key.keystore} (alias ${key.alias}) failed: ${(error as Error).message.split("\n").slice(1).join(" ").trim()}`,
      );
    throw error;
  }
  log.info(
    dim(
      `size ${(statSync(apk).size / 1024).toFixed(0)} KiB${key.release ? `, signed with ${basename(key.keystore)} (${key.alias})` : ""}`,
    ),
  );
  ctx.signedAs = key.release ? "distribution" : "debug";

  // 6. App Bundle (O1-5): the same resources in proto format, the same dex and assets, then bundletool
  // and jarsigner (a bundle is signed like a jar; Play re-signs the APKs it serves).
  if (ctx.android?.bundle) {
    const proto = join(obj, "base-proto.zip");
    await execOrThrow([tools.aapt2, "link", "--proto-format", "-o", proto, ...linkArgs], { echo: false });
    const module = join(obj, "base-module.zip");
    writeFileSync(
      module,
      assembleBundleModule({ base: new Uint8Array(readFileSync(proto)), dex, assetsDir: assets, extra: packaged }),
    );
    const aab = join(outDir, `${basename(config.app.id)}${release ? "" : "-debug"}.aab`);
    log.step("bundle: bundletool build-bundle");
    await execOrThrow(
      [
        java.jdk.java,
        "-jar",
        await resolveBundletool(),
        "build-bundle",
        `--modules=${module}`,
        `--output=${aab}`,
        "--overwrite",
      ],
      { echo: false, env: java.env },
    );
    try {
      await execOrThrow(
        [
          join(java.jdk.home, "bin", "jarsigner"),
          "-keystore",
          key.keystore,
          "-storepass:env",
          "AKAN_NATIVE_KS_PASS",
          "-keypass:env",
          "AKAN_NATIVE_KEY_PASS",
          aab,
          key.alias,
        ],
        {
          echo: false,
          env: { ...java.env, ...key.env },
        },
      );
    } catch (error) {
      if (key.release)
        throw new SigningError(
          `signing the bundle with ${key.keystore} (alias ${key.alias}) failed: ${(error as Error).message.split("\n").slice(1).join(" ").trim()}`,
        );
      throw error;
    }
    log.info(dim(`bundle ${(statSync(aab).size / 1024).toFixed(0)} KiB: ${basename(aab)}`));
    ctx.artifacts.push({ kind: "aab", path: aab });
  }
  return apk;
}

// ------------------------------------------------------------------ pinned Maven libraries (O8)

/** Rules for code the pinned libraries reference but do not ship (optional dependencies Gradle apps also leave out). */
const MAVEN_PROGUARD = `# Pinned Maven libraries (native/android/maven.lock.json): optional dependencies they never load here.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**
-dontwarn com.google.j2objc.annotations.**
-dontwarn org.codehaus.mojo.animal_sniffer.**`;

/** The closure the plugins' android.maven roots name, downloaded and unpacked; none without roots. */
async function mavenLibraries(plugins: NativePlugin<AndroidManifest>[]): Promise<Library[]> {
  const roots = plugins.flatMap(({ native }) => native.maven ?? []);
  if (!roots.length) return [];
  const closure = closureFor(loadMavenLock(), roots)!;
  const libraries = await prepareLibraries(closure.artifacts);
  log.info(dim(`maven: ${closure.name} closure, ${libraries.length} pinned libraries`));
  return libraries;
}

/** META-INF/services files of all libraries, one list of implementations per service. */
function mergedServices(libraries: Library[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const lib of libraries) {
    for (const service of lib.services) {
      const impls = readFileSync(service.path, "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean);
      const list = out.get(service.name) ?? [];
      for (const impl of impls) if (!list.includes(impl)) list.push(impl);
      out.set(service.name, list);
    }
  }
  return out;
}

/** An AAR's res/ compiled once per aapt2 (flat files for `aapt2 link -R`). */
async function compiledLibraryRes(aapt2: string, lib: Library): Promise<string | null> {
  if (!lib.res) return null;
  const out = join(mavenCache(), "compiled", `${sha([aapt2, lib.res]).slice(0, 32)}.zip`);
  if (existsSync(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  await execOrThrow([aapt2, "compile", "--dir", lib.res, "-o", tmp], { echo: false });
  renameSync(tmp, out);
  return out;
}

/** The R.java files aapt2 wrote, compiled with the JDK's javac and packed as a jar. */
async function compileRClasses(java: JavaToolchain, sources: string, classes: string, jar: string): Promise<string> {
  const files = walkFiles(sources).filter((f) => f.endsWith(".java"));
  rmSync(classes, { recursive: true, force: true });
  mkdirSync(classes, { recursive: true });
  await execOrThrow(
    [join(java.jdk.home, "bin", "javac"), "-nowarn", "-encoding", "UTF-8", "--release", "17", "-d", classes, ...files],
    { echo: false, env: java.env },
  );
  writeFileSync(
    jar,
    writeZip(
      walkFiles(classes).map((f) =>
        fileEntry(relative(classes, f).split("\\").join("/"), new Uint8Array(readFileSync(f)), false),
      ),
    ),
  );
  return jar;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

/** Debug builds: the libraries' dex, made once per closure and cached like kotlin-stdlib's. */
async function libraryDex(tools: AndroidTools, java: JavaToolchain, jars: string[]): Promise<Uint8Array[]> {
  const key = sha([tools.d8, String(MIN_SDK), java.kotlin.stdlib, ...jars]).slice(0, 16);
  const dir = join(homedir(), ".akan", "native", "cache", `maven-dex-${key}`);
  if (!existsSync(join(dir, "classes.dex"))) {
    log.step(`dex: ${jars.length} pinned libraries (once per closure)`);
    const tmp = `${dir}.${process.pid}.tmp`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    await execOrThrow(
      [
        tools.d8,
        "--debug",
        "--min-api",
        String(MIN_SDK),
        "--lib",
        tools.androidJar,
        "--classpath",
        java.kotlin.stdlib,
        "--output",
        tmp,
        ...jars,
      ],
      { echo: false, env: java.env },
    );
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
  }
  return dexIn(dir);
}

/** A jar dexed into `out` (the R classes of a debug build). */
async function dexFilesOf(tools: AndroidTools, java: JavaToolchain, jar: string, out: string): Promise<Uint8Array[]> {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await execOrThrow(
    [tools.d8, "--debug", "--min-api", String(MIN_SDK), "--lib", tools.androidJar, "--output", out, jar],
    { echo: false, env: java.env },
  );
  return dexIn(out);
}

function dexIn(dir: string): Uint8Array[] {
  return readdirSync(dir)
    .filter((f) => /^classes\d*\.dex$/.test(f))
    .sort((a, b) => dexIndex(a) - dexIndex(b))
    .map((f) => new Uint8Array(readFileSync(join(dir, f))));
}

const dexIndex = (name: string) => Number(/^classes(\d*)\.dex$/.exec(name)?.[1] || 1);

/**
 * The key a build signs with, and the child env that carries its passwords (apksigner and jarsigner
 * read env:NAME, so they appear on no command line). Release builds use the app's key from the
 * build options or AKAN_NATIVE_ANDROID_KEYSTORE, AKAN_NATIVE_ANDROID_KEY_ALIAS, AKAN_NATIVE_ANDROID_KEYSTORE_PASSWORD and
 * AKAN_NATIVE_ANDROID_KEY_PASSWORD; without one they fall back to ~/.akan/native/debug.keystore with a warning.
 */
async function signingKey(
  ctx: BuildContext,
  java: JavaToolchain,
): Promise<{ keystore: string; alias: string; env: Record<string, string>; release: boolean }> {
  // The API passes the key; only the dev CLI reads it from the environment.
  const configured = ctx.dev ? undefined : (ctx.android?.signing ?? (ctx.api ? undefined : signingFromEnv()));
  if (configured) {
    const keystore = resolve(ctx.project.appDir, configured.keystore);
    if (!existsSync(keystore)) throw new SigningError(`keystore ${keystore} not found`);
    if (!configured.alias || !configured.storePassword)
      throw new SigningError("the release key needs an alias and a store password");
    return {
      keystore,
      alias: configured.alias,
      env: {
        AKAN_NATIVE_KS_PASS: configured.storePassword,
        AKAN_NATIVE_KEY_PASS: configured.keyPassword ?? configured.storePassword,
      },
      release: true,
    };
  }
  if (!ctx.dev) {
    log.warn(
      ctx.api
        ? "release build signed with ~/.akan/native/debug.keystore: fine for testing, not for Google Play (pass signing to release())"
        : "release build signed with ~/.akan/native/debug.keystore: fine for testing, not for Google Play (set AKAN_NATIVE_ANDROID_KEYSTORE, AKAN_NATIVE_ANDROID_KEY_ALIAS and AKAN_NATIVE_ANDROID_KEYSTORE_PASSWORD)",
    );
  }
  return {
    keystore: await debugKeystore(java),
    alias: "androiddebugkey",
    env: { AKAN_NATIVE_KS_PASS: "android", AKAN_NATIVE_KEY_PASS: "android" },
    release: false,
  };
}

function signingFromEnv(env: Record<string, string | undefined> = process.env): AndroidSigning | undefined {
  const keystore = env.AKAN_NATIVE_ANDROID_KEYSTORE;
  if (!keystore) return undefined;
  return {
    keystore,
    alias: env.AKAN_NATIVE_ANDROID_KEY_ALIAS ?? "",
    storePassword: env.AKAN_NATIVE_ANDROID_KEYSTORE_PASSWORD ?? "",
    keyPassword: env.AKAN_NATIVE_ANDROID_KEY_PASSWORD,
  };
}

// ------------------------------------------------------------------ run

/**
 * push.android (N13) → resources and <application> meta-data: Firebase's default channel, icon and
 * color for the notifications it shows itself (the app not in front), and the channel's name and
 * importance for the plugin, which creates the channel at startup so Firebase finds it later.
 */
export function pushResources(res: string, config: Pick<ResolvedConfig, "push">, appDir: string): string[] {
  const settings = config.push?.android;
  if (!settings) return [];
  const meta = (name: string, attr: "value" | "resource", value: string) =>
    `<meta-data android:name="${name}" android:${attr}="${xml(value)}" />`;
  const out: string[] = [];
  if (settings.channel) {
    const { id, name, importance = "default", description } = settings.channel;
    out.push(meta("com.google.firebase.messaging.default_notification_channel_id", "value", id));
    out.push(
      meta("com.akanjs.push.channel_name", "value", name),
      meta("com.akanjs.push.channel_importance", "value", importance),
    );
    if (description) out.push(meta("com.akanjs.push.channel_description", "value", description));
  }
  if (settings.smallIcon) {
    mkdirSync(join(res, "drawable-xxxhdpi"), { recursive: true });
    cpSync(resolve(appDir, settings.smallIcon), join(res, "drawable-xxxhdpi", "akan_native_push_icon.png"));
    out.push(
      meta("com.google.firebase.messaging.default_notification_icon", "resource", "@drawable/akan_native_push_icon"),
    );
  }
  if (settings.color) {
    mkdirSync(join(res, "values"), { recursive: true });
    writeFileSync(
      join(res, "values", "akan_native_push.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="akan_native_push_color">${settings.color}</color>\n</resources>\n`,
    );
    out.push(
      meta("com.google.firebase.messaging.default_notification_color", "resource", "@color/akan_native_push_color"),
    );
  }
  return out;
}

/** A connected serial as a Device: an emulator's AVD name or the model, and the Android version. */
async function describeSerial(adb: string, serial: string, state: Device["state"]): Promise<Device> {
  const emulator = serial.startsWith("emulator-");
  const online = state === "booted" || state === "connected";
  const run = async (args: string[]) =>
    online ? ((await exec([adb, "-s", serial, ...args], { echo: false })).stdout.split(/\r?\n/)[0]?.trim() ?? "") : "";
  const [avd, release, sdk, model] = await Promise.all([
    emulator ? run(["emu", "avd", "name"]) : "",
    run(["shell", "getprop", "ro.build.version.release"]),
    run(["shell", "getprop", "ro.build.version.sdk"]),
    run(["shell", "getprop", "ro.product.model"]),
  ]);
  return {
    platform: "android",
    id: serial,
    name: avd || model || serial,
    kind: emulator ? "emulator" : "device",
    os: sdk ? `Android ${release} (API ${sdk})` : "",
    state,
  };
}

/** "API 37" from an AVD's ini (target=android-37.0), or "". */
function avdApi(name: string): string {
  const ini = join(process.env.ANDROID_AVD_HOME ?? join(homedir(), ".android", "avd"), `${name}.ini`);
  const target = existsSync(ini) ? /^target=android-(\d+)/m.exec(readFileSync(ini, "utf8"))?.[1] : undefined;
  return target ? `API ${target}` : "";
}

/** Connected devices and emulators, then AVDs that are not running (docs/api.md devices). */
export async function androidDevices(): Promise<Device[]> {
  const tools = androidTools();
  const rows = (await exec([tools.adb, "devices"], { echo: false })).stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[0]);
  const running = await Promise.all(
    rows.map(([serial = "", state]) =>
      describeSerial(
        tools.adb,
        serial,
        state === "device"
          ? serial.startsWith("emulator-")
            ? "booted"
            : "connected"
          : state === "unauthorized"
            ? "unauthorized"
            : "offline",
      ),
    ),
  );
  const runningAvds = new Set(running.filter((d) => d.kind === "emulator").map((d) => d.name));
  const avds = (await exec([tools.emulator, "-list-avds"], { echo: false })).stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("INFO"));
  const stopped = avds
    .filter((name) => !runningAvds.has(name))
    .map(
      (name): Device => ({
        platform: "android",
        id: name,
        name,
        kind: "emulator",
        os: avdApi(name),
        state: "shutdown",
      }),
    );
  return [...running, ...stopped];
}

async function onlineDevices(adb: string): Promise<string[]> {
  const out = (await exec([adb, "devices"], { echo: false })).stdout;
  return out
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[1] === "device")
    .map((c) => c[0]!);
}

/**
 * `akan-native test` starts emulators with -no-window, and run/dev reuse whatever is connected, so the app
 * can end up on an emulator nobody can see. Found by the AVD name (`adb emu avd name`) in the
 * emulator's command line; the window-less build is also a separate `qemu-system-*-headless` binary.
 */
export async function warnIfWindowless(adb: string, serial: string): Promise<void> {
  if (!serial.startsWith("emulator-")) return;
  const avd = (await exec([adb, "-s", serial, "emu", "avd", "name"], { echo: false })).stdout.split(/\r?\n/)[0]?.trim();
  if (!avd) return;
  const ps = (await exec(["ps", "-axo", "command"], { echo: false })).stdout.split("\n");
  const line = ps.find(
    (l) => /qemu-system-\S+/.test(l) && l.split(/\s+/).some((arg, i, all) => arg === avd && all[i - 1] === "-avd"),
  );
  if (!line || !(line.includes(" -no-window") || /qemu-system-\S+-headless /.test(line))) return;
  log.warn(
    `${serial} (${avd}) is running without a window (started by \`akan-native test\` or --headless), so the app will not be visible.`,
  );
  log.info(dim(`To see it: ${adb} -s ${serial} emu kill, then run this again.`));
}

/**
 * The device to use (O4-4): `wanted` is a connected device's serial (`adb devices`: a phone over USB
 * or Wi-Fi, a running emulator) or an AVD name; without it the first connected device, else the
 * first AVD is started.
 */
async function ensureDevice(tools: AndroidTools, wanted: string | undefined, headless: boolean): Promise<string> {
  let devices = await onlineDevices(tools.adb);
  if (wanted && devices.includes(wanted)) devices = [wanted];
  else if (wanted) {
    // An AVD by name: its emulator may already run under another serial.
    const running = [];
    for (const serial of devices.filter((s) => s.startsWith("emulator-"))) {
      const name = (await exec([tools.adb, "-s", serial, "emu", "avd", "name"], { echo: false })).stdout
        .split(/\r?\n/)[0]
        ?.trim();
      if (name === wanted) running.push(serial);
    }
    devices = running;
  }
  if (devices.length === 0) {
    const avds = (await exec([tools.emulator, "-list-avds"], { echo: false })).stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (wanted && !avds.includes(wanted))
      throw new CliError(
        `no connected Android device with serial ${wanted} and no AVD of that name (adb devices; emulator -list-avds: ${avds.join(", ") || "none"})`,
      );
    const avd = wanted ?? avds[0];
    if (!avd) throw new CliError("no Android device or AVD found. Create one in Android Studio (Device Manager).");
    log.step(`starting emulator ${avd}`);
    const emulatorArgs = [
      "-avd",
      avd,
      "-no-snapshot-save",
      "-no-boot-anim",
      ...(headless ? ["-no-window", "-no-audio"] : []),
    ];
    const before = new Set(
      await exec([tools.adb, "devices"], { echo: false }).then((r) =>
        [...r.stdout.matchAll(/^(emulator-\d+)\s/gm)].map((m) => m[1]!),
      ),
    );
    Bun.spawn([tools.emulator, ...emulatorArgs], { stdio: ["ignore", "ignore", "ignore"] }).unref();
    // Other devices may be online already (adb wait-for-device returns at once): wait for the new
    // emulator's serial, the one whose AVD name is ours.
    const deadline = Date.now() + 180_000;
    for (;;) {
      const serials = [...(await exec([tools.adb, "devices"], { echo: false })).stdout.matchAll(/^(emulator-\d+)\s/gm)]
        .map((m) => m[1]!)
        .filter((s) => !before.has(s));
      let found: string | undefined;
      for (const serial of serials) {
        const name = (await exec([tools.adb, "-s", serial, "emu", "avd", "name"], { echo: false })).stdout
          .split(/\r?\n/)[0]
          ?.trim();
        if (name === avd) found = serial;
      }
      if (found) {
        await execOrThrow([tools.adb, "-s", found, "wait-for-device"], { echo: false });
        devices = [found];
        break;
      }
      if (Date.now() > deadline) throw new CliError(`the emulator ${avd} did not come up in adb devices`);
      await Bun.sleep(1000);
    }
  }
  const serial = devices[0]!;
  if (!headless) await warnIfWindowless(tools.adb, serial);
  const deadline = Date.now() + 180_000;
  while (
    (await exec([tools.adb, "-s", serial, "shell", "getprop", "sys.boot_completed"], { echo: false })).stdout.trim() !==
    "1"
  ) {
    if (Date.now() > deadline) throw new CliError(`${serial} did not finish booting`);
    await Bun.sleep(1000);
  }
  return serial;
}

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export async function launchAndroid(
  ctx: BuildContext,
  apk: string,
  opts: LaunchOptions & { avd?: string; device?: string; reverse?: number[] },
): Promise<Launched> {
  const tools = androidTools();
  const serial = await ensureDevice(tools, opts.device ?? opts.avd, opts.headless);
  const adb = [tools.adb, "-s", serial];
  const appId = androidAppId(ctx);
  // akan-native dev --hmr: the device's 127.0.0.1:<port> reaches the Mac's (the dev gateway, lib/hmr.ts).
  // 10.0.2.2 would not do: the page on https://app.localhost may open ws://localhost, not ws://10.0.2.2.
  const reverse = opts.reverse ?? [];
  for (const port of reverse) await execOrThrow([...adb, "reverse", `tcp:${port}`, `tcp:${port}`], { echo: false });
  log.step(`install on ${serial}`);
  await execOrThrow([...adb, "install", "-r", apk], { echo: false });
  await exec([...adb, "logcat", "-c"], { echo: false });

  // AKAN_NATIVE_PUBLIC_X → PUBLIC_X in the akanNativeEnv extra, read by dev builds.
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env)) overrides[key.replace(/^AKAN_NATIVE_/, "")] = value;
  const extra = Object.keys(overrides).length ? ` --es akanNativeEnv ${shellQuote(JSON.stringify(overrides))}` : "";
  // -S: stop a running instance first so every launch starts clean.
  await execOrThrow([...adb, "shell", `am start -S -W -n ${appId}/${ACTIVITY}${extra}`], { echo: false });
  let pid = "";
  for (let i = 0; i < 20 && !pid; i++) {
    pid = (await exec([...adb, "shell", "pidof", appId], { echo: false })).stdout.trim();
    if (!pid) await Bun.sleep(250);
  }
  // WV-3: native (AkanNative) and page console (AkanNativeConsole) logs of our process in one stream.
  const logcat = Bun.spawn(
    [
      ...adb,
      "logcat",
      "-v",
      "brief",
      ...(pid ? [`--pid=${pid}`] : []),
      "AkanNative:V",
      "AkanNativeConsole:V",
      "AndroidRuntime:E",
      "*:S",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const onLine = opts.onLine ?? printLine;
  const logs = Promise.all([pipeLines(logcat.stdout, onLine), pipeLines(logcat.stderr, onLine)]);
  return {
    exited: logcat.exited.then(async (code) => {
      await logs;
      for (const port of reverse) await exec([...adb, "reverse", "--remove", `tcp:${port}`], { echo: false });
      return code;
    }),
    stop: () => logcat.kill("SIGTERM"),
    device: await describeSerial(tools.adb, serial, serial.startsWith("emulator-") ? "booted" : "connected"),
  };
}

export async function runAndroid(ctx: BuildContext, apk: string, args: ParsedArgs): Promise<number> {
  const app = await launchAndroid(ctx, apk, {
    env: envFromProcess(),
    headless: args.flags.headless === true,
    avd: typeof args.flags.avd === "string" ? args.flags.avd : undefined,
    device: typeof args.flags.device === "string" ? args.flags.device : undefined,
  });
  log.ok(`running ${androidAppId(ctx)}, logs below. Ctrl+C to stop following.`);
  return follow(app);
}

/** Fails the build when compiled code reaches a framework API above minSdk outside an ApiN class (lib/apilevel.ts). */
function checkApis(jar: string, plugins: NativePlugin<AndroidManifest>[], androidJar: string): void {
  const xml = apiVersionsFor(androidJar);
  if (!xml) {
    log.warn(`no data/api-versions.xml next to ${androidJar}: API levels are not checked`);
    return;
  }
  const packageLevels = plugins.map(({ plugin, native }): [string, number] => [
    native.class.slice(0, native.class.lastIndexOf(".") + 1).replace(/\./g, "/"),
    pluginMinSdk(plugin.manifest.id, native, MIN_SDK, TOOLCHAIN.android.compileSdk),
  ]);
  const problems = checkApiLevels(new Uint8Array(readFileSync(jar)), loadApiVersions(xml), MIN_SDK, packageLevels);
  if (problems.length) throw new CliError(formatApiProblems(problems, MIN_SDK));
}

/**
 * `akan-native plugin compile android`: compiles the shell, these plugins and their generated bindings
 * with a registry of just them, in a fresh temporary folder (so several checks can run at once).
 */
export async function compileAndroidPlugins(
  plugins: NativePlugin<AndroidManifest>[],
  appDir: string,
): Promise<ExecResult> {
  const tools = androidTools();
  const java = await javaToolchain();
  const dir = mkdtempSync(join(tmpdir(), "akan-native-compile-android-"));
  try {
    const registry = join(dir, "kotlin", "com", "akanjs", "generated", "AkanNativeGeneratedPlugins.kt");
    mkdirSync(dirname(registry), { recursive: true });
    writeFileSync(registry, kotlinRegistry(plugins, MIN_SDK, TOOLCHAIN.android.compileSdk));
    const vectorData = join(dir, "kotlin", "com", "akanjs", "runtime", "AkanNativeVectorData.kt");
    mkdirSync(dirname(vectorData), { recursive: true });
    writeFileSync(vectorData, kotlinVectorData(false));
    // Every optional part compiled, so a plugin check sees all of the shell.
    const features = join(dir, "kotlin", "com", "akanjs", "runtime", "AkanNativeFeatures.kt");
    writeFileSync(features, kotlinFeatures({ dev: true, updates: true }));
    const bindings = writePluginBindings(plugins, "android", join(dir, "spec"), appDir);
    const sources = [
      ...kotlinSources(SHELL_SRC),
      ...plugins.flatMap((p) => p.sources),
      registry,
      vectorData,
      features,
      ...bindings,
    ];
    const jar = join(dir, "classes.jar");
    const libraries = await mavenLibraries(plugins);
    const classpath = [tools.androidJar, java.kotlin.stdlib, ...libraries.map((l) => l.classes)].join(":");
    const result = await exec(
      [
        java.kotlin.kotlinc,
        ...sources,
        "-d",
        jar,
        "-classpath",
        classpath,
        "-jvm-target",
        "17",
        "-no-jdk",
        "-no-stdlib",
        "-no-reflect",
      ],
      { echo: false, env: java.env },
    );
    if (result.code === 0) checkApis(jar, plugins, tools.androidJar);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
