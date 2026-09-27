import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { androidNameProblems, collisions, iosNameProblems, kotlinTypes, swiftTypes } from "../src/lib/names.ts";
import { dependencyProblems, resolvePlugins, unknownManifestKeys } from "../src/lib/project.ts";

// Architecture review stage 6: name and path clashes are hard errors, never renamed.

const dir = mkdtempSync(join(tmpdir(), "akan-native-names-"));
const file = (name: string, text: string, folder = "") => {
  mkdirSync(join(dir, folder), { recursive: true });
  const path = join(dir, folder, name);
  writeFileSync(path, text);
  return path;
};

describe("declarations", () => {
  test("top-level Swift types, not private ones or members", () => {
    const text = `@MainActor
final class AkanNativeBridge: NSObject {
    struct Inner {}
}
private final class Hidden {}
fileprivate struct AlsoHidden {}
public enum Mode { case a }
@available(iOS 17.0, *)
protocol Thing {}
typealias Alias = Int
extension AkanNativeBridge {}
nonisolated struct Plain {}`;
    expect(swiftTypes(text)).toEqual(["AkanNativeBridge", "Mode", "Thing", "Alias", "Plain"]);
  });

  test("a Kotlin file's package and top-level types", () => {
    const text = `package com.akanjs.plugins.x

class XPlugin(context: Ctx) : XSpec {
    private class Nested
}
private class Hidden
internal object Router
data class Row(val a: Int)
enum class Kind { A }
fun interface Callback { fun run() }`;
    expect(kotlinTypes(text)).toEqual({
      pkg: "com.akanjs.plugins.x",
      types: ["XPlugin", "Router", "Row", "Kind", "Callback"],
    });
  });

  test("collisions name both sides and how they clash", () => {
    const problems = collisions(
      [
        { name: "LocalNotifications", from: "plugin local-notifications" },
        { name: "localnotifications", from: "plugin localnotifications" },
        { name: "Local_Notifications", from: "plugin local_notifications" },
        { name: "Other", from: "x" },
      ],
      "prefixes",
    );
    expect(problems).toEqual([
      "prefixes: LocalNotifications (plugin local-notifications) and localnotifications (plugin localnotifications) are names that differ only in case",
      "prefixes: LocalNotifications (plugin local-notifications) and Local_Notifications (plugin local_notifications) are names that differ only in punctuation",
    ]);
  });
});

describe("iOS: one Swift module", () => {
  test("types, file names, prefixes and the module's own name", () => {
    const shell = file("AkanNativeBridge.swift", "final class AkanNativeBridge {}\nfinal class AkanNativeFiles {}");
    const a = file("APlugin.swift", "final class APlugin {}\nfinal class AkanNativeFiles {}\nstruct Helper {}");
    const b = file("Helper.swift", "final class BPlugin {}\nenum helper {}");
    const bindings = file("APluginSpec.swift", "struct AResult {}");
    const problems = iosNameProblems({
      module: "UIKit",
      shellSources: [shell],
      plugins: [
        { id: "a", className: "APlugin", sources: [a], frameworks: [] },
        { id: "b", className: "BPlugin", sources: [b, file("AkanNativeBridge.swift", "", "b")], frameworks: [] },
        { id: "A", className: "X", sources: [], frameworks: [] },
      ],
      generated: [bindings],
    });
    expect(problems).toContain("plugin name prefixes: A (plugin a) and A (plugin A) are the same name");
    expect(problems).toContain(
      "Swift types in the app module: AkanNativeFiles (the shell (AkanNativeBridge.swift)) and AkanNativeFiles (plugin a (APlugin.swift)) are the same name",
    );
    expect(problems).toContain(
      "Swift types in the app module: Helper (plugin a (APlugin.swift)) and helper (plugin b (Helper.swift)) are names that differ only in case",
    );
    expect(problems).toContain(
      "Swift source file names (swiftc needs them unique in a module): AkanNativeBridge.swift (the shell) and AkanNativeBridge.swift (plugin b) are the same name",
    );
    expect(problems.at(-1)).toMatch(/module "UIKit" has the name of a system module/);
  });
});

describe("Android: classes by package", () => {
  test("the same class, class files of names that differ only in case, the shell's packages", () => {
    const a = file("A.kt", "package dev.x.a\nclass APlugin\nobject Store");
    const b = file("B.kt", "package dev.x.a\nclass store\nclass BPlugin");
    const c = file("C.kt", "package dev.x.c\nobject Store"); // another package: fine
    const problems = androidNameProblems({
      plugins: [
        { id: "a", className: "dev.x.a.APlugin", sources: [a] },
        { id: "b", className: "dev.x.a.BPlugin", sources: [b] },
        { id: "c", className: "com.akanjs.runtime.CPlugin", sources: [c] },
      ],
      generated: [],
    });
    expect(problems).toEqual([
      "plugin c: android.class com.akanjs.runtime.CPlugin is in the shell's package com.akanjs.runtime",
      "Kotlin classes: dev.x.a.Store (plugin a (A.kt)) and dev.x.a.store (plugin b (B.kt)) are class files that differ only in case",
    ]);
  });
});

describe("plugin manifests", () => {
  const plugin = (id: string, extra: Record<string, unknown> = {}) => {
    const folder = join(dir, "plugins", id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "native-plugin.json"),
      JSON.stringify({ id, apiVersion: 1, methods: ["go"], events: [], ...extra }),
    );
    return folder;
  };

  test("unknown keys are errors (a typo would do nothing); a newer apiVersion asks for a newer akan-native", () => {
    expect(
      unknownManifestKeys({ id: "x", apiVersion: 1, methods: [], ios: { sources: [], clas: "X" }, permisions: [] }),
    ).toEqual(["permisions", "ios.clas"]);
    expect(() => resolvePlugins(dir, [plugin("typo", { android: { sources: [], class: "a.B", minSDK: 29 } })])).toThrow(
      /unknown keys in native-plugin.json: android.minSDK/,
    );
    expect(() => resolvePlugins(dir, [plugin("future", { apiVersion: 2 })])).toThrow(/needs a newer akan-native/);
  });

  test("dependencies: listed in the app, and native wherever the dependent is", () => {
    const base = plugin("base", { ios: { sources: [], class: "Base" }, android: "web" });
    const user = plugin("user", {
      dependencies: ["base"],
      ios: { sources: [], class: "User" },
      android: { sources: [], class: "a.User" },
    });
    expect(() => resolvePlugins(dir, [user])).toThrow(/needs plugin "base": add it to the app's plugins/);
    const plugins = resolvePlugins(dir, [base, user]);
    expect(dependencyProblems(plugins, "ios")).toEqual([]);
    expect(dependencyProblems(plugins, "android")).toEqual([
      "plugin user needs the native part of plugin base, which has none on android",
    ]);
    expect(dependencyProblems(plugins, "web")).toEqual([]);
  });
});
