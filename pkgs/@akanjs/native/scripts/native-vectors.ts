// Runs the shared vectors (packages/core/vectors: scope, routes, ranges, ids, bridge,
// navigation), which bun test runs against the TypeScript reference and cargo test against the
// desktop, against the Swift and Kotlin kernels (AkanNativeKernel, AkanNativeAcl; runners AkanNativeVectors.*):
//
//   bun scripts/native-vectors.ts            both
//   bun scripts/native-vectors.ts swift      or one of them
//
// Swift builds for the Mac with swiftc (Xcode's command line tools). Kotlin runs on the JVM with the
// JDK and the pinned kotlinc akan-native builds Android apps with; its vectors are Kotlin literals (no JSON
// reader there). The same runners run on the device in debug builds ($host.vectors in the self-test),
// where Android's ICU-backed libraries and iOS's Foundation may behave differently.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { androidSdkRoot, javaEnv, resolveJdk, resolveKotlin, TOOLCHAIN } from "../packages/cli/src/lib/toolchains.ts";
import { kotlinVectorData, swiftVectorData } from "../packages/cli/src/lib/vectors.ts";

const REPO = resolve(import.meta.dir, "..");
const work = join(tmpdir(), `akan-native-native-vectors-${process.pid}`);
mkdirSync(work, { recursive: true });

function run(cmd: string[], env?: Record<string, string>): boolean {
  const r = Bun.spawnSync(cmd, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } });
  return r.exitCode === 0;
}

/** The kernel sources the runners test: contract tables, the kernel, the scope matchers, the runner. */
const SWIFT = [
  "AkanNativeContract.swift",
  "AkanNativeKernel.swift",
  "AkanNativeAcl.swift",
  "AkanNativeVectors.swift",
].map((f) => join(REPO, "native/ios/Sources", f));
const KOTLIN = [
  "AkanNativeContract.kt",
  "AkanNativeKernel.kt",
  "AkanNativeAcl.kt",
  "AkanNativeEd25519.kt",
  "AkanNativeVectors.kt",
].map((f) => join(REPO, "native/android/src/com/akanjs/runtime", f));

function swift(): boolean {
  writeFileSync(join(work, "AkanNativeVectorData.swift"), swiftVectorData(true));
  const main = join(work, "main.swift");
  writeFileSync(
    main,
    `import Foundation
let result = AkanNativeVectors.run()
for failure in result.failures { print("FAIL \\(failure)") }
print("swift: \\(result.passed)/\\(AkanNativeVectors.expected)")
exit(result.failures.isEmpty && result.passed == AkanNativeVectors.expected ? 0 : 1)
`,
  );
  const exe = join(work, "swift-vectors");
  return (
    run([
      "xcrun",
      "swiftc",
      "-swift-version",
      "6",
      "-D",
      "AKAN_NATIVE_DEV",
      ...SWIFT,
      join(work, "AkanNativeVectorData.swift"),
      main,
      "-o",
      exe,
    ]) && run([exe])
  );
}

async function kotlin(): Promise<boolean> {
  const jdk = resolveJdk();
  const sdk = androidSdkRoot();
  if (!jdk || !sdk) {
    console.error("kotlin: needs a JDK and the Android SDK (akan-native doctor)");
    return false;
  }
  const env = javaEnv(jdk);
  const { kotlinc, stdlib } = await resolveKotlin({ javaEnv: env });
  writeFileSync(join(work, "AkanNativeVectorData.kt"), kotlinVectorData(true));
  const main = join(work, "Main.kt");
  writeFileSync(
    main,
    `import com.akanjs.runtime.AkanNativeVectors
import kotlin.system.exitProcess

fun main() {
    val result = AkanNativeVectors.run()
    for (failure in result.failures) println("FAIL $failure")
    println("kotlin: \${result.passed}/\${AkanNativeVectors.expected}")
    exitProcess(if (result.failures.isEmpty() && result.passed == AkanNativeVectors.expected) 0 else 1)
}
`,
  );
  const jar = join(work, "vectors.jar");
  // android.jar only for compiling AkanNativeAcl.load (org.json); nothing that runs here calls it.
  const androidJar = join(sdk, "platforms", `android-${TOOLCHAIN.android.compileSdk}`, "android.jar");
  return (
    run(
      [kotlinc, "-nowarn", "-cp", androidJar, ...KOTLIN, join(work, "AkanNativeVectorData.kt"), main, "-d", jar],
      env,
    ) && run([join(jdk.home, "bin", "java"), "-cp", `${jar}:${stdlib}`, "MainKt"], env)
  );
}

/**
 * The http plugin's URL canonicalizer (plugins/http/{ios/HttpUrl.swift, android/HttpUrl.kt}) against
 * plugins/http/test/vectors/canonical.json. Plugin code, so not in the shells' device runners.
 */
const httpCases = (
  (await Bun.file(join(REPO, "plugins/http/test/vectors/canonical.json")).json()) as {
    cases: [string, string | null][];
  }
).cases;

function swiftHttp(): boolean {
  const main = join(work, "http", "main.swift");
  mkdirSync(join(work, "http"), { recursive: true });
  const lit = (v: string | null) => (v === null ? "nil" : JSON.stringify(v).replace(/\\u([0-9a-f]{4})/g, "\\u{$1}"));
  writeFileSync(
    main,
    `import Foundation
let cases: [(String, String?)] = [
${httpCases.map(([i, o]) => `    (${lit(i)}, ${lit(o)}),`).join("\n")}
]
var failed = 0
for (input, expected) in cases where HttpUrl.canonical(input) != expected {
    print("FAIL http \\(input): \\(HttpUrl.canonical(input) ?? "nil")"); failed += 1
}
print("swift http: \\(cases.count - failed)/\\(cases.count)")
exit(failed == 0 ? 0 : 1)
`,
  );
  const exe = join(work, "http", "swift-http");
  return (
    run(["xcrun", "swiftc", "-swift-version", "6", join(REPO, "plugins/http/ios/HttpUrl.swift"), main, "-o", exe]) &&
    run([exe])
  );
}

async function kotlinHttp(): Promise<boolean> {
  const jdk = resolveJdk();
  if (!jdk) return false;
  const env = javaEnv(jdk);
  const { kotlinc, stdlib } = await resolveKotlin({ javaEnv: env });
  const main = join(work, "http", "HttpMain.kt");
  mkdirSync(join(work, "http"), { recursive: true });
  const k = (v: string | null) => (v === null ? "null" : JSON.stringify(v).replace(/\$/g, "\\$"));
  writeFileSync(
    main,
    `import com.akanjs.plugins.http.HttpUrl
import kotlin.system.exitProcess

fun main() {
    val cases = listOf<Pair<String, String?>>(
${httpCases.map(([i, o]) => `        ${k(i)} to ${k(o)},`).join("\n")}
    )
    var failed = 0
    for ((input, expected) in cases) if (HttpUrl.canonical(input) != expected) { println("FAIL http $input: \${HttpUrl.canonical(input)}"); failed++ }
    println("kotlin http: \${cases.size - failed}/\${cases.size}")
    exitProcess(if (failed == 0) 0 else 1)
}
`,
  );
  const jar = join(work, "http", "http.jar");
  return (
    run([kotlinc, "-nowarn", join(REPO, "plugins/http/android/HttpUrl.kt"), main, "-d", jar], env) &&
    run([join(jdk.home, "bin", "java"), "-cp", `${jar}:${stdlib}`, "HttpMainKt"], env)
  );
}

const which = process.argv[2];
let ok = true;
try {
  if (!which || which === "swift") ok = swift() && swiftHttp() && ok;
  if (!which || which === "kotlin") ok = (await kotlin()) && (await kotlinHttp()) && ok;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
