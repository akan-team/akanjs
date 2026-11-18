import path from "node:path";
import ts from "typescript";
import type { PackageEntry } from "./barrelAnalyzer";
import {
  type ObjectImportCandidate as Candidate,
  type ObjectMemberTarget as MemberTarget,
  ObjectImportEdits,
  type ObjectMemberUse,
} from "./objectImportEdits";
import { type ObjectBarrels, type ObjectLookupRead, ObjectMemberLookup, type ObjectSource } from "./objectMemberLookup";
import { ObjectModule, type ObjectModuleClause } from "./objectModule";
import { ObjectModuleAnalyzer, resolveModuleFile } from "./objectModuleAnalyzer";
import { hasUseClientDirective } from "./rscUseClientTransform";

export type ObjectKeepReason =
  | ObjectModuleClause
  | "passed-on"
  | "computed-member"
  | "spread"
  | "rendered-or-called"
  | "method-call"
  | "written"
  | "shadowed"
  | "unresolved-member"
  | "server-boundary";

export interface ObjectImportKept {
  object: string;
  file: string;
  line: number;
  reason: ObjectKeepReason;
}

export interface ObjectImportNarrowed {
  object: string;
  file: string;
  /** Each member path the importer reached, `Zone.View` or `Util`. */
  members: string[];
}

export interface ObjectMemberRewrite {
  contents: string | null;
  clientImporter: boolean;
  narrowed: ObjectImportNarrowed[];
  kept: ObjectImportKept[];
  /** The object modules the answer read, copied ones included, and the member files whose exports it consulted. */
  read: string[];
  /** The barrels whose export map said where a copied object is declared. */
  barrels: string[];
}

export interface ObjectMemberImportsOptions {
  resolve: (specifier: string, importer: string) => Promise<string | null>;
  specifierOf?: (file: string, importer: string) => string;
  keepLines?: boolean;
  barrels?: ObjectBarrels;
}

const ASSIGN_OPERATOR_FIRST = ts.SyntaxKind.FirstAssignment;
const ASSIGN_OPERATOR_LAST = ts.SyntaxKind.LastAssignment;
const NAMED_IMPORT_RE = /\bimport\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//* Rewrites an import of an object module's object to imports of the members the importer writes out
//* (`Memo.Zone.View`, `<Field.Text />`, `const { Util } = Memo`); any other use keeps the whole object for that file.
export class ObjectMemberImports {
  static readonly keyPrefix = "object:";
  readonly #modules: ObjectModuleAnalyzer;
  readonly #lookup: ObjectMemberLookup;
  readonly #resolve: ObjectMemberImportsOptions["resolve"];
  readonly #specifierOf: NonNullable<ObjectMemberImportsOptions["specifierOf"]>;
  readonly #keepLines: boolean;

  constructor(
    {
      resolve,
      specifierOf = ObjectMemberImports.absoluteSpecifier,
      keepLines = false,
      barrels,
    }: ObjectMemberImportsOptions,
    modules = new ObjectModuleAnalyzer(),
  ) {
    this.#resolve = resolve;
    this.#specifierOf = specifierOf;
    this.#keepLines = keepLines;
    this.#modules = modules;
    this.#lookup = new ObjectMemberLookup(modules, resolve, barrels);
  }

  get modules() {
    return this.#modules;
  }

  static absoluteSpecifier(file: string) {
    return file.split(path.sep).join("/");
  }

  static resolverOf(
    resolvePackage: (pkgName: string) => Promise<PackageEntry | null>,
  ): ObjectMemberImportsOptions["resolve"] {
    const packages = new Map<string, Promise<string | null>>();
    return async (specifier, importer) => {
      let resolved: Promise<string | null> | undefined;
      if (ObjectMemberImports.#isPathSpecifier(specifier)) resolved = resolveModuleFile(importer, specifier);
      else {
        resolved = packages.get(specifier);
        if (!resolved) {
          resolved = resolvePackage(specifier).then((pkg) => pkg?.entryFile ?? null);
          packages.set(specifier, resolved);
        }
      }
      const file = await resolved;
      return file && (!NODE_MODULES_RE.test(file) || AKANJS_NODE_MODULE_RE.test(file)) ? file : null;
    };
  }

  static keyOf(file: string, object: string) {
    return `${ObjectMemberImports.keyPrefix}${file}#${object}`;
  }

  static parseKey(key: string): { file: string; object: string } | null {
    if (!key.startsWith(ObjectMemberImports.keyPrefix)) return null;
    const hash = key.lastIndexOf("#");
    return { file: key.slice(ObjectMemberImports.keyPrefix.length, hash), object: key.slice(hash + 1) };
  }

  async rewrite(source: string, importer: string): Promise<ObjectMemberRewrite | null> {
    const locals = ObjectMemberImports.#candidateLocals(source);
    if (locals.size === 0) return null;
    const sourceFile = ts.createSourceFile(
      importer,
      source,
      ts.ScriptTarget.Latest,
      true,
      ObjectModule.scriptKindOf(importer),
    );
    const candidates = ObjectMemberImports.#importsOf(sourceFile, locals);
    if (candidates.size === 0) return null;
    const read: ObjectLookupRead = { files: new Set(), barrels: new Set() };
    const sources = new Map<Candidate, ObjectSource>();
    for (const candidate of candidates.values()) {
      const specifier = (candidate.declaration.moduleSpecifier as ts.StringLiteral).text;
      const file = await this.#resolve(specifier, importer);
      if (!file) continue;
      const facts = await this.#modules.facts(file);
      const shape = facts?.objects.get(candidate.imported);
      if (!facts || !shape) continue;
      const objectSource = { file, object: candidate.imported, facts, shape };
      if (!(await this.#lookup.namesFile(objectSource, read))) continue;
      candidate.file = file;
      read.files.add(file);
      sources.set(candidate, objectSource);
    }
    if (sources.size === 0) return null;
    ObjectMemberImports.#classifyUses(sourceFile, new Map([...sources.keys()].map((c) => [c.local, c])));
    const clientImporter = hasUseClientDirective(source);
    const result: ObjectMemberRewrite = {
      contents: null,
      clientImporter,
      narrowed: [],
      kept: [],
      read: [],
      barrels: [],
    };
    const plan = new ObjectImportEdits(source, sourceFile, this.#keepLines);
    for (const [candidate, objectSource] of sources) {
      const { file, facts } = objectSource;
      const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const keep = (reason: ObjectKeepReason, node: ts.Node) =>
        result.kept.push({ object: candidate.imported, file, line: lineOf(node), reason });
      if (facts.failed) {
        keep(facts.failed.clause, candidate.element);
        continue;
      }
      if (candidate.shadowed) {
        keep("shadowed", candidate.element);
        continue;
      }
      if (candidate.keep) {
        keep(candidate.keep.reason, candidate.keep.node);
        continue;
      }
      const targets = await this.#targetsOf(candidate, objectSource, importer, clientImporter, read);
      if ("reason" in targets) {
        keep(targets.reason, targets.node);
        continue;
      }
      plan.narrow(candidate, targets, (target) => target.bare ?? this.#specifierOf(target.file, importer));
      result.narrowed.push({
        object: candidate.imported,
        file,
        members: [...new Set(targets.map(({ written }) => written))].sort(),
      });
    }
    result.read = [...read.files];
    result.barrels = [...read.barrels];
    result.contents = plan.apply();
    return result;
  }

  async fingerprint(file: string, object: string, members: string[], clientImporter: boolean): Promise<string> {
    const facts = await this.#modules.facts(file);
    const shape = facts?.objects.get(object);
    const read: ObjectLookupRead = { files: new Set(), barrels: new Set() };
    const targets = await Promise.all(
      members.map(async (member) => {
        if (!facts || !shape) return null;
        const called = member.endsWith("()");
        const memberPath = (called ? member.slice(0, -2) : member).split(".");
        const target = await this.#targetOf({ file, object, facts, shape }, memberPath, file, clientImporter, read);
        return await this.#calledTargetOf(target, memberPath, called);
      }),
    );
    return Bun.hash(JSON.stringify([facts?.failed ?? null, targets])).toString(36);
  }

  async filesOf(file: string): Promise<string[]> {
    const { modules, barrelFiles } = await this.#lookup.reach(file);
    return [...new Set([...(await this.#memberFilesOf(modules)), ...barrelFiles])];
  }

  //? A barrel moves a fingerprint only by where it declares a copied object: the links hold that, not its exports.
  async digest(file: string): Promise<string> {
    const { modules, links } = await this.#lookup.reach(file);
    const facts = await Promise.all(
      modules.map(async (module) => {
        const moduleFacts = await this.#modules.facts(module);
        const objects = [...(moduleFacts?.objects ?? [])].map(([name, shape]) => [
          name,
          shape.open,
          [...shape.members].map(([key, member]) => [key, member?.specifier ?? null, member?.imported ?? null]),
          shape.copied.map(({ specifier, imported }) => [specifier, imported]),
        ]);
        return [moduleFacts?.useClient, moduleFacts?.failed, objects];
      }),
    );
    const exports = await Promise.all(
      (await this.#memberFilesOf(modules)).map(async (member) => {
        const scanned = await this.#modules.exportsOf(member);
        const thisFree = [...(await this.#modules.thisFreeOf(member))].sort();
        return [member, scanned ? [[...scanned.names].sort(), scanned.star, scanned.useClient, thisFree] : null];
      }),
    );
    return Bun.hash(JSON.stringify([facts, links, exports])).toString(36);
  }

  async #memberFilesOf(modules: string[]): Promise<string[]> {
    const files = new Set<string>();
    for (const file of modules) {
      files.add(file);
      const facts = await this.#modules.facts(file);
      for (const shape of facts?.objects.values() ?? [])
        for (const member of shape.members.values()) {
          if (!member || !ObjectMemberImports.#isPathSpecifier(member.specifier)) continue;
          const resolved = await resolveModuleFile(file, member.specifier);
          if (resolved) files.add(resolved);
        }
    }
    return [...files];
  }

  async #targetsOf(
    candidate: Candidate,
    source: ObjectSource,
    importer: string,
    clientImporter: boolean,
    read: ObjectLookupRead,
  ): Promise<ObjectMemberUse[] | { reason: ObjectKeepReason; node: ts.Node }> {
    const targets: ObjectMemberUse[] = [];
    const uses = [
      ...candidate.paths,
      ...candidate.destructures.flatMap(({ keys, node }) =>
        keys.map((key) => ({ path: [key], nodes: [node], called: false })),
      ),
    ];
    for (const use of uses) {
      const found = await this.#targetOf(source, use.path, importer, clientImporter, read);
      const target = await this.#calledTargetOf(found, use.path, use.called);
      const node = use.nodes[0] ?? candidate.element;
      if (typeof target === "string") return { reason: target, node };
      targets.push({
        member: use.path.slice(0, target.depth).join("."),
        written: `${use.path.join(".")}${use.called ? "()" : ""}`,
        target,
        nodes: use.nodes,
      });
    }
    return targets;
  }

  //? Called through the object, a member gets the object as `this`; imported alone it would get none.
  async #calledTargetOf(
    target: MemberTarget | ObjectKeepReason,
    memberPath: string[],
    called: boolean,
  ): Promise<MemberTarget | ObjectKeepReason> {
    if (typeof target === "string" || !called || target.depth !== memberPath.length) return target;
    if (target.imported !== "*" && (await this.#modules.thisFreeOf(target.file)).has(target.imported)) return target;
    return "method-call";
  }

  async #targetOf(
    source: ObjectSource,
    memberPath: string[],
    importer: string,
    clientImporter: boolean,
    read: ObjectLookupRead,
  ): Promise<MemberTarget | ObjectKeepReason> {
    const owner = await this.#lookup.find(source, memberPath, read);
    if (typeof owner === "string") return owner;
    const { member, nested } = owner;
    const inner = memberPath[1];
    const bare = ObjectMemberImports.#isPathSpecifier(member.specifier) ? null : member.specifier;
    const target = bare
      ? ObjectMemberImports.#sameBareTarget(bare, owner.file, importer)
      : await resolveModuleFile(owner.file, member.specifier);
    if (!target) return "unresolved-member";
    const exports = await this.#modules.exportsOf(target);
    if (!exports) return "unresolved-member";
    read.files.add(target);
    if (owner.useClient && !clientImporter && !exports.useClient) return "server-boundary";
    if (nested) return { file: target, bare, imported: member.imported, depth: 2 };
    if (member.imported !== "*") return { file: target, bare, imported: member.imported, depth: 1 };
    if (inner !== undefined && exports.names.has(inner)) return { file: target, bare, imported: inner, depth: 2 };
    return { file: target, bare, imported: "*", depth: 1 };
  }

  //? A bare member is written as the object module wrote it only when the importer resolves it to the same file.
  static #sameBareTarget(specifier: string, objectFile: string, importer: string): string | null {
    try {
      const fromObject = Bun.resolveSync(specifier, path.dirname(objectFile));
      const fromImporter = Bun.resolveSync(specifier, path.dirname(importer));
      return fromObject === fromImporter ? fromObject : null;
    } catch {
      return null;
    }
  }

  static #isPathSpecifier(specifier: string) {
    return specifier.startsWith(".") || path.isAbsolute(specifier);
  }

  static #candidateLocals(source: string): Set<string> {
    const locals = new Set<string>();
    for (const match of source.matchAll(NAMED_IMPORT_RE)) {
      for (const raw of (match[1] ?? "").split(",")) {
        const item = raw.trim();
        if (!item || item.startsWith("type ")) continue;
        const local =
          item
            .split(/\sas\s/)
            .pop()
            ?.trim() ?? "";
        if (!IDENTIFIER_RE.test(local)) continue;
        const name = escapeRe(local);
        if (new RegExp(`(?<![\\w$.])${name}\\s*\\??\\.\\s*[A-Za-z_$]|=\\s*${name}(?![\\w$])`).test(source))
          locals.add(local);
      }
    }
    return locals;
  }

  static #importsOf(sourceFile: ts.SourceFile, locals: Set<string>): Map<string, Candidate> {
    const candidates = new Map<string, Candidate>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (statement.attributes) continue;
      const clause = statement.importClause;
      if (!clause || clause.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
      const bindings = clause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        const local = element.name.text;
        if (element.isTypeOnly || !locals.has(local)) continue;
        if (element.propertyName && !ts.isIdentifier(element.propertyName)) continue;
        candidates.set(local, {
          declaration: statement,
          element,
          local,
          imported: (element.propertyName ?? element.name).text,
          shadowed: candidates.has(local),
          typeUse: false,
          keep: null,
          paths: [],
          destructures: [],
        });
      }
    }
    return candidates;
  }

  static #classifyUses(sourceFile: ts.SourceFile, candidates: Map<string, Candidate>) {
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        const candidate = candidates.get(node.text);
        if (candidate) ObjectMemberImports.#classify(node, candidate);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  static #classify(id: ts.Identifier, candidate: Candidate) {
    if (id === candidate.element.name || ObjectMemberImports.#isPropertyName(id)) return;
    if (ObjectMemberImports.#isDeclarationName(id)) {
      candidate.shadowed = true;
      return;
    }
    if (ObjectMemberImports.#isType(id)) {
      candidate.typeUse = true;
      return;
    }
    const keep = (reason: ObjectKeepReason, node: ts.Node = id) => {
      candidate.keep ??= { reason, node };
    };
    const nodes: ts.Expression[] = [];
    let current: ts.Expression = id;
    while (nodes.length < 2) {
      const parent: ts.Node = current.parent;
      if (!ts.isPropertyAccessExpression(parent) || parent.expression !== current || parent.questionDotToken) break;
      if (!ts.isIdentifier(parent.name)) break;
      nodes.push(parent);
      current = parent;
    }
    const last = nodes.at(-1);
    if (last) {
      if (nodes.some((node) => ObjectMemberImports.#isWritten(node))) return keep("written");
      candidate.paths.push({
        path: nodes.map((node) => ((node as ts.PropertyAccessExpression).name as ts.Identifier).text),
        nodes,
        called: ObjectMemberImports.#isCallee(last),
      });
      return;
    }
    const parent = id.parent;
    if (ts.isVariableDeclaration(parent) && parent.initializer === id && ts.isObjectBindingPattern(parent.name)) {
      const keys: string[] = [];
      for (const element of parent.name.elements) {
        if (element.dotDotDotToken) return keep("spread");
        const name = element.propertyName ?? element.name;
        if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) return keep("computed-member");
        keys.push(name.text);
      }
      if (keys.length === 0) return keep("passed-on");
      candidate.destructures.push({ node: id, keys });
      return;
    }
    if (ts.isElementAccessExpression(parent) && parent.expression === id) return keep("computed-member");
    if (ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent) || ts.isJsxSpreadAttribute(parent))
      return keep("spread");
    if (ObjectMemberImports.#isRenderedOrCalled(id)) return keep("rendered-or-called");
    if (ObjectMemberImports.#isWritten(id)) return keep("written");
    keep("passed-on");
  }

  static #isRenderedOrCalled(id: ts.Identifier) {
    const parent = id.parent;
    if (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent))
      return parent.tagName === id;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) return parent.expression === id;
    return ts.isTaggedTemplateExpression(parent) && parent.tag === id;
  }

  static #isCallee(node: ts.Node) {
    let current = node;
    while (ObjectMemberImports.#isTransparent(current.parent)) current = current.parent;
    const parent = current.parent;
    if (ts.isCallExpression(parent)) return parent.expression === current;
    return ts.isTaggedTemplateExpression(parent) && parent.tag === current;
  }

  //? A node inside an array or object literal is written when that literal is a destructuring target.
  static #isWritten(node: ts.Node): boolean {
    const parent = node.parent;
    if (ObjectMemberImports.#isTransparent(parent)) return ObjectMemberImports.#isWritten(parent);
    if (ts.isBinaryExpression(parent))
      return (
        parent.left === node &&
        parent.operatorToken.kind >= ASSIGN_OPERATOR_FIRST &&
        parent.operatorToken.kind <= ASSIGN_OPERATOR_LAST
      );
    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
      return [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator);
    if (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) return parent.initializer === node;
    if (ts.isPropertyAssignment(parent))
      return parent.initializer === node && ObjectMemberImports.#isWritten(parent.parent);
    if (ts.isSpreadAssignment(parent)) return ObjectMemberImports.#isWritten(parent.parent);
    if (ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent))
      return ObjectMemberImports.#isWritten(parent);
    return ts.isDeleteExpression(parent);
  }

  static #isTransparent(node: ts.Node) {
    return (
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression(node)
    );
  }

  static #isPropertyName(id: ts.Identifier) {
    const parent = id.parent;
    if (ts.isPropertyAccessExpression(parent)) return parent.name === id;
    if (ts.isQualifiedName(parent)) return parent.right === id;
    if (ts.isBindingElement(parent)) return parent.propertyName === id;
    if (ts.isImportSpecifier(parent)) return parent.propertyName === id;
    if (ts.isExportSpecifier(parent)) return !!parent.propertyName && parent.name === id;
    if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return true;
    if (
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isJsxAttribute(parent)
    )
      return parent.name === id;
    return false;
  }

  static #isDeclarationName(id: ts.Identifier) {
    const parent = id.parent;
    if (
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportEqualsDeclaration(parent) ||
      ts.isBindingElement(parent)
    )
      return parent.name === id;
    return false;
  }

  static #isType(id: ts.Identifier) {
    for (let node: ts.Node = id; node.parent; node = node.parent) {
      const parent: ts.Node = node.parent;
      if (ts.isExpressionWithTypeArguments(parent)) {
        const heritage = parent.parent;
        if (!ts.isHeritageClause(heritage)) return false;
        const owner = heritage.parent;
        return !(
          heritage.token === ts.SyntaxKind.ExtendsKeyword &&
          (ts.isClassDeclaration(owner) || ts.isClassExpression(owner))
        );
      }
      if (ts.isTypeNode(parent)) return true;
      if (ts.isStatement(parent) || ts.isSourceFile(parent)) return false;
    }
    return false;
  }
}
