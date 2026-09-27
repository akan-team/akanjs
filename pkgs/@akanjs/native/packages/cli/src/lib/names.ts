// Name and path collisions between plugins and the shell (architecture review stage 6). They are hard
// errors and nothing is renamed: react-native's SPM work added automatic renaming (#58044) and took it
// back (#58290), because a renamed type or file breaks whatever refers to it by name.
//
// iOS: the shell, every plugin and the generated bindings are one Swift module, so top-level types and
// source file names share one namespace. Android: types are package-qualified, but class files of
// names that differ only in case overwrite each other on case-insensitive disks (macOS, Windows).
// Names are compared by their letters and digits, case-folded, so "local-notifications" and
// "local_notifications", or "Foo" and "foo", are the same name.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

export interface Named {
  name: string;
  /** Where it comes from, for the message: "plugin sqlite (ios/SqlitePlugin.swift)". */
  from: string;
}

const key = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

function how(a: string, b: string): string {
  if (a === b) return "the same name";
  if (a.toLowerCase() === b.toLowerCase()) return "names that differ only in case";
  return "names that differ only in punctuation";
}

/** One message per clash of names that are the same by letters and digits, case-folded. */
export function collisions(entries: Named[], what: string): string[] {
  const groups = new Map<string, Named[]>();
  for (const entry of entries) {
    const list = groups.get(key(entry.name)) ?? [];
    // The same declaration reached twice (one file listed twice) is no clash.
    if (!list.some((e) => e.name === entry.name && e.from === entry.from)) list.push(entry);
    groups.set(key(entry.name), list);
  }
  const problems: string[] = [];
  for (const list of groups.values()) {
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[0]!, list[i]!];
      problems.push(`${what}: ${a.name} (${a.from}) and ${b.name} (${b.from}) are ${how(a.name, b.name)}`);
    }
  }
  return problems;
}

/** A plugin's name prefix in generated code, as codegen.ts makes it. */
export const pascal = (text: string) =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");

/**
 * Top-level Swift types of a source file (the module's namespace): class, struct, enum, protocol,
 * actor, typealias at the start of a line, not private or fileprivate (those are the file's own).
 */
export function swiftTypes(text: string): string[] {
  const out: string[] = [];
  const decl =
    /^(?:@[A-Za-z]+(?:\([^)]*\))?\s+)*((?:(?:public|internal|fileprivate|private|open|final|nonisolated|indirect)\s+)*)(?:class|struct|enum|protocol|actor|typealias)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const m of text.matchAll(decl)) {
    if (/\b(?:private|fileprivate)\b/.test(m[1]!)) continue;
    out.push(m[2]!);
  }
  return out;
}

/** A Kotlin file's package and top-level types (class, object, interface, enum class, typealias …). */
export function kotlinTypes(text: string): { pkg: string; types: string[] } {
  const pkg = /^package\s+([A-Za-z0-9_.]+)/m.exec(text)?.[1] ?? "";
  const types: string[] = [];
  const decl =
    /^((?:(?:public|internal|private|abstract|open|sealed|data|enum|annotation|inner|value|fun)\s+)*)(?:class|object|interface|typealias)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const m of text.matchAll(decl)) {
    if (/\bprivate\b/.test(m[1]!)) continue;
    types.push(m[2]!);
  }
  return { pkg, types };
}

/** Modules an iOS app imports or links, which the app's own module may not be named. */
const APPLE_MODULES = [
  "Swift",
  "Foundation",
  "UIKit",
  "WebKit",
  "SwiftUI",
  "Combine",
  "CoreGraphics",
  "CoreFoundation",
  "Darwin",
  "Dispatch",
  "ObjectiveC",
  "os",
  "Observation",
  "Security",
  "StoreKit",
  "UserNotifications",
  "AVFoundation",
  "Photos",
  "LocalAuthentication",
  "CoreLocation",
  "SQLite3",
];

export interface IosNameInput {
  /** The app's Swift module name. */
  module: string;
  shellSources: string[];
  plugins: { id: string; className: string; sources: string[]; frameworks: string[] }[];
  /** Generated Swift files (bindings, registry). */
  generated: string[];
}

/** Clashes in the iOS app's one Swift module: plugin prefixes, top-level types, file names, the module's own name. */
export function iosNameProblems(input: IosNameInput): string[] {
  const read = (file: string) => readFileSync(file, "utf8");
  const types: Named[] = [];
  const files: Named[] = [];
  for (const file of input.shellSources) {
    for (const name of swiftTypes(read(file))) types.push({ name, from: `the shell (${basename(file)})` });
    files.push({ name: basename(file), from: "the shell" });
  }
  for (const plugin of input.plugins) {
    for (const file of plugin.sources) {
      for (const name of swiftTypes(read(file))) types.push({ name, from: `plugin ${plugin.id} (${basename(file)})` });
      files.push({ name: basename(file), from: `plugin ${plugin.id}` });
    }
  }
  for (const file of input.generated) {
    for (const name of swiftTypes(read(file))) types.push({ name, from: `generated ${basename(file)}` });
    files.push({ name: basename(file), from: "generated code" });
  }
  const problems = [
    ...collisions(
      input.plugins.map((p) => ({ name: pascal(p.id), from: `plugin ${p.id}` })),
      "plugin name prefixes",
    ),
    ...collisions(types, "Swift types in the app module"),
    ...collisions(files, "Swift source file names (swiftc needs them unique in a module)"),
  ];
  const frameworks = new Set([...APPLE_MODULES, ...input.plugins.flatMap((p) => p.frameworks)].map(key));
  if (frameworks.has(key(input.module)))
    problems.push(
      `the app's Swift module "${input.module}" has the name of a system module: set app.fileName to something else`,
    );
  return problems;
}

export interface AndroidNameInput {
  plugins: { id: string; className: string; sources: string[] }[];
  /** Generated Kotlin files (bindings, registry). */
  generated: string[];
}

/** Packages that belong to the shell. */
const SHELL_PACKAGES = ["com.akanjs.runtime", "com.akanjs.generated"];

/** Clashes among Android classes: plugin prefixes, plugin classes, and types by package (case-folded). */
export function androidNameProblems(input: AndroidNameInput): string[] {
  const types: Named[] = [];
  const problems: string[] = [];
  for (const plugin of input.plugins) {
    const pkg = plugin.className.replace(/\.[^.]+$/, "");
    if (SHELL_PACKAGES.some((p) => pkg === p || pkg.startsWith(`${p}.`)))
      problems.push(`plugin ${plugin.id}: android.class ${plugin.className} is in the shell's package ${pkg}`);
    for (const file of plugin.sources) {
      const { pkg: filePkg, types: names } = kotlinTypes(readFileSync(file, "utf8"));
      for (const name of names)
        types.push({ name: `${filePkg}.${name}`, from: `plugin ${plugin.id} (${basename(file)})` });
    }
  }
  for (const file of input.generated) {
    const { pkg, types: names } = kotlinTypes(readFileSync(file, "utf8"));
    for (const name of names) types.push({ name: `${pkg}.${name}`, from: `generated ${basename(file)}` });
  }
  // Package-qualified, so only a real clash (or one of case, which class files cannot hold apart) is found.
  const fqcn = new Map<string, Named[]>();
  for (const t of types) {
    const k = t.name.toLowerCase();
    const list = fqcn.get(k) ?? [];
    if (!list.some((e) => e.name === t.name && e.from === t.from)) list.push(t);
    fqcn.set(k, list);
  }
  for (const list of fqcn.values()) {
    for (let i = 1; i < list.length; i++)
      problems.push(
        `Kotlin classes: ${list[0]!.name} (${list[0]!.from}) and ${list[i]!.name} (${list[i]!.from}) are ${list[0]!.name === list[i]!.name ? "the same class" : "class files that differ only in case"}`,
      );
  }
  problems.push(
    ...collisions(
      input.plugins.map((p) => ({ name: pascal(p.id), from: `plugin ${p.id}` })),
      "plugin name prefixes",
    ),
  );
  const classes = new Map<string, Named>();
  for (const p of input.plugins) {
    const k = p.className.toLowerCase();
    const other = classes.get(k);
    if (other)
      problems.push(
        `android.class: ${other.name} (${other.from}) and ${p.className} (plugin ${p.id}) are the same class`,
      );
    else classes.set(k, { name: p.className, from: `plugin ${p.id}` });
  }
  return problems;
}
