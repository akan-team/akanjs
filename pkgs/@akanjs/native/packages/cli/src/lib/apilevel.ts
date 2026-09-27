// Android API level check (akanjs readiness O1-1). The app runs from minSdk up, so a framework class,
// method or field added in a later API must never be reached on an older device. This is lint's NewApi
// without its data-flow analysis, over the compiled classes instead of the sources:
// - code that needs API N lives in a class or nested object whose name ends in `ApiN` (AndroidX's
//   `Api33Impl` pattern) and is called only under `Build.VERSION.SDK_INT >= N`. Keeping it in its own
//   class also spares ART a soft verification failure of the calling class on old devices.
// - a plugin with `android.minSdk` (created only from that level, native-plugins.ts) may use APIs up to
//   it anywhere in its package.
// - every class's constant pool is read: classes it names, the members it calls or reads (looked up
//   through the app's own supertypes and the framework's), its superclass and interfaces, and the
//   interfaces that its lambdas implement (invokedynamic). Levels come from the SDK platform's
//   data/api-versions.xml, the file lint reads.
// Not seen: compile-time constants (kotlinc inlines `Build.VERSION_CODES.*`, `Context.RECEIVER_*` and
// permission names) and inline functions copied out of an ApiN class, so ApiN classes have none.

import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { readZip } from "./apk.ts";

export interface ApiClass {
  since: number;
  supers: string[];
  members: Map<string, number>;
}
export type ApiVersions = Map<string, ApiClass>;

const parsed = new Map<string, ApiVersions>();

/** Reads api-versions.xml (one element per line, as the SDK ships it). */
export function loadApiVersions(path: string): ApiVersions {
  const cached = parsed.get(path);
  if (cached) return cached;
  const api: ApiVersions = new Map();
  let current: ApiClass | null = null;
  // Attributes come in any order (classes of mainline modules carry module="…" before since="…").
  const since = (tag: string) => /\ssince="(\d+)"/.exec(tag)?.[1];
  const name = (tag: string) => /\sname="([^"]+)"/.exec(tag)![1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("\t<class ")) {
      current = { since: Number(since(line) ?? 1), supers: [], members: new Map() };
      api.set(name(line), current);
      continue;
    }
    if (line.startsWith("\t</class>")) {
      current = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("\t\t<extends ") || line.startsWith("\t\t<implements ")) {
      if (!/\sremoved="/.test(line)) current.supers.push(name(line));
    } else if (line.startsWith("\t\t<method ") || line.startsWith("\t\t<field ")) {
      const added = since(line);
      current.members.set(name(line), added ? Number(added) : current.since);
    }
  }
  parsed.set(path, api);
  return api;
}

export interface ClassInfo {
  name: string;
  superName: string | null;
  interfaces: string[];
  /** Classes named in the constant pool (array types stripped). */
  classes: string[];
  /** Field and method references: owner, name, descriptor. */
  members: { owner: string; name: string; descriptor: string; field: boolean }[];
  /** Interfaces an invokedynamic call site produces (lambdas turned into framework interfaces). */
  lambdaTypes: string[];
}

/** The parts of a class file this check needs: the constant pool, this class, its supertypes. */
export function readClass(bytes: Uint8Array): ClassInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0xcafebabe) throw new Error("not a class file");
  const count = view.getUint16(8);
  const utf8: (string | undefined)[] = [];
  const refs: { tag: number; a: number; b: number }[] = [];
  let p = 10;
  const decoder = new TextDecoder();
  for (let i = 1; i < count; i++) {
    const tag = bytes[p]!;
    switch (tag) {
      case 1: {
        const length = view.getUint16(p + 1);
        utf8[i] = decoder.decode(bytes.subarray(p + 3, p + 3 + length)); // modified UTF-8: fine for names
        p += 3 + length;
        break;
      }
      case 3:
      case 4:
        p += 5;
        break;
      case 5:
      case 6:
        p += 9;
        i++;
        break; // 8-byte constants take two slots
      case 7:
      case 8:
      case 16:
      case 19:
      case 20:
        refs[i] = { tag, a: view.getUint16(p + 1), b: 0 };
        p += 3;
        break;
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        refs[i] = { tag, a: view.getUint16(p + 1), b: view.getUint16(p + 3) };
        p += 5;
        break;
      case 15:
        refs[i] = { tag, a: bytes[p + 1]!, b: view.getUint16(p + 2) };
        p += 4;
        break;
      default:
        throw new Error(`constant pool tag ${tag} at ${p}`);
    }
  }
  const className = (index: number) => utf8[refs[index]!.a]!;
  const stripArray = (name: string) => name.replace(/^\[+L?/, "").replace(/;$/, "");
  const info: ClassInfo = { name: "", superName: null, interfaces: [], classes: [], members: [], lambdaTypes: [] };
  refs.forEach((ref, index) => {
    if (!ref) return;
    if (ref.tag === 7) {
      const name = stripArray(className(index));
      if (name.includes("/")) info.classes.push(name);
    } else if (ref.tag === 9 || ref.tag === 10 || ref.tag === 11) {
      const nat = refs[ref.b]!;
      info.members.push({
        owner: stripArray(className(ref.a)),
        name: utf8[nat.a]!,
        descriptor: utf8[nat.b]!,
        field: ref.tag === 9,
      });
    } else if (ref.tag === 18) {
      const descriptor = utf8[refs[ref.b]!.b]!;
      const produced = /\)L([^;]+);$/.exec(descriptor);
      if (produced) info.lambdaTypes.push(produced[1]!);
    }
  });
  info.name = className(view.getUint16(p + 2));
  const superIndex = view.getUint16(p + 4);
  info.superName = superIndex ? className(superIndex) : null;
  const interfaces = view.getUint16(p + 6);
  for (let i = 0; i < interfaces; i++) info.interfaces.push(className(view.getUint16(p + 8 + i * 2)));
  return info;
}

/** The API level a class may use: minSdk, a plugin package's minSdk, or N for an `ApiN` class. */
export function allowedLevel(
  className: string,
  minSdk: number,
  packageLevels: [prefix: string, level: number][] = [],
): number {
  let level = minSdk;
  for (const [prefix, packageLevel] of packageLevels)
    if (className.startsWith(prefix)) level = Math.max(level, packageLevel);
  const simple = className.slice(className.lastIndexOf("/") + 1);
  for (const part of simple.split("$")) {
    const m = /Api(\d+)$/.exec(part);
    if (m) level = Math.max(level, Number(m[1]));
  }
  return level;
}

export interface ApiProblem {
  className: string;
  what: string;
  since: number;
  allowed: number;
}

/** Checks every class of a jar. */
export function checkApiLevels(
  jar: Uint8Array,
  api: ApiVersions,
  minSdk: number,
  packageLevels: [string, number][] = [],
): ApiProblem[] {
  const classes: ClassInfo[] = [];
  for (const entry of readZip(jar)) {
    if (!entry.name.endsWith(".class")) continue;
    const data = entry.method === 8 ? new Uint8Array(inflateRawSync(entry.data)) : entry.data;
    classes.push(readClass(data));
  }
  const own = new Map(classes.map((c) => [c.name, c]));

  /** When `member` of `owner` exists in the framework: the API that added it. */
  const memberSince = (owner: string, member: string, seen = new Set<string>()): number | undefined => {
    if (seen.has(owner)) return undefined;
    seen.add(owner);
    const framework = api.get(owner);
    if (framework) {
      const since = framework.members.get(member);
      if (since !== undefined) return since;
      for (const s of framework.supers) {
        const found = memberSince(s, member, seen);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    const app = own.get(owner);
    if (!app) return undefined;
    for (const s of [app.superName, ...app.interfaces]) {
      if (!s) continue;
      const found = memberSince(s, member, seen);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const problems: ApiProblem[] = [];
  for (const c of classes) {
    const allowed = allowedLevel(c.name, minSdk, packageLevels);
    const seen = new Set<string>();
    const report = (what: string, since: number | undefined) => {
      if (since === undefined || since <= allowed || seen.has(what)) return;
      seen.add(what);
      problems.push({ className: c.name, what, since, allowed });
    };
    const supertypes = new Set([c.superName, ...c.interfaces]);
    for (const s of supertypes) if (s) report(`supertype ${s}`, api.get(s)?.since);
    for (const name of c.classes) if (!supertypes.has(name)) report(`class ${name}`, api.get(name)?.since);
    for (const name of c.lambdaTypes) report(`lambda type ${name}`, api.get(name)?.since);
    for (const m of c.members) {
      const key = m.field ? m.name : `${m.name}${m.descriptor}`;
      report(`${m.field ? "field" : "method"} ${m.owner}.${key}`, memberSince(m.owner, key));
    }
  }
  return problems;
}

/** One line per problem, grouped by class, for a build error. */
export function formatApiProblems(problems: ApiProblem[], minSdk: number): string {
  const lines = problems
    .slice(0, 30)
    .map(
      (p) =>
        `  ${p.className.replace(/\//g, ".")}: ${p.what} needs API ${p.since} (this class may use up to ${p.allowed})`,
    );
  if (problems.length > 30) lines.push(`  … and ${problems.length - 30} more`);
  return [
    `framework APIs above the app's minSdk ${minSdk}:`,
    ...lines,
    `Move each into a class or nested object named ApiN (N = the API it needs) and call it only when Build.VERSION.SDK_INT >= N.`,
  ].join("\n");
}

/** api-versions.xml of the SDK platform that android.jar belongs to, when the SDK has it. */
export function apiVersionsFor(androidJar: string): string | null {
  const path = androidJar.replace(/android\.jar$/, "data/api-versions.xml");
  return existsSync(path) ? path : null;
}
