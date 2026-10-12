import { describe, expect, test } from "bun:test";
import { requestedDistribution } from "../src/lib/distribution.ts";

const macosEnv = {
  AKAN_NATIVE_MACOS_IDENTITY: "Developer ID Application: Akan (TEAM123)",
  AKAN_NATIVE_MACOS_NOTARY_PROFILE: "akan-notary",
  HOME: "/Users/someone",
};

describe("requestedDistribution", () => {
  test("signs nothing and uploads nothing the command did not ask for, whatever the env holds", () => {
    const plain = requestedDistribution("macos", "release", {}, macosEnv);
    expect(plain).toEqual({
      notice: null,
      unused: ["AKAN_NATIVE_MACOS_IDENTITY", "AKAN_NATIVE_MACOS_NOTARY_PROFILE"],
    });
  });

  test("--sign signs with the env's identity and says nothing is uploaded; --notarize names Apple's service", () => {
    const signed = requestedDistribution("macos", "release", { sign: true }, macosEnv);
    expect(signed.macos).toEqual({ signing: { identity: macosEnv.AKAN_NATIVE_MACOS_IDENTITY } });
    expect(signed.notice).toBe(
      "Signs the macOS app as Developer ID Application: Akan (TEAM123); nothing is uploaded without --notarize.",
    );
    const notarized = requestedDistribution("macos", "release", { sign: true, notarize: true }, macosEnv);
    expect(notarized.macos?.notarize).toEqual({ profile: "akan-notary" });
    expect(notarized.notice).toBe(
      "Signs the macOS app as Developer ID Application: Akan (TEAM123) and uploads it to Apple's notary service (notarytool profile akan-notary).",
    );
  });

  test("a Windows signing command is named as one that may send the files away", () => {
    const env = { AKAN_NATIVE_WINDOWS_SIGN_COMMAND: JSON.stringify(["/opt/trusted-signing/sign", "{file}"]) };
    expect(requestedDistribution("windows", "release", { sign: true }, env).notice).toBe(
      "Signs the Windows app with the signing command sign, which may send each file to its signing service.",
    );
  });

  test("refuses what cannot be what was asked", () => {
    expect(() => requestedDistribution("macos", "release", { notarize: true }, macosEnv)).toThrow("takes --sign");
    expect(() => requestedDistribution("macos", "debug", { sign: true }, macosEnv)).toThrow("release build");
    expect(() => requestedDistribution("windows", "release", { sign: true, notarize: true }, {})).toThrow("Apple's");
    expect(() => requestedDistribution("linux", "release", { sign: true }, {})).toThrow("macOS or Windows");
    expect(() => requestedDistribution("macos", "release", { sign: true }, {})).toThrow("needs the identity");
    expect(() =>
      requestedDistribution("macos", "release", { sign: true, notarize: true }, { AKAN_NATIVE_MACOS_IDENTITY: "x" }),
    ).toThrow("needs the credentials");
  });
});
