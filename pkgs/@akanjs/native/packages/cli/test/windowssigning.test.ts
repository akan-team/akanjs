import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SigningError } from "../src/lib/prepare.ts";
import {
  DEFAULT_TIMESTAMP_URL,
  peFiles,
  signerCommand,
  signtoolArgs,
  windowsSigningFromEnv,
} from "../src/lib/windowssigning.ts";

// CLI-9: Authenticode for a Windows release.

describe("Windows signing", () => {
  test("signtool signs SHA-256 with a timestamp, by a .pfx or a store thumbprint", () => {
    expect(signtoolArgs({ certificate: { path: "C:\\c.pfx", password: "pw" } }, ["a.exe", "b.dll"], "Board")).toEqual([
      "sign",
      "/fd",
      "sha256",
      "/tr",
      DEFAULT_TIMESTAMP_URL,
      "/td",
      "sha256",
      "/d",
      "Board",
      "/f",
      "C:\\c.pfx",
      "/p",
      "pw",
      "a.exe",
      "b.dll",
    ]);
    expect(signtoolArgs({ thumbprint: "AB12", timestampUrl: "http://ts.example" }, ["a.exe"], "Board")).toEqual([
      "sign",
      "/fd",
      "sha256",
      "/tr",
      "http://ts.example",
      "/td",
      "sha256",
      "/d",
      "Board",
      "/sha1",
      "AB12",
      "a.exe",
    ]);
    expect(() => signtoolArgs({}, ["a.exe"], "Board")).toThrow(SigningError);
  });

  test("another signer runs once per file, the file where it says {file} or last", () => {
    expect(signerCommand(["signtool", "sign", "/dlib", "Azure.CodeSigning.Dlib.dll", "{file}"], "a.exe")).toEqual([
      "signtool",
      "sign",
      "/dlib",
      "Azure.CodeSigning.Dlib.dll",
      "a.exe",
    ]);
    expect(signerCommand(["hsm-sign", "--in"], "a.exe")).toEqual(["hsm-sign", "--in", "a.exe"]);
  });

  test("every PE file is signed, whatever its name, and nothing else", () => {
    const root = mkdtempSync(join(tmpdir(), "akan-pe-"));
    mkdirSync(join(root, "resources", "server", "node_modules", "x"), { recursive: true });
    const pe = Buffer.alloc(64);
    pe.writeUInt16LE(0x5a4d, 0);
    writeFileSync(join(root, "board.exe"), pe);
    writeFileSync(join(root, "resources", "server", "node_modules", "x", "addon.node"), pe);
    writeFileSync(join(root, "resources", "server", "main.js"), "console.info(1)");
    expect(
      peFiles(root)
        .map((f) => f.slice(root.length + 1).replaceAll("\\", "/"))
        .sort(),
    ).toEqual(["board.exe", "resources/server/node_modules/x/addon.node"]);
  });

  test("the command line's settings come from AKAN_NATIVE_WINDOWS_*", () => {
    expect(windowsSigningFromEnv({})).toBeUndefined();
    expect(
      windowsSigningFromEnv({
        AKAN_NATIVE_WINDOWS_CERTIFICATE: "C:\\c.pfx",
        AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD: "pw",
        AKAN_NATIVE_WINDOWS_TIMESTAMP_URL: "http://ts.example",
      }),
    ).toEqual({ certificate: { path: "C:\\c.pfx", password: "pw" }, timestampUrl: "http://ts.example" });
    expect(windowsSigningFromEnv({ AKAN_NATIVE_WINDOWS_THUMBPRINT: "ab 12" })).toEqual({ thumbprint: "ab12" });
    expect(windowsSigningFromEnv({ AKAN_NATIVE_WINDOWS_SIGN_COMMAND: '["signer", "{file}"]' })).toEqual({
      command: ["signer", "{file}"],
    });
    expect(() => windowsSigningFromEnv({ AKAN_NATIVE_WINDOWS_SIGN_COMMAND: "signer {file}" })).toThrow(/JSON array/);
    expect(() => windowsSigningFromEnv({ AKAN_NATIVE_WINDOWS_CERTIFICATE: "C:\\c.pfx" })).toThrow(/PASSWORD/);
  });
});
