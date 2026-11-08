import type * as TS from "typescript";
import { type AkanAst, createAst, type Ts } from "./ast";
import { type AkanFactReader, type AkanSpan, createFactReader, type FileFacts, ownerOf } from "./moduleFacts";
import { type AkanEntry, type AkanFamily, type AkanTarget, NameTable } from "./nameTable";

export interface AkanIndexOptions {
  ts: Ts;
  root: string;
}

export interface AkanHover {
  name: string;
  targets: AkanTarget[];
}

export interface AkanRenameEdit {
  span: AkanSpan;
  newText: string;
}

export interface AkanSourceKey {
  family: AkanFamily;
  sourceKey: string;
  label: string;
  detail: string[];
  span: AkanSpan;
}

interface UseSite {
  identifier: TS.Identifier;
  chain: string[] | null;
  classModel: string | null;
  inStore: boolean;
}

const sourcePattern = /\.(constant|document|service|signal|store)\.ts$/;
const wordPattern = /[A-Za-z_$][\w$]*/g;
const identifierPattern = /^[A-Za-z_$][\w$]*$/;
const stateReceivers = new Set(["use", "sel", "get", "do"]);
const lensFamilies = new Set<AkanFamily>(["slice", "query", "formSetter", "storeState", "endpoint"]);
const parseCacheSize = 64;

export class AkanIndex {
  readonly #ts: Ts;
  readonly #root: string;
  readonly #ast: AkanAst;
  readonly #reader: AkanFactReader;
  readonly #facts = new Map<string, FileFacts>();
  readonly #fileWords = new Map<string, string>();
  readonly #parsed = new Map<string, { text: string; source: TS.SourceFile }>();
  #table: NameTable | null = null;

  constructor({ ts, root }: AkanIndexOptions) {
    this.#ts = ts;
    this.#root = root.replace(/\\/g, "/").replace(/\/$/, "");
    this.#ast = createAst(ts);
    this.#reader = createFactReader(ts, this.#ast);
  }

  static isSourcePath(fileName: string) {
    return sourcePattern.test(fileName);
  }

  get fileCount() {
    return this.#fileWords.size;
  }

  setFile(fileName: string, text: string) {
    this.#fileWords.set(fileName, `\n${[...new Set(text.match(wordPattern))].join("\n")}\n`);
    if (!AkanIndex.isSourcePath(fileName)) return;
    const source =
      this.#parsed.get(fileName)?.text === text ? this.#parse(fileName, text) : this.#parseUncached(fileName, text);
    this.#facts.set(fileName, this.#reader.read(source, this.#ownerOf(fileName)));
    this.#table = null;
  }

  removeFile(fileName: string) {
    this.#fileWords.delete(fileName);
    this.#parsed.delete(fileName);
    if (this.#facts.delete(fileName)) this.#table = null;
  }

  definitionAt(fileName: string, text: string, offset: number): AkanTarget[] {
    const site = this.#useAt(this.#parse(fileName, text), offset);
    return site ? this.#resolve(fileName, site) : [];
  }

  hoverAt(fileName: string, text: string, offset: number): AkanHover | null {
    const site = this.#useAt(this.#parse(fileName, text), offset);
    if (!site) return null;
    const targets = this.#resolve(fileName, site);
    return targets.length ? { name: site.identifier.text, targets } : null;
  }

  sourceKeysOf(fileName: string): AkanSourceKey[] {
    const keys = new Map<number, AkanSourceKey>();
    for (const entry of this.#nameTable().entriesTargeting(fileName)) {
      if (!lensFamilies.has(entry.family) || keys.has(entry.span.start)) continue;
      const { family, sourceKey, label, detail, span } = entry;
      keys.set(span.start, { family, sourceKey, label, detail, span });
    }
    return [...keys.values()].sort((a, b) => a.span.start - b.span.start);
  }

  sourceKeyAt(fileName: string, offset: number) {
    const entries = this.#sourceEntriesAt(fileName, offset);
    return entries.find((entry) => lensFamilies.has(entry.family)) ?? entries[0] ?? null;
  }

  referencesAt(fileName: string, offset: number, readText: (fileName: string) => string | undefined): AkanSpan[] {
    return this.#usesOf(this.#sourceEntriesAt(fileName, offset), readText).map((use) => use.span);
  }

  renameTargetAt(fileName: string, offset: number) {
    const source = this.#sourceEntriesAt(fileName, offset).find((entry) => entry.renamed);
    return source ? { family: source.family, sourceKey: source.sourceKey, span: source.span } : null;
  }

  renameAt(
    fileName: string,
    offset: number,
    newKey: string,
    readText: (fileName: string) => string | undefined,
  ): AkanRenameEdit[] | null {
    const sources = this.#sourceEntriesAt(fileName, offset).filter((entry) => entry.renamed);
    if (!sources.length || !identifierPattern.test(newKey)) return null;
    return [
      { span: sources[0].span, newText: newKey },
      ...this.#usesOf(sources, readText).map((use) => ({
        span: use.span,
        newText: use.entry.renamed?.(newKey) ?? use.entry.name,
      })),
    ];
  }

  #usesOf(sources: AkanEntry[], readText: (fileName: string) => string | undefined) {
    if (!sources.length) return [];
    const isSource = (target: AkanTarget) =>
      sources.some(
        (source) => source.span.fileName === target.span.fileName && source.span.start === target.span.start,
      );
    const byName = new Map(sources.map((source) => [source.name, source]));
    const naming = new RegExp(
      `\\n(?:${[...byName.keys()].map((name) => name.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|")})\\n`,
    );
    const files = [...this.#fileWords].filter(([, words]) => naming.test(words)).map(([file]) => file);
    const found: { span: AkanSpan; entry: AkanEntry }[] = [];
    for (const file of files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const text = readText(file);
      if (text === undefined) continue;
      const source = this.#parse(file, text);
      const visit = (node: TS.Node) => {
        const entry = this.#ts.isIdentifier(node) ? byName.get(node.text) : undefined;
        const site = entry && this.#ts.isIdentifier(node) ? this.#siteOf(node) : null;
        if (entry && site && this.#resolve(file, site).some(isSource))
          found.push({ span: this.#reader.spanOf(source, site.identifier), entry });
        this.#ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return found;
  }

  #sourceEntriesAt(fileName: string, offset: number) {
    return this.#nameTable()
      .entriesTargeting(fileName)
      .filter((entry) => entry.span.start <= offset && offset <= entry.span.end);
  }

  #nameTable() {
    this.#table ??= new NameTable(this.#facts.values());
    return this.#table;
  }

  #relative(fileName: string) {
    const normalized = fileName.replace(/\\/g, "/");
    return normalized.startsWith(`${this.#root}/`) ? normalized.slice(this.#root.length + 1) : normalized;
  }

  #ownerOf(fileName: string) {
    return ownerOf(this.#relative(fileName));
  }

  #parseUncached(fileName: string, text: string) {
    const kind = fileName.endsWith(".tsx") ? this.#ts.ScriptKind.TSX : this.#ts.ScriptKind.TS;
    return this.#ast.sourceFileFor(fileName, text, kind);
  }

  #parse(fileName: string, text: string) {
    const cached = this.#parsed.get(fileName);
    if (cached?.text === text) return cached.source;
    const source = this.#parseUncached(fileName, text);
    this.#parsed.delete(fileName);
    this.#parsed.set(fileName, { text, source });
    if (this.#parsed.size > parseCacheSize) {
      const oldest = this.#parsed.keys().next().value;
      if (oldest !== undefined) this.#parsed.delete(oldest);
    }
    return source;
  }

  #useAt(source: TS.SourceFile, offset: number) {
    const ts = this.#ts;
    let found: TS.Identifier | null = null;
    const visit = (node: TS.Node) => {
      if (offset < node.getStart(source) || offset > node.getEnd()) return;
      if (ts.isIdentifier(node)) found = node;
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found ? this.#siteOf(found) : null;
  }

  #siteOf(identifier: TS.Identifier): UseSite | null {
    const ts = this.#ts;
    const parent = identifier.parent;
    let chain: string[] | null;
    if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) chain = this.#chainOf(parent.expression);
    else if (
      ts.isBindingElement(parent) &&
      ts.isObjectBindingPattern(parent.parent) &&
      (parent.propertyName === identifier || (!parent.propertyName && parent.name === identifier))
    )
      chain = null;
    else return null;
    const { model, inStore } = this.#classContextOf(identifier);
    return { identifier, chain, classModel: model, inStore };
  }

  #chainOf(expression: TS.Expression): string[] {
    const ts = this.#ts;
    if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression))
      return this.#chainOf(expression.expression);
    if (ts.isIdentifier(expression)) return [expression.text];
    if (expression.kind === ts.SyntaxKind.ThisKeyword) return ["this"];
    if (ts.isPropertyAccessExpression(expression))
      return [...this.#chainOf(expression.expression), expression.name.text];
    return ["?"];
  }

  #classContextOf(node: TS.Node) {
    const ts = this.#ts;
    let current: TS.Node | undefined = node.parent;
    while (current && !ts.isClassDeclaration(current) && !ts.isClassExpression(current)) current = current.parent;
    if (!current) return { model: null, inStore: false };
    const heritage = current.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [];
    for (const { expression } of heritage) {
      if (!ts.isCallExpression(expression)) continue;
      const callee = this.#ast.expressionName(expression.expression);
      const holder =
        callee === "serve"
          ? "db"
          : callee === "store"
            ? "sig"
            : callee === "slice" || callee === "endpoint" || callee === "internal"
              ? "srv"
              : null;
      if (!holder) continue;
      return { model: this.#reader.moduleRefOf(expression.arguments[0], holder), inStore: callee === "store" };
    }
    return { model: null, inStore: false };
  }

  #modelHintOf(site: UseSite) {
    const { chain } = site;
    if (!chain) return null;
    if (chain.length === 1 && chain[0] === "this") return site.classModel;
    if (chain.length === 2 && chain[0] === "this" && chain[1].endsWith("Service")) return chain[1].slice(0, -7);
    if (chain.length === 2 && (chain[0] === "db" || chain[0] === "srv")) return chain[1];
    return null;
  }

  #passesGate(entry: AkanEntry, site: UseSite) {
    const { chain } = site;
    const last = chain?.at(-1);
    switch (entry.gate) {
      case "srv":
      case "sig":
      case "db":
        return chain?.length === 1 && last === entry.gate;
      case "slice":
        return last === "slice";
      case "state":
        return (!!last && stateReceivers.has(last)) || (site.inStore && chain?.length === 1 && last === "this");
      default:
        return true;
    }
  }

  #resolve(fileName: string, site: UseSite): AkanTarget[] {
    const owner = this.#ownerOf(fileName);
    const visible = this.#nameTable()
      .lookup(site.identifier.text)
      .filter(
        (entry) =>
          this.#passesGate(entry, site) &&
          (!owner || !entry.owner || entry.owner === owner || entry.owner.startsWith("libs/")),
      );
    const hint = this.#modelHintOf(site);
    const hinted = hint ? visible.filter((entry) => entry.refName === hint) : [];
    const chosen = hinted.length ? hinted : visible;
    return chosen
      .map(({ family, refName, owner: entryOwner, sourceKey, label, detail, span }) => ({
        family,
        refName,
        owner: entryOwner,
        sourceKey,
        label,
        detail,
        span,
      }))
      .sort((a, b) => Number(b.owner === owner) - Number(a.owner === owner));
  }
}
