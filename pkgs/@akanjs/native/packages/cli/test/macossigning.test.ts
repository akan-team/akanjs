import { describe, expect, test } from "bun:test";
import {
  appEntitlements,
  codesignArgs,
  identityKind,
  macosDistributionFromEnv,
  notaryLogIssues,
  notarytoolAuth,
  parseSubmission,
  pickMacosIdentity,
  RUNTIME_ENTITLEMENTS,
} from "../src/lib/macossigning.ts";
import { SigningError } from "../src/lib/prepare.ts";

// CLI-9: Developer ID signing, the hardened runtime and notarization on macOS.

const developerId = { hash: "A".repeat(40), name: "Developer ID Application: Example Co (ABCDE12345)" };
const development = { hash: "B".repeat(40), name: "Apple Development: dev@example.com (FGHIJ67890)" };

describe("macOS distribution signing", () => {
  test("a certificate's kind and team come from its name", () => {
    expect(identityKind(developerId.name)).toEqual({ kind: "distribution", teamId: "ABCDE12345" });
    expect(identityKind(development.name)).toEqual({ kind: "development" });
    expect(identityKind("akan-native dev: someone")).toEqual({ kind: "identity" });
  });

  test("an identity is picked by its name or its SHA-1, and a missing one lists what there is", () => {
    expect(pickMacosIdentity([developerId, development], developerId.name)).toBe(developerId);
    expect(pickMacosIdentity([developerId, development], "b".repeat(40))).toBe(development);
    expect(() => pickMacosIdentity([development], developerId.name)).toThrow(SigningError);
    expect(() => pickMacosIdentity([developerId, { ...developerId, hash: "C".repeat(40) }], developerId.name)).toThrow(
      /several valid identities/,
    );
  });

  test("the hardened app gets the runtime's entitlements, the usage texts' and the app's own last", () => {
    expect(
      appEntitlements(
        { NSCameraUsageDescription: "Scan.", NSMicrophoneUsageDescription: "Talk.", CFBundleName: "x" },
        { "com.apple.security.cs.disable-library-validation": true },
      ),
    ).toEqual({
      ...RUNTIME_ENTITLEMENTS,
      "com.apple.security.device.camera": true,
      "com.apple.security.device.audio-input": true,
      "com.apple.security.cs.disable-library-validation": true,
    });
    expect(appEntitlements({}, { "com.apple.security.cs.allow-jit": false })["com.apple.security.cs.allow-jit"]).toBe(
      false,
    );
  });

  test("a team signature takes the runtime and a timestamp; ad hoc and a disk image do not run hardened", () => {
    const team = { sign: developerId.hash, name: developerId.name, kind: "distribution" as const, keychain: "/k" };
    expect(codesignArgs(team, "/a.app", { hardened: true, entitlements: "/e.plist" })).toEqual([
      "codesign",
      "--force",
      "--sign",
      developerId.hash,
      "--keychain",
      "/k",
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      "/e.plist",
      "/a.app",
    ]);
    expect(codesignArgs(team, "/a.dmg", { hardened: false, timestamp: true })).toEqual([
      "codesign",
      "--force",
      "--sign",
      developerId.hash,
      "--keychain",
      "/k",
      "--timestamp",
      "/a.dmg",
    ]);
    expect(codesignArgs({ sign: "-", name: "ad-hoc", kind: "adhoc" }, "/a.app", { hardened: true })).toEqual([
      "codesign",
      "--force",
      "--sign",
      "-",
      "/a.app",
    ]);
  });

  test("notarytool authenticates with an API key or a keychain profile, and refuses neither", () => {
    expect(notarytoolAuth({ key: "/AuthKey_X.p8", keyId: "X", issuer: "I" })).toEqual([
      "--key",
      "/AuthKey_X.p8",
      "--key-id",
      "X",
      "--issuer",
      "I",
    ]);
    expect(notarytoolAuth({ profile: "akan" })).toEqual(["--keychain-profile", "akan"]);
    expect(() => notarytoolAuth({ key: "/AuthKey_X.p8" })).toThrow(SigningError);
  });

  test("a notarytool verdict and the issues of its log are read from their JSON", () => {
    expect(parseSubmission('{"id":"1","status":"Invalid","message":"Processing complete"}')).toEqual({
      id: "1",
      status: "Invalid",
      message: "Processing complete",
    });
    expect(parseSubmission("not json")).toEqual({});
    expect(
      notaryLogIssues(
        JSON.stringify({
          issues: [
            {
              path: "a.zip/A.app/Contents/MacOS/a",
              message: "The binary is not signed with a valid Developer ID certificate.",
            },
          ],
        }),
      ),
    ).toEqual(["a.zip/A.app/Contents/MacOS/a: The binary is not signed with a valid Developer ID certificate."]);
    expect(notaryLogIssues('{"issues":null}')).toEqual([]);
  });

  test("the command line's settings come from AKAN_NATIVE_MACOS_*", () => {
    expect(macosDistributionFromEnv({})).toEqual({});
    expect(
      macosDistributionFromEnv({
        AKAN_NATIVE_MACOS_CERTIFICATE: "/cert.p12",
        AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD: "secret",
        AKAN_NATIVE_MACOS_NOTARY_KEY: "/AuthKey_X.p8",
        AKAN_NATIVE_MACOS_NOTARY_KEY_ID: "X",
        AKAN_NATIVE_MACOS_NOTARY_ISSUER: "I",
      }),
    ).toEqual({
      signing: { certificate: { path: "/cert.p12", password: "secret" } },
      notarize: { key: "/AuthKey_X.p8", keyId: "X", issuer: "I" },
    });
    expect(
      macosDistributionFromEnv({ AKAN_NATIVE_MACOS_IDENTITY: developerId.name, AKAN_NATIVE_MACOS_NOTARY_PROFILE: "p" }),
    ).toEqual({ signing: { identity: developerId.name }, notarize: { profile: "p" } });
    expect(() => macosDistributionFromEnv({ AKAN_NATIVE_MACOS_CERTIFICATE: "/cert.p12" })).toThrow(/PASSWORD/);
    expect(() => macosDistributionFromEnv({ AKAN_NATIVE_MACOS_NOTARY_KEY: "/k.p8" })).toThrow(/KEY_ID/);
  });
});
