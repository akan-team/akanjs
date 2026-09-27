import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kotlinFeatures } from "../src/lib/native-plugins.ts";
import { shellFeatureFlags } from "../src/platforms/ios.ts";

// Architecture review stage 6: the shell's optional parts are compiled only when used, and the shell
// reaches them only through the generated flags (Capacitor #8436, #8580).

test("swiftc conditions and Kotlin constants for dev tooling and web bundle updates", () => {
  expect(shellFeatureFlags({ dev: true, updates: true })).toEqual([
    "-D",
    "AKAN_NATIVE_DEV",
    "-D",
    "AKAN_NATIVE_UPDATES",
  ]);
  expect(shellFeatureFlags({ dev: false, updates: false })).toEqual([]);
  const kotlin = kotlinFeatures({ dev: false, updates: true });
  expect(kotlin).toContain("const val DEV = false");
  expect(kotlin).toContain("const val UPDATES = true");
});

test("the iOS shell names AkanNativeUpdates and AkanNativeVectors only under their conditions", () => {
  const sources = join(import.meta.dir, "../../../native/ios/Sources");
  for (const file of ["AkanNativeApp.swift", "AkanNativeViewController.swift", "AkanNativeBridge.swift"]) {
    const text = readFileSync(join(sources, file), "utf8");
    let depth = 0;
    let condition = "";
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#if ")) depth++, (condition = trimmed.slice(4));
      else if (trimmed === "#else") condition = `!${condition}`;
      else if (trimmed === "#endif") depth--, (condition = depth ? condition : "");
      else if (/\bAkanNativeUpdates\b/.test(trimmed) && !trimmed.startsWith("//"))
        expect([file, trimmed, condition]).toEqual([file, trimmed, "AKAN_NATIVE_UPDATES"]);
      else if (/\bAkanNativeVectors\b/.test(trimmed) && !trimmed.startsWith("//") && !trimmed.startsWith("///"))
        expect([file, trimmed, condition]).toEqual([file, trimmed, "AKAN_NATIVE_DEV"]);
    }
  }
});
