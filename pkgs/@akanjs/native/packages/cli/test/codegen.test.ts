import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildModel,
  generateKotlin,
  generateSwift,
  kotlinStub,
  specProblems,
  swiftStub,
  untypedMembers,
} from "../src/lib/codegen.ts";
import type { PluginManifest } from "../src/lib/project.ts";
import { type PluginSpec, parseDeclarations, readPluginSpec } from "../src/lib/spec.ts";

const PLUGINS = join(import.meta.dir, "../../../plugins");

function specOf(source: string, extra: Record<string, string> = {}): PluginSpec {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-spec-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/index.ts"), source);
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, "src", name), text);
  return readPluginSpec(dir);
}

describe("spec parser (PL-10)", () => {
  test("reads the TypeScript subset plugin APIs use", () => {
    const { declarations, definePlugin } = parseDeclarations(`
      import { definePlugin, type FileRef } from "../../core/src/index.ts";
      /** How hard. */
      export type Style = "light" | "heavy";
      export interface Photo extends FileRef { width?: number; }
      export interface Api {
        /** Doc of go. */
        go(args: { style?: Style; tags: string[]; meta: Record<string, unknown>; at: number | null }): Promise<{ photos: Photo[] }>;
        stop(): Promise<void>;
        both(args: Base & { extra: boolean }): Promise<void>;
        fn(args: { cb: (x: string) => void }): Promise<void>;
      }
      export const p = definePlugin<Api, Events>("p", { methods: ["go"] });
      const noise = { interface: 1, type: (a: number) => a };
    `);
    expect(definePlugin).toEqual({ api: "Api", events: "Events" });
    expect(declarations.get("Style")).toEqual({
      kind: "alias",
      name: "Style",
      doc: "How hard.",
      type: { kind: "literal", values: ["light", "heavy"] },
    });
    const api = declarations.get("Api") as Extract<ReturnType<typeof declarations.get>, { kind: "interface" }>;
    expect(api.methods.map((m) => m.name)).toEqual(["go", "stop", "both", "fn"]);
    const go = api.methods[0]!;
    expect(go.doc).toBe("Doc of go.");
    expect(go.param!.type).toEqual({
      kind: "object",
      fields: [
        { name: "style", type: { kind: "ref", name: "Style" }, optional: true },
        { name: "tags", type: { kind: "array", of: { kind: "string" } }, optional: false },
        { name: "meta", type: { kind: "record", of: { kind: "unknown" } }, optional: false },
        { name: "at", type: { kind: "nullable", of: { kind: "number" } }, optional: false },
      ],
    });
    expect(go.returns).toEqual({
      kind: "object",
      fields: [{ name: "photos", type: { kind: "array", of: { kind: "ref", name: "Photo" } }, optional: false }],
    });
    expect(api.methods[1]!.returns).toEqual({ kind: "void" });
    expect(api.methods[2]!.param!.type.kind).toBe("intersection");
    const cb = (api.methods[3]!.param!.type as { fields: { type: { kind: string; reason?: string } }[] }).fields[0]!
      .type;
    expect(cb).toMatchObject({ kind: "unsupported", reason: "function types are not supported" });
  });

  test("definePlugin<{}, Events> and types imported from the plugin's own modules", () => {
    const spec = specOf(
      `import type { Mode } from "./types.ts";
       export interface Events { change: { mode: Mode } }
       export const p = definePlugin<{}, Events>("p", { events: ["change"] });`,
      { "types.ts": `export type Mode = "a" | "b";` },
    );
    expect(spec.api).toBe("{}");
    expect(spec.methods).toEqual([]);
    expect(spec.eventTypes.map((e) => e.name)).toEqual(["change"]);
    expect(buildModel(spec, "p").enums).toEqual([{ name: "PMode", values: ["a", "b"] }]);
  });

  test("events carry no bytes (architecture review stage 4): FileRefs or base64 instead", () => {
    const spec = specOf(`import { definePlugin } from "../../core/src/index.ts";
interface Frame { data: Uint8Array; at: number }
interface Chunk { part: { raw?: ArrayBuffer | null } }
interface Api { go(): Promise<void> }
interface Events { frame: Frame; chunk: Chunk[]; fine: { url: string } }
export const p = definePlugin<Api, Events>("p", { methods: ["go"], events: ["frame", "chunk", "fine"] });`);
    const manifest = { id: "p", apiVersion: 1, methods: ["go"], events: ["frame", "chunk", "fine"] } as never;
    expect(specProblems(manifest, spec)).toEqual([
      "event frame carries Uint8Array: events are JSON; send a FileRef (or base64 for a few bytes) instead",
      "event chunk carries ArrayBuffer: events are JSON; send a FileRef (or base64 for a few bytes) instead",
    ]);
  });

  test("every plugin's spec matches its native-plugin.json", () => {
    const mismatches: string[] = [];
    for (const id of readdirSync(PLUGINS)) {
      const manifest = JSON.parse(readFileSync(join(PLUGINS, id, "native-plugin.json"), "utf8")) as PluginManifest;
      manifest.events ??= [];
      for (const problem of specProblems(manifest, readPluginSpec(join(PLUGINS, id))))
        mismatches.push(`${id}: ${problem}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe("code generation (PL-10)", () => {
  const spec = specOf(`
    export type Level = "low" | "prompt-with-rationale";
    export interface Item { title: string; children?: Item[] }
    export interface Api {
      get(args: { key: string; level?: Level }): Promise<{ value: string | null; items: Item[] }>;
      clear(): Promise<void>;
      odd(args: { at: string | number }): Promise<void>;
    }
    export interface Events { changed: { level: Level } }
    export const p = definePlugin<Api, Events>("my-store", { methods: ["get", "clear", "odd"] });
  `);

  test("names every type after the plugin, recursive types refer to themselves", () => {
    const model = buildModel(spec, "my-store");
    expect(model.prefix).toBe("MyStore");
    expect(model.structs.map((s) => s.name)).toEqual([
      "MyStoreChangedEvent",
      "MyStoreGetArgs",
      "MyStoreGetResult",
      "MyStoreItem",
    ]);
    expect(model.structs.find((s) => s.name === "MyStoreItem")!.fields[1]).toEqual({
      name: "children",
      type: { t: "array", of: { t: "struct", name: "MyStoreItem" } },
      optional: true,
      nullable: false,
    });
    expect(model.enums).toEqual([{ name: "MyStoreLevel", values: ["low", "prompt-with-rationale"] }]);
    // A type that cannot be expressed keeps the method, untyped, with the reason.
    expect(untypedMembers(model)).toEqual([
      "odd: odd(args).at: unions other than string literals and null are not supported (string | number)",
    ]);
    // The platform subset limits the model.
    expect(buildModel(spec, "my-store", { methods: ["clear"], events: [] }).methods.map((m) => m.name)).toEqual([
      "clear",
    ]);
  });

  test("Swift: decoding with field paths, null vs missing in results, typed dispatch and events", () => {
    const swift = generateSwift(buildModel(spec, "my-store", { source: "src/index.ts" }));
    expect(swift).toContain(
      'enum MyStoreLevel: String, Sendable, CaseIterable {\n    case low = "low"\n    case promptWithRationale = "prompt-with-rationale"',
    );
    expect(swift).toContain('self.key = try AkanNativeJSON.string(o["key"], AkanNativeJSON.key(path, "key"))');
    expect(swift).toContain(
      'self.level = try AkanNativeJSON.optional(o["level"]) { try MyStoreLevel(akanNative: $0, at: AkanNativeJSON.key(path, "level")) }',
    );
    // `value: string | null` is written as null; `children?:` is left out when nil.
    expect(swift).toContain('if let v = self.value { o["value"] = v } else { o["value"] = NSNull() }');
    expect(swift).toContain('if let v = self.children { o["children"] = v.map { e0 in e0.akanNativeJSON } }');
    expect(swift).toContain("func get(_ args: MyStoreGetArgs, _ reply: AkanNativeReply<MyStoreGetResult>)");
    expect(swift).toContain("func clear(_ reply: AkanNativeReply<Void>)");
    expect(swift).toContain("func odd(_ call: AkanNativeCall)");
    expect(swift).toContain(
      'guard let args = AkanNativeJSON.decode(call, { try MyStoreGetArgs(akanNative: $0, at: "") }) else { return }',
    );
    expect(swift).toContain(
      'func changed(_ data: MyStoreChangedEvent) {\n        context.emit("changed", data.akanNativeJSON)',
    );
  });

  test("Kotlin: the same shape, UPPER_SNAKE enum entries, AkanNativeVoidReply for void", () => {
    const kotlin = generateKotlin(buildModel(spec, "my-store"), "dev.example.store");
    expect(kotlin).toStartWith("// Generated by akan-native");
    expect(kotlin).toContain("package dev.example.store");
    expect(kotlin).toContain('    LOW("low"),\n    PROMPT_WITH_RATIONALE("prompt-with-rationale");');
    expect(kotlin).toContain('o.put("value", this.value ?: JSONObject.NULL)');
    expect(kotlin).toContain(
      'this.children?.let { o.put("children", AkanNativeJson.list(it) { e0 -> e0.toAkanNative() }) }',
    );
    expect(kotlin).toContain('key = AkanNativeJson.string(o.opt("key"), AkanNativeJson.key(path, "key")),');
    expect(kotlin).toContain("fun clear(reply: AkanNativeVoidReply)");
    expect(kotlin).toContain(
      'val args = AkanNativeJson.decode(call) { MyStoreGetArgs.fromAkanNative(it, "") } ?: return',
    );
    expect(kotlin).toContain('fun changed(data: MyStoreChangedEvent) = context.emit("changed", data.toAkanNative())');
  });

  test("stubs implement the generated protocol", () => {
    const model = buildModel(spec, "my-store");
    expect(swiftStub(model, "StorePlugin")).toContain("final class StorePlugin: MyStorePluginSpec {");
    expect(kotlinStub(model, "dev.example.store", "StorePlugin")).toContain("override fun odd(call: AkanNativeCall) {");
  });

  test("clashing names and reserved words", () => {
    const clash = specOf(`
      export interface Api { a(args: { b: { x: string } }): Promise<void>; ab(args: { x: number }): Promise<void>; }
      export const p = definePlugin<Api>("p", {});`);
    // PAArgsB (from a.b) and PAbArgs do not clash; two shapes under one name do.
    expect(() => buildModel(clash, "p")).not.toThrow();
    const twoShapes = specOf(`
      export interface GetResult { a: string }
      export interface Api { x(): Promise<GetResult>; get(): Promise<{ b: number }>; }
      export const p = definePlugin<Api>("p", {});`);
    expect(() => buildModel(twoShapes, "p")).toThrow("two different types would both be named PGetResult");
    const same = specOf(`
      export interface Api { go(args: { in: string; default?: boolean }): Promise<void>; handle(): Promise<void>; }
      export const p = definePlugin<Api>("p", {});`);
    expect(() => generateSwift(buildModel(same, "p"))).toThrow("clashes with the plugin protocol's own handle");
    const ok = generateKotlin(buildModel(same, "p", { methods: ["go"] }), "x.y");
    expect(ok).toContain("val `in`: String,");
    expect(generateSwift(buildModel(same, "p", { methods: ["go"] }))).toContain("var `default`: Bool?");
  });

  test("the converted plugins generate without untyped members", () => {
    for (const id of ["preferences", "haptics", "device"]) {
      const model = buildModel(readPluginSpec(join(PLUGINS, id)), id);
      expect(untypedMembers(model)).toEqual([]);
    }
  });
});
