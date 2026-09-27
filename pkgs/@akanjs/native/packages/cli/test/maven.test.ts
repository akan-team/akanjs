import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileEntry, writeZip } from "../src/lib/apk.ts";
import {
  closureFor,
  embeddedNotices,
  fetchArtifact,
  licenseNotices,
  loadMavenLock,
  type MavenArtifact,
  unpackLibrary,
} from "../src/lib/maven.ts";

// akanjs readiness O8: the pinned closures and what a build does with them.

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const enc = (s: string) => new TextEncoder().encode(s);

describe("maven lock", () => {
  const lock = loadMavenLock();

  test("one closure per root set: FCM, Billing, both; the kotlin-stdlib family is left out", () => {
    expect(closureFor(lock, [])).toBeNull();
    const fcm = closureFor(lock, ["com.google.firebase:firebase-messaging:25.1.3", "androidx.core:core:1.10.0"])!;
    const both = closureFor(lock, [
      "com.android.billingclient:billing:9.1.0",
      "com.google.firebase:firebase-messaging:25.1.3",
      "androidx.core:core:1.10.0",
    ])!;
    expect([fcm.name, both.name]).toEqual(["fcm", "union"]);
    //? play-services-basement 18.9.0 calls androidx.core's PendingIntentCompat, added in core 1.10.0; R8 stops without it.
    expect(
      fcm.artifacts.filter((a) => a.coordinate.startsWith("androidx.core:core:")).map((a) => a.coordinate),
    ).toEqual(["androidx.core:core:1.10.0"]);
    expect(both.artifacts.some((a) => a.coordinate.startsWith("org.jetbrains.kotlin:kotlin-stdlib"))).toBe(false);
    expect(both.artifacts.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && a.url.startsWith("https://"))).toBe(true);
    expect(() => closureFor(lock, ["com.example:other:1.0"])).toThrow(/no locked Maven closure/);
  });

  test("every locked artifact has its POM pinned and the licenses it declares (scripts/maven-licenses.ts)", () => {
    for (const [coord, a] of Object.entries(lock.artifacts)) {
      expect([coord, /^[0-9a-f]{64}$/.test(a.pom?.sha256 ?? "")]).toEqual([coord, true]);
      expect([coord, (a.licenses ?? []).length > 0]).toEqual([coord, true]);
    }
  });
});

describe("fetching and unpacking", () => {
  const cache = mkdtempSync(join(tmpdir(), "akan-native-maven-"));
  const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.lib"><application /></manifest>`;
  const classes = writeZip([
    fileEntry("com/example/Lib.class", enc("cafebabe"), false),
    fileEntry("META-INF/services/com.example.Service", enc("com.example.Impl\n"), false),
  ]);
  const aar = writeZip([
    fileEntry("AndroidManifest.xml", enc(manifest), false),
    fileEntry("classes.jar", classes, true),
    fileEntry("R.txt", enc("int string lib_name 0x7f010001\n"), false),
    fileEntry("res/values/values.xml", enc("<resources />"), false),
    fileEntry("proguard.txt", enc("-keep class com.example.Lib"), false),
    fileEntry("jni/arm64-v8a/libx.so", enc("ELF"), true),
  ]);
  const artifact: MavenArtifact = {
    coordinate: "com.example:lib:1.0",
    url: "https://example.invalid/lib-1.0.aar",
    sha256: sha(aar),
    size: aar.length,
    packaging: "aar",
  };

  test("a download is checked against its SHA-256 before it is cached", async () => {
    const bad = { ...artifact, sha256: "0".repeat(64) };
    await expect(fetchArtifact(bad, cache, (async () => new Response(Buffer.from(aar))) as never)).rejects.toThrow(
      /checksum mismatch/,
    );
    const file = await fetchArtifact(artifact, cache, (async () => new Response(Buffer.from(aar))) as never);
    expect(sha(new Uint8Array(readFileSync(file)))).toBe(artifact.sha256);
    // cached: no second download
    expect(
      await fetchArtifact(artifact, cache, (async () => {
        throw new Error("no network needed");
      }) as never),
    ).toBe(file);
  });

  test("notices built into an AAR, merged by name with the POM licenses", () => {
    const text = enc("\n\nLib A:\nMIT text\n\nLib B:\nApache text\n");
    const index = enc(JSON.stringify({ "Lib A": { start: 9, length: 8 }, "Lib B": { start: 26, length: 11 } }));
    const withNotices = writeZip([
      fileEntry("third_party_licenses.json", index, false),
      fileEntry("third_party_licenses.txt", text, true),
    ]);
    expect(embeddedNotices(withNotices)).toEqual([
      { name: "Lib A", text: "MIT text" },
      { name: "Lib B", text: "Apache text" },
    ]);
    expect(embeddedNotices(writeZip([fileEntry("classes.jar", enc("x"), false)]))).toEqual([]);
    const lib = (coordinate: string, notices: { name: string; text: string }[]) =>
      ({
        coordinate,
        licenses: [{ name: "Apache 2.0", url: "http://www.apache.org/licenses/LICENSE-2.0.txt" }],
        notices,
      }) as never;
    const out = licenseNotices([
      lib("com.b:y:2.0", [{ name: "Lib A", text: "first" }]),
      lib("com.a:x:1.0", [
        { name: "Lib A", text: "second" },
        { name: "Kotlin", text: "k" },
      ]),
    ]);
    expect(out.libraries.map((l) => `${l.name} ${l.version}`)).toEqual(["com.a:x 1.0", "com.b:y 2.0"]);
    expect(out.notices).toEqual([
      { name: "Kotlin", text: "k" },
      { name: "Lib A", text: "first" },
    ]);
  });

  test("an AAR unpacks into classes, manifest, resources, rules, native libraries and service files", async () => {
    const file = await fetchArtifact(artifact, cache, (async () => new Response(Buffer.from(aar))) as never);
    const lib = unpackLibrary(artifact, file, cache);
    expect(lib.package).toBe("com.example.lib");
    expect(lib.hasResources).toBe(true);
    expect(existsSync(lib.classes) && existsSync(lib.res!) && existsSync(lib.proguard!)).toBe(true);
    expect(lib.nativeLibs.map((n) => `${n.abi}/${n.name}`)).toEqual(["arm64-v8a/libx.so"]);
    expect(lib.services.map((s) => s.name)).toEqual(["com.example.Service"]);
    expect(readFileSync(lib.services[0]!.path, "utf8")).toBe("com.example.Impl\n");
  });
});
