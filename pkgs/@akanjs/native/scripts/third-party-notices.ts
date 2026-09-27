// Writes THIRD_PARTY_NOTICES.md: the third-party software that apps built with this package contain.
// Every fact comes from a pinned source, not from memory:
// - Rust crates: `cargo metadata` over native/desktop/Cargo.lock, per desktop OS, following normal
//   dependencies from the library (what is linked into it; proc macros and build scripts only run
//   while compiling and are left out).
// - Android: the Maven libraries of native/android/maven.lock.json with the licenses of their pinned
//   POMs, and kotlin-stdlib from the pinned kotlinc's license folder.
//
//   bun scripts/third-party-notices.ts           write the file
//   bun scripts/third-party-notices.ts --check   exit 1 when the file is stale

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { akanNativeHome, TOOLCHAIN } from "../packages/cli/src/lib/toolchains.ts";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "THIRD_PARTY_NOTICES.md");
const check = process.argv.includes("--check");

interface CargoPackage {
  id: string;
  name: string;
  version: string;
  license: string | null;
  repository: string | null;
  targets: { kind: string[] }[];
}
interface CargoMetadata {
  packages: CargoPackage[];
  resolve: { root: string; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
}

const OSES = {
  macOS: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
  Windows: ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"],
  Linux: ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu"],
} as const;
type Os = keyof typeof OSES;

function metadata(triple: string): CargoMetadata {
  const cargo = join(process.env.HOME ?? "", ".cargo", "bin", "cargo");
  const p = Bun.spawnSync(
    [
      existsSync(cargo) ? cargo : "cargo",
      "metadata",
      "--format-version",
      "1",
      "--locked",
      "--manifest-path",
      join(ROOT, "native/desktop/Cargo.toml"),
      "--filter-platform",
      triple,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (p.exitCode !== 0) throw new Error(`cargo metadata (${triple}) failed:\n${p.stderr}`);
  return JSON.parse(p.stdout.toString()) as CargoMetadata;
}

/** Crates linked into the desktop library for one target: normal dependencies from the root, without proc macros. */
function linked(meta: CargoMetadata): CargoPackage[] {
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const queue = [meta.resolve.root];
  while (queue.length) {
    const id = queue.pop()!;
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (seen.has(dep.pkg) || !dep.dep_kinds.some((k) => k.kind === null)) continue;
      if (byId.get(dep.pkg)?.targets.some((t) => t.kind.includes("proc-macro"))) continue;
      seen.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  return [...seen].map((id) => byId.get(id)!);
}

const crates = new Map<string, { pkg: CargoPackage; oses: Set<Os> }>();
for (const [os, triples] of Object.entries(OSES) as [Os, readonly string[]][]) {
  for (const triple of triples) {
    for (const pkg of linked(metadata(triple))) {
      const key = `${pkg.name}@${pkg.version}`;
      const entry = crates.get(key) ?? { pkg, oses: new Set<Os>() };
      entry.oses.add(os);
      crates.set(key, entry);
    }
  }
}

interface License {
  name: string;
  url?: string;
}
interface MavenLock {
  closures: { name: string; roots: string[]; artifacts: string[] }[];
  artifacts: Record<string, { licenses?: License[] }>;
}
const lock = (await Bun.file(join(ROOT, "native/android/maven.lock.json")).json()) as MavenLock;
const MODULE: Record<string, string> = {
  fcm: "push (FCM)",
  billing: "iap (Play Billing)",
  union: "push and iap together",
};
const maven = new Map<string, Set<string>>();
for (const closure of lock.closures) {
  for (const name of closure.name.split("+")) {
    for (const coord of closure.artifacts)
      (maven.get(coord) ?? maven.set(coord, new Set()).get(coord)!).add(MODULE[name] ?? name);
  }
}

const kotlinLicense = join(akanNativeHome(), "toolchains", "kotlin", TOOLCHAIN.kotlin.version, "license");
if (!existsSync(join(kotlinLicense, "LICENSE.txt")))
  throw new Error(
    `kotlinc ${TOOLCHAIN.kotlin.version} is not installed (${kotlinLicense}); run: bun run akan-native toolchain install kotlin`,
  );
const kotlinName = /Apache License\s+Version 2\.0/.test(readFileSync(join(kotlinLicense, "LICENSE.txt"), "utf8"))
  ? "Apache License 2.0"
  : "see its LICENSE.txt";
const kotlinCopyright =
  /Copyright [^\n]+/.exec(readFileSync(join(kotlinLicense, "NOTICE.txt"), "utf8"))?.[0]?.trim() ?? "";

const cell = (s: string) => s.replaceAll("|", "\\|");
const licenseText = (ls: License[] | undefined) =>
  ls?.length
    ? ls.map((l) => (l.url ? `[${cell(l.name)}](${l.url})` : cell(l.name))).join(", ")
    : "not declared in its POM";
const lines = [
  "# Third-party notices",
  "",
  "Generated by `bun scripts/third-party-notices.ts` from the pinned sources (Cargo.lock, native/android/maven.lock.json, the pinned kotlinc). Do not edit.",
  "",
  "This package's own code is under the MIT License (LICENSE). Apps built with it contain the software below. Android builds also write the notices of what they include into the app (`akan-native-licenses.json`), so the app can show them on an open-source licenses screen.",
  "",
  "## Desktop apps",
  "",
  "Desktop apps embed the Bun runtime that builds them (`bun build --compile`): [Bun](https://github.com/oven-sh/bun), MIT License. Bun includes other libraries, which its license file lists (https://github.com/oven-sh/bun/blob/main/LICENSE.md).",
  "",
  "The Rust crates linked into the desktop library, with the license each declares:",
  "",
  "| Crate | Version | License | macOS | Windows | Linux |",
  "|---|---|---|---|---|---|",
  ...[...crates.values()]
    .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name) || a.pkg.version.localeCompare(b.pkg.version))
    .map(({ pkg, oses }) => {
      const name = pkg.repository ? `[${pkg.name}](${pkg.repository})` : pkg.name;
      const mark = (os: Os) => (oses.has(os) ? "✓" : "");
      return `| ${name} | ${pkg.version} | ${cell(pkg.license ?? "not declared")} | ${mark("macOS")} | ${mark("Windows")} | ${mark("Linux")} |`;
    }),
  "",
  "## Android apps",
  "",
  `Every Android app contains kotlin-stdlib ${TOOLCHAIN.kotlin.version} from the pinned Kotlin compiler: ${kotlinName}, ${kotlinCopyright}.`,
  "",
  "Apps that enable the push plugin's FCM module or the iap plugin also contain these Maven libraries (licenses from their pinned POMs):",
  "",
  "| Library | License | Included with |",
  "|---|---|---|",
  ...[...maven.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([coord, modules]) =>
        `| ${coord} | ${licenseText(lock.artifacts[coord]?.licenses)} | ${[...modules].sort().join(", ")} |`,
    ),
  "",
  "## iOS apps",
  "",
  "iOS apps contain only this package's code and Apple's system frameworks.",
  "",
];
const text = lines.join("\n");
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error("THIRD_PARTY_NOTICES.md is stale: run bun scripts/third-party-notices.ts");
    process.exit(1);
  }
  console.info("THIRD_PARTY_NOTICES.md is up to date");
} else {
  await Bun.write(OUT, text);
  console.info(`THIRD_PARTY_NOTICES.md: ${crates.size} crates, ${maven.size} Maven libraries`);
}
