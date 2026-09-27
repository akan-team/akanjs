// Swift and Kotlin bindings generated from a plugin spec (PL-10, docs/architecture.md "플러그인
// 코드 생성"). For every method: an argument struct decoded from the call's JSON (INVALID_ARGS
// with the field path when it does not match), a result struct encoded back, a typed method in a
// `<Plugin>PluginSpec` protocol / interface, and a `handle(call)` that dispatches to it. Events get
// typed emit helpers. A method whose types cannot be expressed keeps the raw AkanNativeCall, with the
// reason next to it, instead of silently losing type information (react-native-codegen turns such
// types into Any / Promise<void>: parsers-primitives.js:345-381, 543-549).

import { join, relative } from "node:path";
import { CliError } from "./log.ts";
import type { AndroidManifest, PluginManifest, ResolvedPlugin } from "./project.ts";
import {
  type Declaration,
  type Field,
  interfaceFields,
  lookup,
  type Method,
  type PluginSpec,
  readPluginSpec,
  type TypeNode,
} from "./spec.ts";

// ------------------------------------------------------------------ model

export type GenType =
  | { t: "string" | "number" | "boolean" | "any" }
  | { t: "enum"; name: string }
  | { t: "struct"; name: string }
  | { t: "array"; of: GenType }
  | { t: "map"; of: GenType };

export interface GenField {
  /** The JSON key. */
  name: string;
  type: GenType;
  /** `name?:` — may be missing; results leave it out when nil. */
  optional: boolean;
  /** `| null` — results write null when nil. */
  nullable: boolean;
  doc?: string;
}

export interface GenStruct {
  name: string;
  doc?: string;
  fields: GenField[];
  /** Extends FileRef: gets a constructor taking the runtime AkanNativeFileRef for url, mime and size. */
  fileRef?: true;
}

export interface GenEnum {
  name: string;
  doc?: string;
  values: string[];
}

export interface GenMethod {
  name: string;
  doc?: string;
  /** Missing for methods without an argument. */
  args?: string;
  /** null for Promise<void>. */
  result: { type: GenType; nullable: boolean } | null;
  /** Set when the types cannot be generated: the method gets the raw AkanNativeCall. */
  untyped?: string;
}

export interface GenEvent {
  name: string;
  doc?: string;
  /** null when the payload type cannot be generated (the helper then takes Any). */
  type: GenType | null;
  nullable: boolean;
  untyped?: string;
}

export interface GenModel {
  pluginId: string;
  /** PascalCase plugin id, the prefix of every generated name (all iOS plugins share one Swift module). */
  prefix: string;
  source: string;
  structs: GenStruct[];
  enums: GenEnum[];
  methods: GenMethod[];
  events: GenEvent[];
}

const pascal = (text: string) =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");

class Unsupported extends Error {}

/**
 * Resolves the spec's types into named structs and enums. `methods` / `events` limit the model to
 * what a platform implements (the manifest's per-platform subset).
 */
export function buildModel(
  spec: PluginSpec,
  pluginId: string,
  options: { methods?: string[]; events?: string[]; source?: string } = {},
): GenModel {
  const prefix = pascal(pluginId);
  const structs = new Map<string, GenStruct>();
  const enums = new Map<string, GenEnum>();
  /** Named declarations being resolved, so recursive types refer to themselves by name. */
  const resolving = new Set<string>();
  const named = (name: string) => (name.startsWith(prefix) ? name : prefix + name);

  const addStruct = (struct: GenStruct) => {
    const existing = structs.get(struct.name);
    if (existing && JSON.stringify(existing.fields) !== JSON.stringify(struct.fields)) {
      throw new CliError(
        `plugin ${pluginId}: two different types would both be named ${struct.name}; name one of them with an interface`,
      );
    }
    if (enums.has(struct.name)) throw new CliError(`plugin ${pluginId}: ${struct.name} is both an enum and a struct`);
    structs.set(struct.name, struct);
  };
  const addEnum = (e: GenEnum) => {
    const existing = enums.get(e.name);
    if (existing && existing.values.join("|") !== e.values.join("|"))
      throw new CliError(`plugin ${pluginId}: two different string unions would both be named ${e.name}`);
    if (structs.has(e.name)) throw new CliError(`plugin ${pluginId}: ${e.name} is both an enum and a struct`);
    enums.set(e.name, e);
  };

  /** Object-like nodes (object literal, interface, alias of one, intersection of those) as fields. */
  const objectFields = (node: TypeNode, context: string): Field[] | null => {
    switch (node.kind) {
      case "object":
        return node.fields;
      case "intersection": {
        const merged = new Map<string, Field>();
        for (const part of node.of) {
          const fields = objectFields(part, context);
          if (!fields) {
            const why =
              part.kind === "unsupported"
                ? `${part.reason} (${part.text})`
                : part.kind === "union"
                  ? "unions of object types are not supported"
                  : `${part.kind} is not an object type`;
            throw new Unsupported(`${context}: in an intersection, ${why}`);
          }
          for (const f of fields) merged.set(f.name, f);
        }
        return [...merged.values()];
      }
      case "ref": {
        const decl = lookup(spec, node.name);
        if (decl?.kind === "interface") {
          if (decl.methods.length) throw new Unsupported(`${context}: ${node.name} has methods`);
          return interfaceFields(spec, decl);
        }
        if (decl?.kind === "alias") return objectFields(decl.type, context);
        return null;
      }
      default:
        return null;
    }
  };

  const struct = (name: string, fields: Field[], context: string, doc?: string, fileRef = false): GenType => {
    if (!resolving.has(name)) {
      resolving.add(name);
      const genFields = fields.map((f) => {
        if (f.name === "[index]") throw new Unsupported(`${context}: index signatures are not supported`);
        const { type, nullable } = resolve(f.type, `${name}${pascal(f.name)}`, `${context}.${f.name}`);
        return { name: f.name, type, optional: f.optional, nullable, ...(f.doc ? { doc: f.doc } : {}) };
      });
      addStruct({ name, ...(doc ? { doc } : {}), fields: genFields, ...(fileRef ? { fileRef: true as const } : {}) });
      resolving.delete(name);
    }
    return { t: "struct", name };
  };

  /** `nameHint` names an anonymous object or string union found here. */
  const resolve = (node: TypeNode, nameHint: string, context: string): { type: GenType; nullable: boolean } => {
    if (node.kind === "nullable") {
      const inner = resolve(node.of, nameHint, context);
      return { type: inner.type, nullable: true };
    }
    return { type: resolveType(node, nameHint, context), nullable: false };
  };

  const resolveType = (node: TypeNode, nameHint: string, context: string): GenType => {
    switch (node.kind) {
      case "string":
      case "number":
      case "boolean":
        return { t: node.kind };
      case "unknown":
        return { t: "any" };
      case "void":
        throw new Unsupported(`${context}: void is only allowed as a Promise result`);
      case "unsupported":
        throw new Unsupported(`${context}: ${node.reason} (${node.text})`);
      case "nullable":
        throw new Unsupported(`${context}: nested null unions are not supported`);
      case "literal":
        addEnum({ name: nameHint, values: node.values });
        return { t: "enum", name: nameHint };
      case "union":
        addEnum({ name: nameHint, values: [...new Set(node.of.flatMap((m) => literalValues(m, context)))] });
        return { t: "enum", name: nameHint };
      case "array":
        return {
          t: "array",
          of: resolveType(
            node.of.kind === "nullable" ? unsupportedNullableItem(context) : node.of,
            `${nameHint}Item`,
            `${context}[]`,
          ),
        };
      case "record":
        return {
          t: "map",
          of: resolveType(
            node.of.kind === "nullable" ? unsupportedNullableItem(context) : node.of,
            `${nameHint}Value`,
            `${context}{}`,
          ),
        };
      case "object":
      case "intersection":
        return struct(nameHint, objectFields(node, context)!, context);
      case "ref": {
        const decl = lookup(spec, node.name);
        if (!decl)
          throw new Unsupported(`${context}: ${node.name} is not declared in ${spec.file} (or @akanjs/native/core)`);
        // FileRef itself is a runtime type (AkanNativeFileRef), shared by every plugin.
        if (decl.kind === "interface" && decl.name === "FileRef" && !spec.declarations.has("FileRef"))
          return { t: "struct", name: "AkanNativeFileRef" };
        if (decl.kind === "interface")
          return struct(named(decl.name), objectFields(node, context)!, context, decl.doc, extendsFileRef(decl.name));
        if (decl.type.kind === "literal" || decl.type.kind === "union") {
          addEnum({
            name: named(decl.name),
            values: [...new Set(literalValues(decl.type, context))],
            ...(decl.doc ? { doc: decl.doc } : {}),
          });
          return { t: "enum", name: named(decl.name) };
        }
        const fields = objectFields(decl.type, context);
        if (fields) return struct(named(decl.name), fields, context, decl.doc);
        if (decl.type.kind === "nullable")
          throw new Unsupported(`${context}: ${node.name} includes null; write \`| null\` where it is used`);
        return resolveType(decl.type, named(decl.name), context);
      }
    }
  };

  /** The strings of a string union member: a literal or an alias of one (also nested unions). */
  const literalValues = (node: TypeNode, context: string, seen = new Set<string>()): string[] => {
    if (node.kind === "literal") return node.values;
    if (node.kind === "union") return node.of.flatMap((m) => literalValues(m, context, seen));
    if (node.kind === "ref" && !seen.has(node.name)) {
      seen.add(node.name);
      const decl = lookup(spec, node.name);
      if (decl?.kind === "alias") return literalValues(decl.type, context, seen);
    }
    throw new Unsupported(
      `${context}: unions other than string literals and null are not supported (${node.kind === "ref" ? node.name : node.kind})`,
    );
  };

  const extendsFileRef = (name: string, seen = new Set<string>()): boolean => {
    const decl = lookup(spec, name);
    if (decl?.kind !== "interface" || seen.has(name)) return false;
    seen.add(name);
    return decl.extends.some((parent) => parent === "FileRef" || extendsFileRef(parent, seen));
  };

  const wanted = (list: string[] | undefined, name: string) => !list || list.includes(name);
  const methods: GenMethod[] = [];
  const counts = new Map<string, number>();
  for (const m of spec.methods) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  const seen = new Set<string>();
  for (const m of spec.methods) {
    if (!wanted(options.methods, m.name) || seen.has(m.name)) continue;
    seen.add(m.name);
    methods.push(counts.get(m.name)! > 1 ? untypedMethod(m, "overloaded in the spec") : genMethod(m));
  }
  function genMethod(m: Method): GenMethod {
    const base = { name: m.name, ...(m.doc ? { doc: m.doc } : {}) };
    // Resolve into scratch maps first, so an unsupported method leaves no half-made types behind.
    const snapshot = { structs: new Map(structs), enums: new Map(enums) };
    try {
      let args: string | undefined;
      if (m.param) {
        const context = `${m.name}(${m.param.name})`;
        if (m.param.type.kind === "nullable") throw new Unsupported(`${context}: the argument cannot be null`);
        const fields = objectFields(m.param.type, context);
        if (!fields) throw new Unsupported(`${context}: the argument must be an object type`);
        const hint = m.param.type.kind === "ref" ? named(m.param.type.name) : `${prefix}${pascal(m.name)}Args`;
        args = (
          struct(
            hint,
            fields,
            context,
            m.param.type.kind === "ref" ? lookup(spec, m.param.type.name)?.doc : undefined,
          ) as { name: string }
        ).name;
      }
      const result =
        m.returns.kind === "void" ? null : resolve(m.returns, `${prefix}${pascal(m.name)}Result`, `${m.name}() result`);
      return { ...base, ...(args ? { args } : {}), result };
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      structs.clear();
      enums.clear();
      resolving.clear();
      for (const [k, v] of snapshot.structs) structs.set(k, v);
      for (const [k, v] of snapshot.enums) enums.set(k, v);
      return untypedMethod(m, error.message);
    }
  }
  function untypedMethod(m: Method, reason: string): GenMethod {
    return { name: m.name, ...(m.doc ? { doc: m.doc } : {}), result: null, untyped: reason };
  }

  const events: GenEvent[] = [];
  for (const e of spec.eventTypes) {
    if (!wanted(options.events, e.name)) continue;
    const snapshot = { structs: new Map(structs), enums: new Map(enums) };
    try {
      const { type, nullable } = resolve(e.type, `${prefix}${pascal(e.name)}Event`, `event ${e.name}`);
      events.push({ name: e.name, ...(e.doc ? { doc: e.doc } : {}), type, nullable });
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      structs.clear();
      enums.clear();
      resolving.clear();
      for (const [k, v] of snapshot.structs) structs.set(k, v);
      for (const [k, v] of snapshot.enums) enums.set(k, v);
      events.push({
        name: e.name,
        ...(e.doc ? { doc: e.doc } : {}),
        type: null,
        nullable: true,
        untyped: error.message,
      });
    }
  }

  const sortByName = <T extends { name: string }>(list: Iterable<T>) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));
  return {
    pluginId,
    prefix,
    source: options.source ?? spec.file,
    structs: sortByName(structs.values()),
    enums: sortByName(enums.values()),
    methods,
    events,
  };
}

function unsupportedNullableItem(context: string): never {
  throw new Unsupported(`${context}: null items in arrays and records are not supported`);
}

// ------------------------------------------------------------------ shared helpers

const SWIFT_KEYWORDS = new Set(
  "associatedtype class deinit enum extension fileprivate func import init inout internal let operator private precedencegroup protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while Any as await false is nil self Self super throws true try".split(
    " ",
  ),
);
const KOTLIN_KEYWORDS = new Set(
  "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while".split(
    " ",
  ),
);

const swiftName = (name: string) => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name);
const kotlinName = (name: string) => (KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name);

function checkIdentifier(model: GenModel, name: string, what: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new CliError(`plugin ${model.pluginId}: ${what} "${name}" is not a valid Swift / Kotlin identifier`);
}

/** Enum case names: lowerCamel for Swift, UPPER_SNAKE for Kotlin, unique within the enum. */
function caseNames(model: GenModel, e: GenEnum, style: "camel" | "snake"): string[] {
  const words = (value: string) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean);
  const names = e.values.map((value) => {
    const w = words(value);
    let name =
      style === "camel"
        ? w.map((x, i) => (i === 0 ? x.toLowerCase() : x[0]!.toUpperCase() + x.slice(1).toLowerCase())).join("")
        : w.map((x) => x.toUpperCase()).join("_");
    if (!name) name = style === "camel" ? "empty" : "EMPTY";
    if (/^\d/.test(name)) name = `_${name}`;
    // `.none` on an Optional<Enum> means nil (Swift only warns), a trap for `x?.type == .none`.
    if (style === "camel" && (name === "none" || name === "some")) name = `${name}_`;
    return name;
  });
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new CliError(`plugin ${model.pluginId}: the values of ${e.name} map to the same case name ${dup}`);
  return names;
}

/** Kotlin block comments nest, so "image/*" in a KDoc would open a comment that never closes. */
const kdocSafe = (text: string) => text.replaceAll("*/", "*\\/").replaceAll("/*", "/\\*");

const docLines = (doc: string | undefined, indent: string, marker: "///" | "*") =>
  doc
    ? marker === "///"
      ? doc.split("\n").map((l) => `${indent}/// ${l}`.trimEnd())
      : [`${indent}/**`, ...doc.split("\n").map((l) => `${indent} * ${kdocSafe(l)}`.trimEnd()), `${indent} */`]
    : [];

const header = (model: GenModel) =>
  `Generated by akan-native from ${model.source} (PL-10). Do not edit: every build rewrites it.`;

function methodsCollide(model: GenModel, reserved: string[]) {
  for (const m of model.methods) {
    checkIdentifier(model, m.name, "method");
    if (reserved.includes(m.name))
      throw new CliError(`plugin ${model.pluginId}: method ${m.name} clashes with the plugin protocol's own ${m.name}`);
  }
  for (const e of model.events) checkIdentifier(model, e.name, "event");
  for (const s of model.structs) for (const f of s.fields) checkIdentifier(model, f.name, `field ${s.name}.`);
}

// ------------------------------------------------------------------ Swift

function swiftType(type: GenType): string {
  switch (type.t) {
    case "string":
      return "String";
    case "number":
      return "Double";
    case "boolean":
      return "Bool";
    case "any":
      return "Any";
    case "enum":
    case "struct":
      return type.name;
    case "array":
      return `[${swiftType(type.of)}]`;
    case "map":
      return `[String: ${swiftType(type.of)}]`;
  }
}

/** Expression decoding `value` (an Any?) at `path` (a String expression). */
function swiftDecode(type: GenType, value: string, path: string, depth = 0): string {
  switch (type.t) {
    case "string":
      return `try AkanNativeJSON.string(${value}, ${path})`;
    case "number":
      return `try AkanNativeJSON.number(${value}, ${path})`;
    case "boolean":
      return `try AkanNativeJSON.bool(${value}, ${path})`;
    case "any":
      return `try AkanNativeJSON.any(${value}, ${path})`;
    case "enum":
    case "struct":
      return `try ${type.name}(akanNative: ${value}, at: ${path})`;
    case "array":
      return `try AkanNativeJSON.array(${value}, ${path}) { v${depth}, p${depth} in ${swiftDecode(type.of, `v${depth}`, `p${depth}`, depth + 1)} }`;
    case "map":
      return `try AkanNativeJSON.map(${value}, ${path}) { v${depth}, p${depth} in ${swiftDecode(type.of, `v${depth}`, `p${depth}`, depth + 1)} }`;
  }
}

function swiftEncode(type: GenType, value: string, depth = 0): string {
  switch (type.t) {
    case "string":
    case "number":
    case "boolean":
    case "any":
      return value;
    case "enum":
      return `${value}.rawValue`;
    case "struct":
      return `${value}.akanNativeJSON`;
    case "array":
      return type.of.t === "string" || type.of.t === "number" || type.of.t === "boolean"
        ? value
        : `${value}.map { e${depth} in ${swiftEncode(type.of, `e${depth}`, depth + 1)} }`;
    case "map":
      return type.of.t === "string" || type.of.t === "number" || type.of.t === "boolean"
        ? value
        : `${value}.mapValues { e${depth} in ${swiftEncode(type.of, `e${depth}`, depth + 1)} }`;
  }
}

const hasAny = (type: GenType, model: GenModel, seen = new Set<string>()): boolean => {
  if (type.t === "any") return true;
  if (type.t === "array" || type.t === "map") return hasAny(type.of, model, seen);
  if (type.t === "struct" && !seen.has(type.name)) {
    seen.add(type.name);
    return model.structs.find((s) => s.name === type.name)?.fields.some((f) => hasAny(f.type, model, seen)) ?? false;
  }
  return false;
};

const FILE_REF_FIELDS = ["url", "mime", "size"];

const replyType = (m: GenMethod, lang: "swift" | "kotlin") =>
  m.result === null
    ? lang === "swift"
      ? "Void"
      : "Unit"
    : `${lang === "swift" ? swiftType(m.result.type) : kotlinType(m.result.type)}${m.result.nullable ? "?" : ""}`;

export function generateSwift(model: GenModel): string {
  methodsCollide(model, ["handle", "startListening", "stopListening"]);
  const out: string[] = [`// ${header(model)}`, "", "import Foundation", ""];

  for (const e of model.enums) {
    const cases = caseNames(model, e, "camel");
    out.push(...docLines(e.doc, "", "///"));
    out.push(`enum ${e.name}: String, Sendable, CaseIterable {`);
    for (const [i, value] of e.values.entries())
      out.push(`    case ${swiftName(cases[i]!)} = ${JSON.stringify(value)}`);
    out.push(
      "",
      "    init(akanNative value: Any?, at path: String) throws {",
      `        self = try AkanNativeJSON.literal(value, path, Self.self)`,
      "    }",
      "}",
      "",
    );
  }

  for (const s of model.structs) {
    // Plain data compares by value (Kotlin data classes already do); `Any` fields cannot.
    const conformances = s.fields.some((f) => hasAny(f.type, model)) ? "@unchecked Sendable" : "Sendable, Equatable";
    out.push(...docLines(s.doc, "", "///"));
    out.push(`struct ${s.name}: ${conformances} {`);
    for (const f of s.fields) {
      out.push(...docLines(f.doc, "    ", "///"));
      out.push(
        `    var ${swiftName(f.name)}: ${swiftType(f.type)}${f.optional || f.nullable || f.type.t === "any" ? "?" : ""}`,
      );
    }
    // A memberwise init with defaults for the optional fields, since plugins build results.
    const params = s.fields.map(
      (f) =>
        `${swiftName(f.name)}: ${swiftType(f.type)}${f.optional || f.nullable || f.type.t === "any" ? "? = nil" : ""}`,
    );
    if (s.fields.length) {
      out.push("", `    init(${params.join(", ")}) {`);
      for (const f of s.fields) out.push(`        self.${f.name} = ${swiftName(f.name)}`);
      out.push("    }", "");
    } else out.push("    init() {}", "");
    if (s.fileRef) {
      const rest = s.fields.filter((f) => !FILE_REF_FIELDS.includes(f.name));
      const restParams = rest.map(
        (f) =>
          `${swiftName(f.name)}: ${swiftType(f.type)}${f.optional || f.nullable || f.type.t === "any" ? "? = nil" : ""}`,
      );
      const args = s.fields.map(
        (f) => `${swiftName(f.name)}: ${FILE_REF_FIELDS.includes(f.name) ? `file.${f.name}` : swiftName(f.name)}`,
      );
      out.push(
        `    init(${["file: AkanNativeFileRef", ...restParams].join(", ")}) {`,
        `        self.init(${args.join(", ")})`,
        "    }",
        "",
      );
    }
    out.push(
      "    init(akanNative value: Any?, at path: String) throws {",
      `        ${s.fields.length ? "let o =" : "_ ="} try AkanNativeJSON.object(value, path)`,
    );
    for (const f of s.fields) {
      const key = JSON.stringify(f.name);
      const decode = swiftDecode(f.type, "$0", `AkanNativeJSON.key(path, ${key})`);
      if (f.optional || f.nullable || f.type.t === "any")
        out.push(`        self.${f.name} = try AkanNativeJSON.optional(o[${key}]) { ${decode} }`);
      else out.push(`        self.${f.name} = ${swiftDecode(f.type, `o[${key}]`, `AkanNativeJSON.key(path, ${key})`)}`);
    }
    out.push("    }", "");
    out.push(
      "    var akanNativeJSON: [String: Any] {",
      `        ${s.fields.length ? "var" : "let"} o: [String: Any] = [:]`,
    );
    for (const f of s.fields) {
      const key = JSON.stringify(f.name);
      const self = `self.${f.name}`;
      if (f.optional || f.nullable || f.type.t === "any") {
        const nullValue = f.nullable && !f.optional ? "NSNull()" : null;
        out.push(
          `        if let v = ${self} { o[${key}] = ${swiftEncode(f.type, "v")} }${nullValue ? ` else { o[${key}] = ${nullValue} }` : ""}`,
        );
      } else out.push(`        o[${key}] = ${swiftEncode(f.type, self)}`);
    }
    out.push("        return o", "    }", "}", "");
  }

  const protocol = `${model.prefix}PluginSpec`;
  out.push(
    `/// The ${model.pluginId} API as Swift methods. Conform the plugin class to this instead of writing handle(_:).`,
  );
  out.push("@MainActor", `protocol ${protocol}: AkanNativePlugin {`);
  for (const m of model.methods) {
    out.push(...docLines(m.doc, "    ", "///"));
    if (m.untyped) {
      out.push(`    /// Untyped: ${m.untyped}.`, `    func ${swiftName(m.name)}(_ call: AkanNativeCall)`);
      continue;
    }
    const params = [...(m.args ? [`_ args: ${m.args}`] : []), `_ reply: AkanNativeReply<${replyType(m, "swift")}>`];
    out.push(`    func ${swiftName(m.name)}(${params.join(", ")})`);
  }
  out.push("}", "");
  out.push(
    `extension ${protocol} {`,
    "    func handle(_ call: AkanNativeCall) {",
    "        akanNativeDispatch(call)",
    "    }",
    "",
    "    /// The generated dispatch: a plugin that implements handle(_:) itself can still end with it.",
    "    func akanNativeDispatch(_ call: AkanNativeCall) {",
    "        switch call.method {",
  );
  for (const m of model.methods) {
    out.push(`        case ${JSON.stringify(m.name)}:`);
    if (m.untyped) {
      out.push(`            ${swiftName(m.name)}(call)`);
      continue;
    }
    const reply =
      m.result === null
        ? "AkanNativeReply(call) { _ in nil }"
        : `AkanNativeReply(call) { ${m.result.nullable ? `$0.map { ${swiftEncode(m.result.type, "$0")} } ?? NSNull()` : swiftEncode(m.result.type, "$0")} }`;
    if (m.args) {
      out.push(
        `            guard let args = AkanNativeJSON.decode(call, { try ${m.args}(akanNative: $0, at: "") }) else { return }`,
      );
      out.push(`            ${swiftName(m.name)}(args, ${reply})`);
    } else out.push(`            ${swiftName(m.name)}(${reply})`);
  }
  out.push(
    "        default:",
    '            call.reject(.notFound, "unknown method \\(call.method)")',
    "        }",
    "    }",
    "}",
    "",
  );

  if (model.events.length) {
    out.push(
      `/// Typed emit for the ${model.pluginId} events: \`${model.prefix}Events(context).${model.events[0]!.name}(…)\`.`,
    );
    out.push(
      "@MainActor",
      `struct ${model.prefix}Events {`,
      "    let context: AkanNativePluginContext",
      "",
      "    init(_ context: AkanNativePluginContext) {",
      "        self.context = context",
      "    }",
    );
    for (const e of model.events) {
      out.push("");
      out.push(...docLines(e.doc, "    ", "///"));
      if (!e.type) {
        out.push(
          `    /// Untyped: ${e.untyped}.`,
          `    func ${swiftName(e.name)}(_ data: Any?) {`,
          `        context.emit(${JSON.stringify(e.name)}, data)`,
          "    }",
        );
        continue;
      }
      const t = `${swiftType(e.type)}${e.nullable ? "?" : ""}`;
      const value = e.nullable ? `data.map { ${swiftEncode(e.type, "$0")} } ?? NSNull()` : swiftEncode(e.type, "data");
      out.push(
        `    func ${swiftName(e.name)}(_ data: ${t}) {`,
        `        context.emit(${JSON.stringify(e.name)}, ${value})`,
        "    }",
      );
    }
    out.push("}", "");
  }
  return out.join("\n");
}

// ------------------------------------------------------------------ Kotlin

function kotlinType(type: GenType): string {
  switch (type.t) {
    case "string":
      return "String";
    case "number":
      return "Double";
    case "boolean":
      return "Boolean";
    case "any":
      return "Any";
    case "enum":
    case "struct":
      return type.name;
    case "array":
      return `List<${kotlinType(type.of)}>`;
    case "map":
      return `Map<String, ${kotlinType(type.of)}>`;
  }
}

function kotlinDecode(type: GenType, value: string, path: string, depth = 0): string {
  switch (type.t) {
    case "string":
      return `AkanNativeJson.string(${value}, ${path})`;
    case "number":
      return `AkanNativeJson.number(${value}, ${path})`;
    case "boolean":
      return `AkanNativeJson.bool(${value}, ${path})`;
    case "any":
      return `AkanNativeJson.any(${value}, ${path})`;
    case "enum":
    case "struct":
      return `${type.name}.fromAkanNative(${value}, ${path})`;
    case "array":
      return `AkanNativeJson.array(${value}, ${path}) { v${depth}, p${depth} -> ${kotlinDecode(type.of, `v${depth}`, `p${depth}`, depth + 1)} }`;
    case "map":
      return `AkanNativeJson.map(${value}, ${path}) { v${depth}, p${depth} -> ${kotlinDecode(type.of, `v${depth}`, `p${depth}`, depth + 1)} }`;
  }
}

function kotlinEncode(type: GenType, value: string, depth = 0): string {
  switch (type.t) {
    case "string":
    case "number":
    case "boolean":
    case "any":
      return value;
    case "enum":
      return `${value}.json`;
    case "struct":
      return `${value}.toAkanNative()`;
    case "array":
      return `AkanNativeJson.list(${value}) { e${depth} -> ${kotlinEncode(type.of, `e${depth}`, depth + 1)} }`;
    case "map":
      return `AkanNativeJson.dict(${value}) { e${depth} -> ${kotlinEncode(type.of, `e${depth}`, depth + 1)} }`;
  }
}

export function generateKotlin(model: GenModel, pkg: string): string {
  methodsCollide(model, [
    "handle",
    "startListening",
    "stopListening",
    "onNewIntent",
    "onConfigurationChanged",
    "onRestoredActivityResult",
    "destroy",
  ]);
  const out: string[] = [
    `// ${header(model)}`,
    `package ${pkg}`,
    "",
    "import com.akanjs.runtime.AkanNativeCall",
    "import com.akanjs.runtime.AkanNativeErrorCode",
    "import com.akanjs.runtime.AkanNativeFileRef",
    "import com.akanjs.runtime.AkanNativeJson",
    "import com.akanjs.runtime.AkanNativePlugin",
    "import com.akanjs.runtime.AkanNativePluginContext",
    "import com.akanjs.runtime.AkanNativeReply",
    "import com.akanjs.runtime.AkanNativeVoidReply",
    "import org.json.JSONObject",
    "",
  ];

  for (const e of model.enums) {
    const cases = caseNames(model, e, "snake");
    out.push(...docLines(e.doc, "", "*"));
    out.push(`enum class ${e.name}(val json: String) {`);
    for (const [i, value] of e.values.entries())
      out.push(`    ${kotlinName(cases[i]!)}(${JSON.stringify(value)})${i === e.values.length - 1 ? ";" : ","}`);
    out.push(
      "",
      "    companion object {",
      `        /** The entry for a JSON value, e.g. a state string from the platform; null if unknown. */`,
      `        fun from(json: String): ${e.name}? = entries.firstOrNull { it.json == json }`,
      "",
      `        fun fromAkanNative(value: Any?, path: String): ${e.name} {`,
      '            if (AkanNativeJson.isNull(value)) AkanNativeJson.string(value, path) // "… is required"',
      `            return (value as? String)?.let(::from) ?: throw AkanNativeJson.invalid(path, "one of " + entries.joinToString { it.json })`,
      "        }",
      "    }",
      "}",
      "",
    );
  }

  for (const s of model.structs) {
    const nullableType = (f: GenField) => f.optional || f.nullable || f.type.t === "any";
    out.push(...docLines(s.doc, "", "*"));
    if (s.fields.length) {
      out.push(`data class ${s.name}(`);
      for (const f of s.fields) {
        out.push(...docLines(f.doc, "    ", "*"));
        out.push(`    val ${kotlinName(f.name)}: ${kotlinType(f.type)}${nullableType(f) ? "? = null" : ""},`);
      }
      out.push(") {");
    } else out.push(`class ${s.name} {`);
    if (s.fileRef) {
      const rest = s.fields.filter((f) => !FILE_REF_FIELDS.includes(f.name));
      const restParams = rest.map(
        (f) => `${kotlinName(f.name)}: ${kotlinType(f.type)}${nullableType(f) ? "? = null" : ""}`,
      );
      const args = s.fields.map(
        (f) => `${kotlinName(f.name)} = ${FILE_REF_FIELDS.includes(f.name) ? `file.${f.name}` : kotlinName(f.name)}`,
      );
      out.push(
        `    constructor(${["file: AkanNativeFileRef", ...restParams].join(", ")}) : this(${args.join(", ")})`,
        "",
      );
    }
    out.push("    fun toAkanNative(): JSONObject {", "        val o = JSONObject()");
    for (const f of s.fields) {
      const key = JSON.stringify(f.name);
      const self = `this.${kotlinName(f.name)}`;
      if (nullableType(f)) {
        const nullValue = f.nullable && !f.optional ? " ?: JSONObject.NULL" : "";
        const encoded = kotlinEncode(f.type, "it");
        if (nullValue)
          out.push(`        o.put(${key}, ${encoded === "it" ? self : `${self}?.let { ${encoded} }`}${nullValue})`);
        else out.push(`        ${self}?.let { o.put(${key}, ${kotlinEncode(f.type, "it")}) }`);
      } else out.push(`        o.put(${key}, ${kotlinEncode(f.type, self)})`);
    }
    out.push(
      "        return o",
      "    }",
      "",
      "    companion object {",
      `        fun fromAkanNative(value: Any?, path: String): ${s.name} {`,
      `            ${s.fields.length ? "val o = " : ""}AkanNativeJson.obj(value, path)`,
    );
    out.push(`            return ${s.name}(`);
    for (const f of s.fields) {
      const key = JSON.stringify(f.name);
      const decode = kotlinDecode(f.type, "v", `AkanNativeJson.key(path, ${key})`);
      if (nullableType(f))
        out.push(`                ${kotlinName(f.name)} = AkanNativeJson.optional(o.opt(${key})) { v -> ${decode} },`);
      else
        out.push(
          `                ${kotlinName(f.name)} = ${kotlinDecode(f.type, `o.opt(${key})`, `AkanNativeJson.key(path, ${key})`)},`,
        );
    }
    out.push("            )", "        }", "    }", "}", "");
  }

  const iface = `${model.prefix}PluginSpec`;
  out.push(`/** The ${model.pluginId} API as Kotlin methods. Implement this instead of writing handle(call). */`);
  out.push(`interface ${iface} : AkanNativePlugin {`);
  for (const m of model.methods) {
    if (m.untyped) {
      const note = `Untyped: ${m.untyped}.`;
      out.push(
        ...docLines(m.doc ? `${m.doc}\n\n${note}` : note, "    ", "*"),
        `    fun ${kotlinName(m.name)}(call: AkanNativeCall)`,
        "",
      );
      continue;
    }
    out.push(...docLines(m.doc, "    ", "*"));
    const params = [
      ...(m.args ? [`args: ${m.args}`] : []),
      `reply: ${m.result === null ? "AkanNativeVoidReply" : `AkanNativeReply<${replyType(m, "kotlin")}>`}`,
    ];
    out.push(`    fun ${kotlinName(m.name)}(${params.join(", ")})`, "");
  }
  out.push(
    "    override fun handle(call: AkanNativeCall) = akanNativeDispatch(call)",
    "",
    "    /** The generated dispatch: a plugin that overrides handle(call) itself can still end with it. */",
    "    fun akanNativeDispatch(call: AkanNativeCall) {",
    "        when (call.method) {",
  );
  for (const m of model.methods) {
    if (m.untyped) {
      out.push(`            ${JSON.stringify(m.name)} -> ${kotlinName(m.name)}(call)`);
      continue;
    }
    const reply =
      m.result === null
        ? "AkanNativeVoidReply(call)"
        : `AkanNativeReply(call) { ${m.result.nullable ? `it?.let { v -> ${kotlinEncode(m.result.type, "v")} } ?: JSONObject.NULL` : kotlinEncode(m.result.type, "it")} }`;
    if (m.args) {
      out.push(
        `            ${JSON.stringify(m.name)} -> {`,
        `                val args = AkanNativeJson.decode(call) { ${m.args}.fromAkanNative(it, "") } ?: return`,
        `                ${kotlinName(m.name)}(args, ${reply})`,
        "            }",
      );
    } else out.push(`            ${JSON.stringify(m.name)} -> ${kotlinName(m.name)}(${reply})`);
  }
  out.push(
    '            else -> call.reject(AkanNativeErrorCode.NOT_FOUND, "unknown method ${call.method}")',
    "        }",
    "    }",
    "}",
    "",
  );

  if (model.events.length) {
    out.push(
      `/** Typed emit for the ${model.pluginId} events: \`${model.prefix}Events(context).${model.events[0]!.name}(…)\`. */`,
    );
    out.push(`class ${model.prefix}Events(private val context: AkanNativePluginContext) {`);
    for (const e of model.events) {
      out.push(...docLines(e.doc, "    ", "*"));
      if (!e.type) {
        out.push(
          `    /** Untyped: ${kdocSafe(e.untyped!)}. */`,
          `    fun ${kotlinName(e.name)}(data: Any?) = context.emit(${JSON.stringify(e.name)}, data)`,
          "",
        );
        continue;
      }
      const t = `${kotlinType(e.type)}${e.nullable ? "?" : ""}`;
      const value = e.nullable
        ? `data?.let { ${kotlinEncode(e.type, "it")} } ?: JSONObject.NULL`
        : kotlinEncode(e.type, "data");
      out.push(`    fun ${kotlinName(e.name)}(data: ${t}) = context.emit(${JSON.stringify(e.name)}, ${value})`, "");
    }
    if (out.at(-1) === "") out.pop();
    out.push("}", "");
  }
  return out.join("\n");
}

// ------------------------------------------------------------------ plugins

/** Where the spec and the manifest disagree (method and event names, platform subsets). */
export function specProblems(manifest: PluginManifest, spec: PluginSpec): string[] {
  const problems: string[] = [];
  const names = [...new Set(spec.methods.map((m) => m.name))];
  const events = spec.eventTypes.map((e) => e.name);
  const where = `${spec.api}${spec.events ? ` / ${spec.events}` : ""}`;
  for (const m of manifest.methods)
    if (!names.includes(m)) problems.push(`method ${m} is in native-plugin.json but not in ${where}`);
  for (const m of names)
    if (!manifest.methods.includes(m)) problems.push(`method ${m} is in ${where} but not in native-plugin.json`);
  for (const e of manifest.events)
    if (!events.includes(e))
      problems.push(
        `event ${e} is in native-plugin.json but not in ${spec.events ?? "an Events interface (definePlugin<Api, Events>)"}`,
      );
  for (const e of events)
    if (!manifest.events.includes(e)) problems.push(`event ${e} is in ${spec.events} but not in native-plugin.json`);
  for (const platform of ["ios", "android", "desktop"] as const) {
    const entry = manifest[platform];
    if (!entry || typeof entry !== "object") continue;
    for (const m of entry.methods ?? [])
      if (!manifest.methods.includes(m)) problems.push(`${platform}.methods lists ${m}, which is not a method`);
    for (const e of entry.events ?? [])
      if (!manifest.events.includes(e)) problems.push(`${platform}.events lists ${e}, which is not an event`);
  }
  for (const e of spec.eventTypes) {
    const bytes = byteType(e.type, spec.declarations);
    if (bytes)
      problems.push(
        `event ${e.name} carries ${bytes}: events are JSON; send a FileRef (or base64 for a few bytes) instead`,
      );
  }
  return problems;
}

/** Binary types that must not travel in an event (architecture review stage 4: bytes are owned, and only FileRefs carry them). */
const BYTE_TYPES = new Set([
  "Uint8Array",
  "Uint8ClampedArray",
  "Int8Array",
  "Uint16Array",
  "Int16Array",
  "Uint32Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Blob",
  "File",
  "Buffer",
]);

/** The first binary type a payload type reaches, through the spec's own declarations, or null. */
function byteType(node: TypeNode, declarations: Map<string, Declaration>, seen = new Set<string>()): string | null {
  switch (node.kind) {
    case "ref": {
      if (BYTE_TYPES.has(node.name)) return node.name;
      if (seen.has(node.name)) return null;
      seen.add(node.name);
      const decl = declarations.get(node.name);
      if (!decl) return null;
      if (decl.kind === "alias") return byteType(decl.type, declarations, seen);
      for (const f of decl.fields) {
        const found = byteType(f.type, declarations, seen);
        if (found) return found;
      }
      return null;
    }
    case "array":
    case "record":
    case "nullable":
      return byteType(node.of, declarations, seen);
    case "union":
    case "intersection":
      for (const part of node.of) {
        const found = byteType(part, declarations, seen);
        if (found) return found;
      }
      return null;
    case "object":
      for (const f of node.fields) {
        const found = byteType(f.type, declarations, seen);
        if (found) return found;
      }
      return null;
    case "unsupported":
      return [...BYTE_TYPES].find((t) => new RegExp(`\\b${t}\\b`).test(node.text)) ?? null;
    default:
      return null;
  }
}

/** Methods and events whose types could not be generated, with the reason. */
export function untypedMembers(model: GenModel): string[] {
  return [
    ...model.methods.filter((m) => m.untyped).map((m) => `${m.name}: ${m.untyped}`),
    ...model.events.filter((e) => e.untyped).map((e) => `event ${e.name}: ${e.untyped}`),
  ];
}

/** The generated source for one plugin on one platform (file name relative to the gen folder). */
export function pluginBindings(
  plugin: ResolvedPlugin,
  platform: "ios" | "android",
  appDir: string,
): { file: string; text: string } {
  const { manifest } = plugin;
  const native = manifest[platform];
  if (!native || typeof native !== "object")
    throw new CliError(`plugin ${manifest.id}: no ${platform} implementation to generate bindings for`);
  const spec = readPluginSpec(plugin.dir);
  const problems = specProblems(manifest, spec);
  if (problems.length)
    throw new CliError(
      `plugin ${manifest.id}: the spec does not match native-plugin.json:\n  - ${problems.join("\n  - ")}`,
    );
  const model = buildModel(spec, manifest.id, {
    methods: native.methods ?? manifest.methods,
    events: native.events ?? manifest.events,
    source: relative(appDir, spec.file) || spec.file,
  });
  if (platform === "ios") return { file: `${model.prefix}PluginSpec.swift`, text: generateSwift(model) };
  const pkg = (native as AndroidManifest).class.replace(/\.[^.]+$/, "");
  return { file: join(...pkg.split("."), `${model.prefix}PluginSpec.kt`), text: generateKotlin(model, pkg) };
}

// ------------------------------------------------------------------ stubs

/** A Swift plugin class that conforms to the generated protocol, every method still to write. */
export function swiftStub(model: GenModel, className: string): string {
  const out = [
    "import Foundation",
    "",
    `/// ${model.pluginId}: generated by \`akan-native plugin stub\` from ${model.source}.`,
    `final class ${className}: ${model.prefix}PluginSpec {`,
  ];
  out.push(
    `    static let id = ${JSON.stringify(model.pluginId)}`,
    "    private let context: AkanNativePluginContext",
    "",
    "    init(context: AkanNativePluginContext) {",
    "        self.context = context",
    "    }",
  );
  for (const m of model.methods) {
    out.push("");
    if (m.untyped) {
      out.push(
        `    /// Untyped: ${m.untyped}.`,
        `    func ${swiftName(m.name)}(_ call: AkanNativeCall) {`,
        `        call.reject(.unsupported, "${m.name} is not implemented yet")`,
        "    }",
      );
      continue;
    }
    const params = [...(m.args ? [`_ args: ${m.args}`] : []), `_ reply: AkanNativeReply<${replyType(m, "swift")}>`];
    out.push(
      `    func ${swiftName(m.name)}(${params.join(", ")}) {`,
      `        reply.reject(.unsupported, "${m.name} is not implemented yet")`,
      "    }",
    );
  }
  out.push("}", "");
  return out.join("\n");
}

/** A Kotlin plugin class that implements the generated interface, every method still to write. */
export function kotlinStub(model: GenModel, pkg: string, className: string): string {
  const out = [
    `package ${pkg}`,
    "",
    "import com.akanjs.runtime.AkanNativeCall",
    "import com.akanjs.runtime.AkanNativeErrorCode",
    "import com.akanjs.runtime.AkanNativePluginContext",
    "import com.akanjs.runtime.AkanNativeReply",
    "import com.akanjs.runtime.AkanNativeVoidReply",
    "",
    `/** ${model.pluginId}: generated by \`akan-native plugin stub\` from ${model.source}. */`,
    `class ${className}(private val context: AkanNativePluginContext) : ${model.prefix}PluginSpec {`,
  ];
  model.methods.forEach((m, i) => {
    if (i) out.push("");
    const todo = `reject(AkanNativeErrorCode.UNSUPPORTED, "${m.name} is not implemented yet")`;
    if (m.untyped) {
      out.push(
        `    /** Untyped: ${kdocSafe(m.untyped)}. */`,
        `    override fun ${kotlinName(m.name)}(call: AkanNativeCall) {`,
        `        call.${todo}`,
        "    }",
      );
      return;
    }
    const params = [
      ...(m.args ? [`args: ${m.args}`] : []),
      `reply: ${m.result === null ? "AkanNativeVoidReply" : `AkanNativeReply<${replyType(m, "kotlin")}>`}`,
    ];
    out.push(`    override fun ${kotlinName(m.name)}(${params.join(", ")}) {`, `        reply.${todo}`, "    }");
  });
  out.push("}", "");
  return out.join("\n");
}
