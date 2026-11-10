import type { AkanGraph } from "akanjs/common/akanGraph.ts";
import type * as TS from "typescript";
import { GraphBuilder } from "./akanGraph";
import { type AkanAst, createAst, type Ts } from "./ast";
import {
  type AkanFactReader,
  type AkanSpan,
  createFactReader,
  type FileFacts,
  ownerOf,
  testFilePattern,
} from "./moduleFacts";
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
const dictionaryPattern = /\.dictionary\.ts$/;
const srvkitPattern = /\/srvkit\//;
const wordPattern = /[A-Za-z_$][\w$]*/g;
const identifierPattern = /^[A-Za-z_$][\w$]*$/;
const regExpSpecials = /[\\^$.*+?()[\]{}|]/g;
const stateReceivers = new Set(["use", "sel", "get", "do"]);
const lensFamilies = new Set<AkanFamily>(["slice", "query", "formSetter", "storeState", "endpoint"]);
const modellessFamilies = new Set<AkanFamily>(["query", "storeState", "endpoint"]);
const gateWords: Partial<Record<string, string>> = { srv: "srv", sig: "sig", db: "db", slice: "slice" };
const parseCacheSize = 64;

//? TypeScript rewrites a source file's name to forward slashes, and every span carries that name.
const pathOf = (fileName: string) => fileName.replace(/\\/g, "/");
const escapeRegExp = (text: string) => text.replace(regExpSpecials, (special) => `\\${special}`);
const receiverGap = String.raw`(?:\s|\)|\/\*[\s\S]*?\*\/)*`;

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
    this.#root = pathOf(root).replace(/\/$/, "");
    this.#ast = createAst(ts);
    this.#reader = createFactReader(ts, this.#ast);
  }

  static isSourcePath(fileName: string) {
    return sourcePattern.test(fileName);
  }

  get fileCount() {
    return this.#fileWords.size;
  }

  setFile(givenName: string, text: string) {
    const fileName = pathOf(givenName);
    const words = `\n${[...new Set(text.match(wordPattern))].join("\n")}\n`;
    this.#fileWords.set(fileName, words);
    const isSource = AkanIndex.isSourcePath(fileName);
    if (!isSource && !AkanIndex.#holdsFacts(fileName, words)) {
      this.#facts.delete(fileName);
      return;
    }
    const source =
      this.#parsed.get(fileName)?.text === text ? this.#parse(fileName, text) : this.#parseUncached(fileName, text);
    this.#facts.set(fileName, this.#reader.read(source, this.#ownerOf(fileName)));
    if (isSource) this.#table = null;
  }

  removeFile(givenName: string) {
    const fileName = pathOf(givenName);
    this.#fileWords.delete(fileName);
    this.#parsed.delete(fileName);
    if (this.#facts.delete(fileName) && AkanIndex.isSourcePath(fileName)) this.#table = null;
  }

  definitionAt(givenName: string, text: string, offset: number): AkanTarget[] {
    const fileName = pathOf(givenName);
    const site = this.#useAt(this.#parse(fileName, text), offset);
    return site ? this.#resolve(fileName, site) : [];
  }

  hoverAt(givenName: string, text: string, offset: number): AkanHover | null {
    const fileName = pathOf(givenName);
    const site = this.#useAt(this.#parse(fileName, text), offset);
    if (!site) return null;
    const targets = this.#resolve(fileName, site);
    return targets.length ? { name: site.identifier.text, targets } : null;
  }

  sourceKeysOf(givenName: string): AkanSourceKey[] {
    const keys = new Map<number, AkanSourceKey>();
    for (const entry of this.#nameTable().entriesTargeting(pathOf(givenName))) {
      if (!lensFamilies.has(entry.family) || keys.has(entry.span.start)) continue;
      keys.set(entry.span.start, AkanIndex.#sourceKeyOf(entry));
    }
    return [...keys.values()].sort((a, b) => a.span.start - b.span.start);
  }

  sourceKeyAt(givenName: string, offset: number): AkanSourceKey | null {
    const entries = this.#sourceEntriesAt(pathOf(givenName), offset);
    const entry = entries.find((candidate) => lensFamilies.has(candidate.family)) ?? entries.at(0);
    return entry ? AkanIndex.#sourceKeyOf(entry) : null;
  }

  referencesAt(givenName: string, offset: number, readText: (fileName: string) => string | undefined): AkanSpan[] {
    return this.#usesOf(this.#sourceEntriesAt(pathOf(givenName), offset), readText).map((use) => use.span);
  }

  graph(readText: (fileName: string) => string | undefined, { digests = false } = {}): AkanGraph {
    return new GraphBuilder({
      digests,
      ts: this.#ts,
      facts: [...this.#facts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, facts]) => facts),
      files: [...this.#fileWords].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      readText,
      parse: (fileName, text) => this.#parse(fileName, text),
      resolve: (fileName, identifier) => {
        if (!this.#nameTable().lookup(identifier.text).length) return [];
        const site = this.#siteOf(identifier);
        return site ? this.#resolve(fileName, site) : [];
      },
      relative: (fileName) => this.#relative(fileName),
      ownerOf: (fileName) => this.#ownerOf(fileName),
      reader: this.#reader,
    }).build();
  }

  renameTargetAt(givenName: string, offset: number) {
    const source = this.#sourceEntriesAt(pathOf(givenName), offset).find((entry) => entry.renamed);
    return source ? { family: source.family, sourceKey: source.sourceKey, span: source.span } : null;
  }

  renameAt(
    givenName: string,
    offset: number,
    newKey: string,
    readText: (fileName: string) => string | undefined,
  ): AkanRenameEdit[] | null {
    const sources = this.#sourceEntriesAt(pathOf(givenName), offset).filter((entry) => entry.renamed);
    if (!sources.length || !identifierPattern.test(newKey)) return null;
    return [
      { span: sources[0].span, newText: newKey },
      ...this.#usesOf(sources, readText).map(({ span, entry, shorthand }) => {
        const renamed = entry.renamed?.(newKey) ?? entry.name;
        return { span, newText: shorthand ? `${renamed}: ${entry.name}` : renamed };
      }),
      ...this.#dictionaryKeysOf(sources[0], readText).map(({ span, quote }) => ({
        span,
        newText: `${quote}${newKey}${quote}`,
      })),
    ];
  }

  //? Guards live in `srvkit/`, often made by a factory imported from another lib, so that file names no `Guard`.
  static #holdsFacts(fileName: string, words: string) {
    if (testFilePattern.test(fileName)) return false;
    if (srvkitPattern.test(fileName)) return true;
    const holdsGuards = words.includes("\nGuard\n") && words.includes("\ncanPass\n");
    return (
      holdsGuards ||
      words.includes("\nadapt\n") ||
      words.includes("\ndangerouslyAdapt\n") ||
      words.includes("\napplyAdaptor\n")
    );
  }

  static #sourceKeyOf({ family, sourceKey, label, detail, span }: AkanEntry): AkanSourceKey {
    return { family, sourceKey, label, detail, span };
  }

  #usesOf(sources: AkanEntry[], readText: (fileName: string) => string | undefined) {
    if (!sources.length) return [];
    const ts = this.#ts;
    const isSource = (target: AkanTarget) =>
      sources.some(
        (source) => source.span.fileName === target.span.fileName && source.span.start === target.span.start,
      );
    const refNames = new Set(sources.map((source) => source.refName));
    const byName = new Map(sources.map((source) => [source.name, source]));
    const naming = new RegExp(`\\n(?:${[...byName.keys()].map(escapeRegExp).join("|")})\\n`);
    const gateWordsOf = sources.map((source) => (source.gate ? gateWords[source.gate] : undefined));
    //? `slice` is also Array.prototype.slice, so the receiver is matched in the text before a file is parsed.
    const receiverPatterns = sources.map((source, at) => {
      const gateWord = gateWordsOf[at];
      return gateWord
        ? new RegExp(
            String.raw`(?<![\w$])${gateWord}${receiverGap}[?!]?\.${receiverGap}${escapeRegExp(source.name)}(?![\w$])`,
          )
        : null;
    });
    const named = (words: string, at: number) =>
      words.includes(`\n${sources[at].name}\n`) && (!gateWordsOf[at] || words.includes(`\n${gateWordsOf[at]}\n`));
    const candidates = [...this.#fileWords].filter(
      ([, words]) => naming.test(words) && sources.some((_, at) => named(words, at)),
    );
    const found: { span: AkanSpan; entry: AkanEntry; shorthand: boolean }[] = [];
    for (const [file, words] of candidates.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const text = readText(file);
      if (text === undefined) continue;
      if (!sources.some((_, at) => named(words, at) && (receiverPatterns[at]?.test(text) ?? true))) continue;
      const source = this.#parse(file, text);
      const visit = (node: TS.Node) => {
        const entry = ts.isIdentifier(node) ? byName.get(node.text) : undefined;
        const site = entry && ts.isIdentifier(node) ? this.#siteOf(node) : null;
        const targets = site ? this.#resolve(file, site) : [];
        //? A use that also resolves to another model (`listByName` behind an unhinted receiver) is not counted:
        //? renaming it would edit a module that only shares the key.
        if (entry && site && targets.some(isSource) && targets.every((target) => refNames.has(target.refName))) {
          const parent = site.identifier.parent;
          const shorthand = ts.isBindingElement(parent) && !parent.propertyName;
          found.push({ span: this.#reader.spanOf(source, site.identifier), entry, shorthand });
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return found;
  }

  #dictionaryKeysOf(source: AkanEntry, readText: (fileName: string) => string | undefined) {
    const { dictionary } = source;
    if (!dictionary) return [];
    const ts = this.#ts;
    const keys: { span: AkanSpan; quote: string }[] = [];
    const moduleDir = source.span.fileName.slice(0, source.span.fileName.lastIndexOf("/"));
    for (const [file, words] of this.#fileWords) {
      if (!dictionaryPattern.test(file) || this.#ownerOf(file) !== source.owner) continue;
      const sameModule = file.slice(0, file.lastIndexOf("/")) === moduleDir;
      if (!words.includes(`\n${dictionary.section}\n`)) continue;
      if (!sameModule && !words.includes(`\n${dictionary.className}\n`)) continue;
      const text = readText(file);
      if (text === undefined) continue;
      const parsed = this.#parse(file, text);
      const visit = (node: TS.Node) => {
        const typeArgument = ts.isCallExpression(node) ? node.typeArguments?.[0] : undefined;
        const builder = ts.isCallExpression(node) ? node.arguments.at(-1) : undefined;
        const typed =
          !!typeArgument &&
          ts.isTypeReferenceNode(typeArgument) &&
          ts.isIdentifier(typeArgument.typeName) &&
          typeArgument.typeName.text === dictionary.className;
        //? An untyped `.query((t) => …)` names no class, so only the source key's own module dictionary claims it.
        const untyped = !typeArgument && sameModule;
        const object =
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === dictionary.section &&
          (typed || untyped) &&
          builder
            ? this.#ast.firstObjectReturnedByArrow(builder)
            : null;
        for (const property of object?.properties ?? [])
          if (ts.isPropertyAssignment(property) && this.#ast.nodeName(property.name) === source.sourceKey)
            keys.push({
              span: this.#reader.spanOf(parsed, property.name),
              quote: ts.isStringLiteral(property.name) ? parsed.text.charAt(property.name.getStart(parsed)) : "",
            });
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }
    return keys;
  }

  #sourceEntriesAt(fileName: string, offset: number) {
    return this.#nameTable()
      .entriesTargeting(fileName)
      .filter((entry) => entry.span.start <= offset && offset <= entry.span.end);
  }

  #nameTable() {
    this.#table ??= new NameTable([...this.#facts.values()].filter(({ fileName }) => AkanIndex.isSourcePath(fileName)));
    return this.#table;
  }

  #relative(fileName: string) {
    return fileName.startsWith(`${this.#root}/`) ? fileName.slice(this.#root.length + 1) : fileName;
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
      !parent.dotDotDotToken &&
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
    const className = current.name?.text;
    const heritage = current.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [];
    for (const { expression } of heritage) {
      if (!ts.isCallExpression(expression)) continue;
      const callee = this.#ast.expressionName(expression.expression);
      if (callee === "into" && className?.endsWith("Model"))
        return { model: className.charAt(0).toLowerCase() + className.slice(1, -5), inStore: false };
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
    const holder = chain.at(-1)?.replace(/^#/, "");
    const suffix = holder?.match(/.(Service|Model)$/)?.[1];
    if (holder && suffix) return holder.slice(0, -suffix.length);
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
    //? A query, store-state or socket name carries no model, so a receiver naming another model rules it out.
    const chosen = hinted.length
      ? hinted
      : hint
        ? visible.filter((entry) => !modellessFamilies.has(entry.family))
        : visible;
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
