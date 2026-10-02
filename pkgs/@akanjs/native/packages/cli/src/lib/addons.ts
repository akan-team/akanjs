// The native addons a desktop app's server carries (CLI-9): a `.node` file the app cannot load on a user's
// computer fails there at the first require, long after the build looked fine. Two things make that
// certain and stop the build: a package with no binary for the target OS and CPU, and a binary that
// links a library by an absolute path outside the system (a ROS install under /opt, Homebrew's prefix),
// and a package with a binding.gyp whose install never compiled it.
// A binary node-gyp compiled at install is only a warning: it runs here, and may run elsewhere.
// The headers are read here rather than with otool or readelf, so every OS checks every format.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export type AddonOs = "macos" | "windows" | "linux";
export type AddonArch = "arm64" | "x64";

export interface BinaryInfo {
  format: "mach-o" | "elf" | "pe";
  /** Every architecture the file holds (a fat Mach-O holds several). */
  archs: (AddonArch | "other")[];
  /** Libraries it loads by an absolute path, and the absolute search paths it names (rpath, runpath). */
  absoluteLinks: string[];
}

export interface AddonReport {
  problems: string[];
  warnings: string[];
}

const FORMAT: Record<AddonOs, BinaryInfo["format"]> = { macos: "mach-o", windows: "pe", linux: "elf" };

/** What a desktop build refuses and what it warns about in `serverDir`'s `.node` files, by package. */
export function addonReport(serverDir: string, os: AddonOs, arch: AddonArch): AddonReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const byPackage = new Map<string, string[]>();
  const files = listFiles(serverDir);
  for (const file of files.filter((f) => f.endsWith(".node"))) {
    const root = packageRoot(serverDir, file);
    byPackage.set(root, [...(byPackage.get(root) ?? []), file]);
  }
  //? Bun runs no install script of a package the app does not trust, so node-gyp never built it: it throws at require.
  for (const gyp of files.filter((f) => f.endsWith(`${sep}binding.gyp`))) {
    const root = dirname(gyp);
    if (packageRoot(serverDir, gyp) !== root || byPackage.has(root)) continue;
    problems.push(
      `${shown(serverDir, root)}: a native addon (binding.gyp) with no compiled binary; its install script did not run (add it to trustedDependencies) or it cannot build here`,
    );
  }
  for (const [root, files] of [...byPackage].sort(([a], [b]) => a.localeCompare(b))) {
    const name = shown(serverDir, root);
    const loadable = files.flatMap((file) => {
      const info = binaryInfo(readFileSync(file));
      return info && info.format === FORMAT[os] && info.archs.includes(arch) ? [{ file, info }] : [];
    });
    if (!loadable.length) {
      const found = files.map((file) => describeBinary(binaryInfo(readFileSync(file)))).join(", ");
      problems.push(`${name}: no ${os}-${arch} binary (has ${found}); install it for that platform or drop it`);
      continue;
    }
    for (const { file, info } of loadable)
      for (const link of info.absoluteLinks.filter((l) => !systemPath(os, l)))
        problems.push(
          `${shown(serverDir, file)} links ${link}, which a user's computer does not have: bundle the library or drop the addon`,
        );
    const compiled = existsSync(join(root, "binding.gyp")) && loadable.every(({ file }) => isBuildOutput(root, file));
    if (compiled)
      warnings.push(
        `${name} was compiled on this computer at install (binding.gyp, no prebuilt binary): check that it runs on a computer with nothing else installed`,
      );
  }
  return { problems: problems.sort(), warnings: warnings.sort() };
}

/** A path inside the server as the report names it: relative, `/`-separated on every OS. */
const shown = (base: string, path: string) => relative(base, path).split(sep).join("/") || ".";

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((file) => join(dir, file))
    .filter((file) => statSync(file).isFile());
}

/** The folder of the package a file belongs to: the deepest node_modules/<name> (or <@scope>/<name>) above it. */
export function packageRoot(base: string, file: string): string {
  const parts = relative(base, file).split(sep);
  const at = parts.lastIndexOf("node_modules");
  if (at < 0) return base;
  const width = parts[at + 1]?.startsWith("@") ? 3 : 2;
  return join(base, ...parts.slice(0, at + width));
}

function isBuildOutput(root: string, file: string): boolean {
  return relative(root, file).split(sep)[0] === "build";
}

function systemPath(os: AddonOs, path: string): boolean {
  if (os === "macos") return path.startsWith("/usr/lib/") || path.startsWith("/System/Library/");
  return /^\/(usr\/)?lib(64)?(\/|$)/.test(path);
}

function describeBinary(info: BinaryInfo | null): string {
  if (!info) return "an unknown file";
  const os = info.format === "mach-o" ? "macos" : info.format === "elf" ? "linux" : "windows";
  return `${os}-${info.archs.join("+")}`;
}

/** The format, CPUs and absolute links of a Mach-O, ELF or PE file; null for anything else. */
export function binaryInfo(bytes: Buffer): BinaryInfo | null {
  if (bytes.length < 64) return null;
  if (bytes.readUInt32BE(0) === 0x7f454c46) return elfInfo(bytes);
  if (bytes.readUInt16LE(0) === 0x5a4d) return peInfo(bytes);
  const magic = bytes.readUInt32LE(0);
  if (magic === 0xfeedfacf || magic === 0xfeedface) return machoInfo([machoSlice(bytes, 0)]);
  if (bytes.readUInt32BE(0) === 0xcafebabe) {
    const count = bytes.readUInt32BE(4);
    //? A Java class file starts with 0xcafebabe too; its next word is the class version (45 and up).
    if (count === 0 || count >= 45) return null;
    const slices = Array.from({ length: count }, (_, i) => {
      const at = 8 + i * 20;
      return machoSlice(
        bytes.subarray(bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 8) + bytes.readUInt32BE(at + 12)),
        0,
      );
    });
    return machoInfo(slices);
  }
  return null;
}

const MACHO_CPU: Record<number, AddonArch> = { 16777223: "x64", 16777228: "arm64" };
const LC_LOAD_DYLIB = 0xc;
const LC_LOAD_WEAK_DYLIB = 0x80000018;
const LC_REEXPORT_DYLIB = 0x8000001f;
const LC_RPATH = 0x8000001c;

interface MachoSlice {
  arch: AddonArch | "other";
  links: string[];
}

function machoSlice(bytes: Buffer, at: number): MachoSlice {
  const is64 = bytes.readUInt32LE(at) === 0xfeedfacf;
  const arch = MACHO_CPU[bytes.readUInt32LE(at + 4)] ?? "other";
  const count = bytes.readUInt32LE(at + 16);
  let offset = at + (is64 ? 32 : 28);
  const links: string[] = [];
  for (let i = 0; i < count && offset + 8 <= bytes.length; i++) {
    const cmd = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    if (size < 8) break;
    if (cmd === LC_LOAD_DYLIB || cmd === LC_LOAD_WEAK_DYLIB || cmd === LC_REEXPORT_DYLIB || cmd === LC_RPATH) {
      const name = cString(bytes, offset + bytes.readUInt32LE(offset + 8), offset + size);
      if (name.startsWith("/")) links.push(name);
    }
    offset += size;
  }
  return { arch, links };
}

function machoInfo(slices: MachoSlice[]): BinaryInfo {
  return {
    format: "mach-o",
    archs: slices.map((s) => s.arch),
    absoluteLinks: [...new Set(slices.flatMap((s) => s.links))],
  };
}

const ELF_MACHINE: Record<number, AddonArch> = { 62: "x64", 183: "arm64" };
const PT_LOAD = 1;
const PT_DYNAMIC = 2;
const DT_STRTAB = 5;
const DT_RPATH = 15;
const DT_RUNPATH = 29;

function elfInfo(bytes: Buffer): BinaryInfo {
  const arch = ELF_MACHINE[bytes.readUInt16LE(18)] ?? "other";
  //? 64-bit little-endian only: the desktops akan-native builds for (x86-64 and aarch64 Linux).
  if (bytes[4] !== 2 || bytes[5] !== 1) return { format: "elf", archs: [arch], absoluteLinks: [] };
  const phoff = Number(bytes.readBigUInt64LE(32));
  const phentsize = bytes.readUInt16LE(54);
  const phnum = bytes.readUInt16LE(56);
  const loads: { vaddr: number; offset: number; size: number }[] = [];
  let dynamic: { offset: number; size: number } | null = null;
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (at + 56 > bytes.length) break;
    const type = bytes.readUInt32LE(at);
    const offset = Number(bytes.readBigUInt64LE(at + 8));
    const vaddr = Number(bytes.readBigUInt64LE(at + 16));
    const size = Number(bytes.readBigUInt64LE(at + 32));
    if (type === PT_LOAD) loads.push({ vaddr, offset, size });
    if (type === PT_DYNAMIC) dynamic = { offset, size };
  }
  if (!dynamic) return { format: "elf", archs: [arch], absoluteLinks: [] };
  const entries: { tag: number; value: number }[] = [];
  for (let at = dynamic.offset; at + 16 <= dynamic.offset + dynamic.size && at + 16 <= bytes.length; at += 16) {
    const tag = Number(bytes.readBigInt64LE(at));
    if (tag === 0) break;
    entries.push({ tag, value: Number(bytes.readBigUInt64LE(at + 8)) });
  }
  const strtab = entries.find((e) => e.tag === DT_STRTAB)?.value;
  const load = strtab === undefined ? undefined : loads.find((l) => strtab >= l.vaddr && strtab < l.vaddr + l.size);
  if (strtab === undefined || !load) return { format: "elf", archs: [arch], absoluteLinks: [] };
  const base = strtab - load.vaddr + load.offset;
  const paths = entries
    .filter((e) => e.tag === DT_RPATH || e.tag === DT_RUNPATH)
    .flatMap((e) => cString(bytes, base + e.value, bytes.length).split(":"))
    .filter((p) => p.startsWith("/"));
  return { format: "elf", archs: [arch], absoluteLinks: [...new Set(paths)] };
}

const PE_MACHINE: Record<number, AddonArch> = { 34404: "x64", 43620: "arm64" };

function peInfo(bytes: Buffer): BinaryInfo | null {
  const at = bytes.readUInt32LE(0x3c);
  if (at + 6 > bytes.length || bytes.readUInt32BE(at) !== 0x50450000) return null;
  return { format: "pe", archs: [PE_MACHINE[bytes.readUInt16LE(at + 4)] ?? "other"], absoluteLinks: [] };
}

function cString(bytes: Buffer, start: number, end: number): string {
  const stop = bytes.indexOf(0, start);
  return bytes.toString("utf8", start, stop < 0 || stop > end ? end : stop);
}
