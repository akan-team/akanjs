// Plugin specs (PL-10): the TypeScript API interface in a plugin's src/index.ts, read without the
// TypeScript compiler (akan-native has no runtime dependencies). Only the type syntax plugin APIs need
// is understood, the way react-native-codegen accepts a subset of TS for TurboModule specs:
// primitives, string-literal unions, `| null`, optional members, arrays, object literals,
// Record<string, T>, `unknown`, and interfaces / type aliases declared in the same file (plus
// FileRef, Platform and ErrorCode from @akanjs/native/core). Everything else becomes an "unsupported"
// node, which the checker ignores and the code generators report.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ERROR_CODES } from "../../../core/src/contract.ts";
import { CliError } from "./log.ts";

export type TypeNode =
  | { kind: "string" | "number" | "boolean" | "unknown" | "void" }
  | { kind: "literal"; values: string[] }
  | { kind: "array"; of: TypeNode }
  | { kind: "record"; of: TypeNode }
  | { kind: "object"; fields: Field[] }
  | { kind: "ref"; name: string }
  | { kind: "nullable"; of: TypeNode }
  /** `A & { b: string }`: the generators merge the object parts (as react-native-codegen flattens them). */
  | { kind: "intersection"; of: TypeNode[] }
  /** A union with named members (`"any" | OrientationType`): fine when every member is a string union. */
  | { kind: "union"; of: TypeNode[] }
  | { kind: "unsupported"; text: string; reason: string };

export interface Field {
  name: string;
  type: TypeNode;
  optional: boolean;
  doc?: string;
}

export interface Method {
  name: string;
  doc?: string;
  /** The single argument object, if the method takes one. */
  param?: { name: string; type: TypeNode; optional: boolean };
  /** What the Promise resolves to (void for none). */
  returns: TypeNode;
}

export type Declaration =
  | { kind: "interface"; name: string; doc?: string; extends: string[]; fields: Field[]; methods: Method[] }
  | { kind: "alias"; name: string; doc?: string; type: TypeNode };

export interface PluginSpec {
  /** The file the spec was read from. */
  file: string;
  api: string;
  events?: string;
  methods: Method[];
  /** Event name → payload type, from the Events interface (the second definePlugin type argument). */
  eventTypes: Field[];
  /** Declarations of the file, for resolving refs. */
  declarations: Map<string, Declaration>;
}

/** @akanjs/native/core types plugin specs may use. */
export const BUILTIN_TYPES: Record<string, Declaration> = {
  FileRef: {
    kind: "interface",
    name: "FileRef",
    doc: "A file served by the host at /__akan_native/file/<id> (PL-7).",
    extends: [],
    methods: [],
    fields: [
      { name: "url", type: { kind: "string" }, optional: false },
      { name: "mime", type: { kind: "string" }, optional: false },
      { name: "size", type: { kind: "number" }, optional: false },
    ],
  },
  Platform: {
    kind: "alias",
    name: "Platform",
    type: { kind: "literal", values: ["web", "macos", "windows", "linux", "ios", "android"] },
  },
  ErrorCode: {
    kind: "alias",
    name: "ErrorCode",
    type: { kind: "literal", values: [...ERROR_CODES] },
  },
};

// ------------------------------------------------------------------ tokens

interface Token {
  kind: "ident" | "string" | "number" | "punct";
  text: string;
  /** The JSDoc comment right before this token, if any. */
  doc?: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let doc: string | undefined;
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (source.startsWith("//", i)) {
      i = source.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const text = source.slice(i + 2, end < 0 ? source.length : end);
      if (text.startsWith("*")) doc = cleanDoc(text.slice(1));
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const push = (kind: Token["kind"], text: string) => {
      tokens.push(doc === undefined ? { kind, text } : { kind, text, doc });
      doc = undefined;
    };
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") j++;
        value += source[j];
        j++;
      }
      push("string", value);
      i = j + 1;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(source.slice(i, i + 200));
    if (word) {
      push("ident", word[0]);
      i += word[0].length;
      continue;
    }
    const num = /^\d[\d_.]*/.exec(source.slice(i, i + 50));
    if (num) {
      push("number", num[0]);
      i += num[0].length;
      continue;
    }
    const punct = source.startsWith("=>", i) ? "=>" : source.startsWith("...", i) ? "..." : c;
    push("punct", punct);
    i += punct.length;
  }
  return tokens;
}

function cleanDoc(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.replace(/^\s*\*?\s?/, "").trimEnd());
  const out = lines.join("\n").trim();
  return out || undefined;
}

// ------------------------------------------------------------------ parser

class Parser {
  i = 0;
  constructor(readonly tokens: Token[]) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }
  is(text: string, offset = 0): boolean {
    return this.tokens[this.i + offset]?.text === text;
  }
  take(): Token {
    const t = this.tokens[this.i++];
    if (!t) throw new SpecSyntaxError("unexpected end of file");
    return t;
  }
  expect(text: string): Token {
    const t = this.take();
    if (t.text !== text) throw new SpecSyntaxError(`expected "${text}" but found "${t.text}"`);
    return t;
  }
  eat(text: string): boolean {
    if (!this.is(text)) return false;
    this.i++;
    return true;
  }

  /** Skips a balanced (), [], {} or <> group starting at the current token. */
  skipGroup(): void {
    const open = this.take().text;
    const close = ({ "(": ")", "[": "]", "{": "}", "<": ">" } as Record<string, string>)[open]!;
    let depth = 1;
    while (depth > 0 && this.i < this.tokens.length) {
      const t = this.take().text;
      if (t === open) depth++;
      else if (t === close) depth--;
    }
  }

  // type := ["|"] intersection ("|" intersection)*      intersection := postfix ("&" postfix)*
  type(): TypeNode {
    const start = this.i;
    this.eat("|");
    const members = [this.intersection()];
    while (this.eat("|")) members.push(this.intersection());
    return union(members, this.textFrom(start));
  }

  intersection(): TypeNode {
    const parts = [this.postfix()];
    while (this.eat("&")) parts.push(this.postfix());
    return parts.length === 1 ? parts[0]! : { kind: "intersection", of: parts };
  }

  /** At "(": whether this starts a function type such as `(value: string) => void`. */
  isFunctionType(): boolean {
    const next = this.peek(1);
    if (!next) return false;
    if (next.text === ")" || next.text === "...") return true;
    return next.kind === "ident" && [":", "?", ",", ")"].includes(this.peek(2)?.text ?? "");
  }

  postfix(): TypeNode {
    let node = this.primary();
    while (this.is("[") && this.is("]", 1)) {
      this.i += 2;
      node = { kind: "array", of: node };
    }
    return node;
  }

  primary(): TypeNode {
    const start = this.i;
    if (this.is("(") && this.isFunctionType()) {
      this.skipGroup();
      this.expect("=>");
      this.type();
      return this.unsupportedFrom(start, "function types are not supported");
    }
    const t = this.take();
    if (t.kind === "string") return { kind: "literal", values: [t.text] };
    if (t.text === "(") {
      const inner = this.type();
      this.expect(")");
      return inner;
    }
    if (t.text === "{") {
      this.i--;
      return { kind: "object", fields: this.members().fields };
    }
    if (t.kind === "number" || t.text === "-")
      return this.unsupportedFrom(start, "number literal types are not supported; use number");
    if (t.kind !== "ident") return this.unsupportedFrom(start, `unexpected "${t.text}"`);
    switch (t.text) {
      case "string":
      case "number":
      case "boolean":
      case "unknown":
      case "void":
        return { kind: t.text };
      case "any":
      case "object":
        return { kind: "unknown" };
      case "null":
        return { kind: "literal", values: [] }; // folded into nullable by union()
      case "undefined":
        return { kind: "literal", values: [] };
      case "true":
      case "false":
        return this.unsupportedFrom(start, "boolean literal types are not supported; use boolean");
      case "never":
        return this.unsupportedFrom(start, "never is only allowed as Record<string, never> (an empty object)");
    }
    let name = t.text;
    while (this.is(".")) {
      this.i++;
      name += `.${this.take().text}`;
    }
    const args: TypeNode[] = [];
    if (this.is("<")) {
      this.i++;
      args.push(this.type());
      while (this.eat(",")) args.push(this.type());
      this.expect(">");
    }
    if (name === "Array" || name === "ReadonlyArray")
      return args[0] ? { kind: "array", of: args[0] } : this.unsupportedFrom(start, "Array needs a type argument");
    if (name === "Record") {
      // Keys arrive as JSON object keys either way; a literal union key is not checked.
      if (!args[1] || !["string", "literal", "ref"].includes(args[0]?.kind ?? ""))
        return this.unsupportedFrom(start, "only Record<string, T> is supported");
      if (args[1].kind === "unsupported" && args[1].text === "never") return { kind: "object", fields: [] };
      return { kind: "record", of: args[1] };
    }
    if (name === "Promise") return args[0] ?? { kind: "void" };
    if (args.length) return this.unsupportedFrom(start, `generic type ${name}<…> is not supported`);
    if (this.is("=>")) return this.unsupportedFrom(start, "function types are not supported");
    return { kind: "ref", name };
  }

  /** `{ a: T; b?: U; m(x: V): Promise<W>; }` */
  members(): { fields: Field[]; methods: Method[] } {
    this.expect("{");
    const fields: Field[] = [];
    const methods: Method[] = [];
    while (!this.eat("}")) {
      if (this.eat(";") || this.eat(",")) continue;
      const doc = this.peek()!.doc;
      if (this.is("readonly") && (this.peek(1)?.kind === "ident" || this.peek(1)?.kind === "string")) this.i++;
      if (this.is("[")) {
        // index signature: [key: string]: T
        const start = this.i;
        this.skipGroup();
        this.expect(":");
        this.type();
        fields.push({
          name: "[index]",
          type: this.unsupportedFrom(start, "index signatures are not supported; use Record<string, T>"),
          optional: true,
        });
        continue;
      }
      const nameToken = this.take();
      const name = nameToken.text;
      const optional = this.eat("?");
      if (this.is("(") || this.is("<")) {
        methods.push(this.methodRest(name, doc));
        continue;
      }
      this.expect(":");
      fields.push({ name, type: this.type(), optional, ...(doc ? { doc } : {}) });
    }
    return { fields, methods };
  }

  methodRest(name: string, doc: string | undefined): Method {
    if (this.is("<")) this.skipGroup();
    this.expect("(");
    let param: Method["param"];
    const params: NonNullable<Method["param"]>[] = [];
    while (!this.eat(")")) {
      if (this.eat(",")) continue;
      const pname = this.take().text;
      const optional = this.eat("?");
      this.expect(":");
      params.push({ name: pname, optional, type: this.type() });
    }
    if (params.length > 1)
      param = {
        name: params[0]!.name,
        optional: false,
        type: {
          kind: "unsupported",
          text: params.map((p) => p.name).join(", "),
          reason: "methods take one argument object",
        },
      };
    else param = params[0];
    let returns: TypeNode = { kind: "void" };
    if (this.eat(":")) {
      const start = this.i;
      const promise = this.is("Promise");
      returns = this.type();
      if (!promise) returns = this.unsupportedFrom(start, "methods must return a Promise");
    }
    return { name, ...(doc ? { doc } : {}), ...(param ? { param } : {}), returns };
  }

  textFrom(start: number): string {
    return this.tokens
      .slice(start, this.i)
      .map((t) => (t.kind === "string" ? JSON.stringify(t.text) : t.text))
      .join(" ");
  }

  unsupportedFrom(start: number, reason: string): TypeNode {
    return { kind: "unsupported", text: this.textFrom(start), reason };
  }
}

class SpecSyntaxError extends Error {}

/** Folds `null` / `undefined` into nullable, and string literals into one literal union. */
function union(members: TypeNode[], text: string): TypeNode {
  const nullable = members.some((m) => m.kind === "literal" && m.values.length === 0);
  const rest = members.filter((m) => !(m.kind === "literal" && m.values.length === 0));
  let node: TypeNode;
  if (rest.length === 0) node = { kind: "unsupported", text, reason: "a type that is only null" };
  else if (rest.length === 1) node = rest[0]!;
  else if (rest.every((m) => m.kind === "literal"))
    node = { kind: "literal", values: rest.flatMap((m) => (m as { values: string[] }).values) };
  else if (rest.every((m) => m.kind === "literal" || m.kind === "ref")) node = { kind: "union", of: rest };
  else node = { kind: "unsupported", text, reason: "unions other than string literals and null are not supported" };
  return nullable ? { kind: "nullable", of: node } : node;
}

/** Top-level interfaces and type aliases of a TS file, and the type arguments of definePlugin<…>. */
export function parseDeclarations(source: string): {
  declarations: Map<string, Declaration>;
  imports: string[];
  definePlugin?: { api: string; events?: string };
} {
  const p = new Parser(tokenize(source));
  const declarations = new Map<string, Declaration>();
  const imports: string[] = [];
  let definePlugin: { api: string; events?: string } | undefined;
  let depth = 0;
  while (p.i < p.tokens.length) {
    const t = p.peek()!;
    if (t.text === "definePlugin" && p.is("<", 1) && !definePlugin) {
      p.i += 2;
      let api = "{}";
      if (p.is("{")) p.skipGroup();
      else api = p.take().text;
      const events = p.eat(",") ? p.take().text : undefined;
      definePlugin = { api, ...(events ? { events } : {}) };
      continue;
    }
    if (
      depth === 0 &&
      t.kind === "ident" &&
      (t.text === "interface" || (t.text === "type" && p.peek(1)?.kind === "ident" && (p.is("=", 2) || p.is("<", 2))))
    ) {
      const doc = p.tokens[p.i - 1]?.text === "export" ? p.tokens[p.i - 1]!.doc : t.doc;
      const start = p.i;
      p.i++;
      try {
        if (t.text === "interface") {
          const name = p.take().text;
          if (p.is("<")) p.skipGroup();
          const parents: string[] = [];
          if (p.eat("extends")) {
            do parents.push(p.take().text);
            while (p.eat(","));
          }
          const { fields, methods } = p.members();
          declarations.set(name, {
            kind: "interface",
            name,
            ...(doc ? { doc } : {}),
            extends: parents,
            fields,
            methods,
          });
        } else {
          const name = p.take().text;
          if (p.is("<")) {
            p.skipGroup();
            declarations.set(name, {
              kind: "alias",
              name,
              type: { kind: "unsupported", text: name, reason: "generic type aliases are not supported" },
            });
            continue;
          }
          p.expect("=");
          declarations.set(name, { kind: "alias", name, ...(doc ? { doc } : {}), type: p.type() });
        }
      } catch (error) {
        if (!(error instanceof SpecSyntaxError)) throw error;
        // Not a declaration we understand: scan on from the keyword so the nesting depth stays right.
        p.i = start + 1;
      }
      continue;
    }
    if (depth === 0 && t.text === "from" && p.peek(1)?.kind === "string" && p.peek(1)!.text.startsWith("."))
      imports.push(p.peek(1)!.text);
    if (t.text === "{" || t.text === "(" || t.text === "[") depth++;
    else if (t.text === "}" || t.text === ")" || t.text === "]") depth--;
    p.i++;
  }
  return { declarations, imports, ...(definePlugin ? { definePlugin } : {}) };
}

/** Resolves a ref to its declaration: the file's own, then @akanjs/native/core's. */
export function lookup(spec: Pick<PluginSpec, "declarations">, name: string): Declaration | undefined {
  return spec.declarations.get(name) ?? BUILTIN_TYPES[name];
}

/** All fields of an interface, including the ones it extends (parents first). */
export function interfaceFields(
  spec: Pick<PluginSpec, "declarations">,
  decl: Extract<Declaration, { kind: "interface" }>,
  seen = new Set<string>(),
): Field[] {
  if (seen.has(decl.name)) throw new CliError(`interface ${decl.name} extends itself`);
  seen.add(decl.name);
  const out = new Map<string, Field>();
  for (const parent of decl.extends) {
    const p = lookup(spec, parent);
    if (p?.kind !== "interface")
      throw new CliError(
        `${decl.name} extends ${parent}, which is not an interface in this file or @akanjs/native/core`,
      );
    for (const f of interfaceFields(spec, p, seen)) out.set(f.name, f);
  }
  for (const f of decl.fields) out.set(f.name, f);
  return [...out.values()];
}

/** Reads the spec of a plugin: the definePlugin<Api, Events> interfaces in src/index.ts. */
export function readPluginSpec(pluginDir: string, file = "src/index.ts"): PluginSpec {
  const path = join(pluginDir, file);
  if (!existsSync(path))
    throw new CliError(`${path} not found (the plugin spec is the definePlugin<Api> interface there)`);
  const { declarations, imports, definePlugin } = parseDeclarations(readFileSync(path, "utf8"));
  if (!definePlugin) throw new CliError(`${path}: no definePlugin<Api>(…) call`);
  // Types from the plugin's own modules (import type { X } from "./types.ts"); the file's own win.
  const visited = new Set([path]);
  const pending = imports.map((spec) => resolve(dirname(path), spec));
  while (pending.length) {
    const file = pending.shift()!;
    const found = [file, `${file}.ts`, join(file, "index.ts")].find((f) => existsSync(f) && !statSync(f).isDirectory());
    if (!found || visited.has(found)) continue;
    visited.add(found);
    const imported = parseDeclarations(readFileSync(found, "utf8"));
    for (const [name, decl] of imported.declarations) if (!declarations.has(name)) declarations.set(name, decl);
    pending.push(...imported.imports.map((spec) => resolve(dirname(found), spec)));
  }
  const api = definePlugin.api === "{}" ? undefined : declarations.get(definePlugin.api);
  if (definePlugin.api !== "{}" && api?.kind !== "interface")
    throw new CliError(`${path}: ${definePlugin.api} is not an interface declared in this file`);
  const events = definePlugin.events ? declarations.get(definePlugin.events) : undefined;
  if (definePlugin.events && events?.kind !== "interface")
    throw new CliError(`${path}: ${definePlugin.events} is not an interface declared in this file`);
  return {
    file: path,
    api: api?.name ?? "{}",
    ...(events ? { events: events.name } : {}),
    methods: api?.kind === "interface" ? api.methods : [],
    eventTypes: events?.kind === "interface" ? interfaceFields({ declarations }, events) : [],
    declarations,
  };
}
