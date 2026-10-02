import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { addonReport, binaryInfo, packageRoot } from "../src/lib/addons.ts";

// CLI-9: the server's native addons must load on a user's computer.

const LC_LOAD_DYLIB = 0xc;
const LC_RPATH = 0x8000001c;

/** A 64-bit thin Mach-O with load commands naming `paths` (dylibs, then rpaths). */
function macho(cpu: "arm64" | "x64", dylibs: string[] = [], rpaths: string[] = []): Buffer {
  const commands = [
    ...dylibs.map((p) => command(LC_LOAD_DYLIB, 24, p)),
    ...rpaths.map((p) => command(LC_RPATH, 12, p)),
  ];
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(cpu === "arm64" ? 0x0100000c : 0x01000007, 4);
  header.writeUInt32LE(commands.length, 16);
  return pad(Buffer.concat([header, ...commands]));
}

function command(cmd: number, nameOffset: number, name: string): Buffer {
  const size = Math.ceil((nameOffset + name.length + 1) / 8) * 8;
  const out = Buffer.alloc(size);
  out.writeUInt32LE(cmd, 0);
  out.writeUInt32LE(size, 4);
  out.writeUInt32LE(nameOffset, 8);
  out.write(name, nameOffset, "utf8");
  return out;
}

/** A 64-bit little-endian ELF with one PT_LOAD, a PT_DYNAMIC and a DT_RUNPATH of `runpath`. */
function elf(machine: number, runpath?: string): Buffer {
  const strtab = Buffer.from(`\0${runpath ?? ""}\0`);
  const phoff = 64;
  const dynOff = phoff + 2 * 56;
  const dynamic = Buffer.alloc(16 * 3);
  dynamic.writeBigInt64LE(5n, 0);
  dynamic.writeBigUInt64LE(BigInt(dynOff + dynamic.length), 8);
  if (runpath) {
    dynamic.writeBigInt64LE(29n, 16);
    dynamic.writeBigUInt64LE(1n, 24);
  }
  const header = Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46, 0);
  header[4] = 2;
  header[5] = 1;
  header.writeUInt16LE(machine, 18);
  header.writeBigUInt64LE(BigInt(phoff), 32);
  header.writeUInt16LE(56, 54);
  header.writeUInt16LE(2, 56);
  const ph = Buffer.alloc(112);
  const total = dynOff + dynamic.length + strtab.length;
  ph.writeUInt32LE(1, 0);
  ph.writeBigUInt64LE(0n, 8);
  ph.writeBigUInt64LE(0n, 16);
  ph.writeBigUInt64LE(BigInt(total), 32);
  ph.writeUInt32LE(2, 56);
  ph.writeBigUInt64LE(BigInt(dynOff), 64);
  ph.writeBigUInt64LE(BigInt(dynOff), 72);
  ph.writeBigUInt64LE(BigInt(dynamic.length), 88);
  return Buffer.concat([header, ph, dynamic, strtab]);
}

function pe(machine: number): Buffer {
  const out = Buffer.alloc(128);
  out.writeUInt16LE(0x5a4d, 0);
  out.writeUInt32LE(64, 0x3c);
  out.writeUInt32BE(0x50450000, 64);
  out.writeUInt16LE(machine, 68);
  return out;
}

const pad = (bytes: Buffer) => Buffer.concat([bytes, Buffer.alloc(Math.max(0, 64 - bytes.length))]);

function put(root: string, file: string, bytes: Buffer | string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), bytes);
}

describe("native addons", () => {
  test("reads the format, CPUs and absolute links of Mach-O, ELF and PE files", () => {
    expect(
      binaryInfo(macho("arm64", ["/usr/lib/libSystem.B.dylib", "@rpath/librcl.dylib"], ["/opt/ros/humble/lib"])),
    ).toEqual({
      format: "mach-o",
      archs: ["arm64"],
      absoluteLinks: ["/usr/lib/libSystem.B.dylib", "/opt/ros/humble/lib"],
    });
    expect(binaryInfo(elf(0x3e, "/opt/ros/humble/lib:$ORIGIN/../lib"))).toEqual({
      format: "elf",
      archs: ["x64"],
      absoluteLinks: ["/opt/ros/humble/lib"],
    });
    expect(binaryInfo(elf(0xb7))).toEqual({ format: "elf", archs: ["arm64"], absoluteLinks: [] });
    expect(binaryInfo(pe(0x8664))).toEqual({ format: "pe", archs: ["x64"], absoluteLinks: [] });
    expect(binaryInfo(Buffer.from("module.exports = 1;".padEnd(80)))).toBeNull();
  });

  test("reads this machine's Bun as the executable it is", () => {
    const info = binaryInfo(readFileSync(process.execPath));
    expect(info?.archs).toContain(process.arch === "arm64" ? "arm64" : "x64");
  });

  test("an addon belongs to the deepest package above it, a scoped one included", () => {
    const base = join(tmpdir(), "s");
    expect(packageRoot(base, join(base, "node_modules/a/node_modules/@img/sharp/build/Release/x.node"))).toBe(
      join(base, "node_modules/a/node_modules/@img/sharp"),
    );
    expect(packageRoot(base, join(base, "addon.node"))).toBe(base);
  });

  test("refuses a package with no binary for the target and a link outside the system, and warns of one compiled here", () => {
    const root = mkdtempSync(join(tmpdir(), "akan-addons-"));
    put(root, "node_modules/prebuilt/prebuilds/darwin-arm64/a.node", macho("arm64", ["/usr/lib/libc++.1.dylib"]));
    put(root, "node_modules/prebuilt/prebuilds/linux-x64/a.node", elf(0x3e));
    put(root, "node_modules/@scope/linux-only/a.node", elf(0x3e));
    put(root, "node_modules/rclnodejs/binding.gyp", "{}");
    put(root, "node_modules/rclnodejs/build/Release/rclnodejs.node", macho("arm64", [], ["/opt/ros/humble/lib"]));
    put(root, "node_modules/compiled/binding.gyp", "{}");
    put(root, "node_modules/compiled/build/Release/c.node", macho("arm64"));
    put(root, "node_modules/unbuilt/binding.gyp", "{}");
    put(root, "node_modules/unbuilt/src/addon.cc", "");

    const report = addonReport(root, "macos", "arm64");
    expect(report.problems).toEqual([
      "node_modules/@scope/linux-only: no macos-arm64 binary (has linux-x64); install it for that platform or drop it",
      "node_modules/rclnodejs/build/Release/rclnodejs.node links /opt/ros/humble/lib, which a user's computer does not have: bundle the library or drop the addon",
      "node_modules/unbuilt: a native addon (binding.gyp) with no compiled binary; its install script did not run (add it to trustedDependencies) or it cannot build here",
    ]);
    expect(report.warnings).toEqual([
      expect.stringContaining("node_modules/compiled was compiled on this computer"),
      expect.stringContaining("node_modules/rclnodejs was compiled on this computer"),
    ]);
    expect(addonReport(root, "macos", "x64").problems).toContainEqual(
      "node_modules/prebuilt: no macos-x64 binary (has macos-arm64, linux-x64); install it for that platform or drop it",
    );
  });
});
