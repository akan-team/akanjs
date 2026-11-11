import type * as TS from "typescript";
import type { AkanGraphSource } from "./akanGraph";
import { escapeRegExp } from "./escapeRegExp";
import type { GuardCallFact, GuardFact, GuardFactoryFact } from "./guardFacts";
import { type AkanSpan, type Extent, type FileFacts, ownerOf, testFilePattern } from "./moduleFacts";
import type { RouteFactReader } from "./routeFacts";

export type GuardSite = Pick<FileFacts, "fileName" | "owner" | "imports">;

interface GuardPart {
  fileName: string;
  extent: Extent;
}

export interface DeclaredGuard {
  name: string;
  owner: string | null;
  span: AkanSpan;
  scope: string | null;
  doc: string | null;
  parts: GuardPart[];
  file: string | null;
  label?: string;
}

interface DeclaredFactory {
  fact: GuardFactoryFact;
  owner: string | null;
  site: GuardSite;
  made: DeclaredGuard[];
  isReal: boolean;
  scope: string | null;
  layers: number;
  targets: { target: DeclaredFactory; layers: number }[];
}

interface MapEntry {
  name: string;
  site: GuardSite;
}

type GuardLookup = { guard: DeclaredGuard } | { name: string; from: string | undefined } | { external: true };

interface Reexport {
  name: string;
  from: string | null;
}

interface StarExports {
  owners: string[];
  packages: string[];
  paths: string[];
  isOpaque: boolean;
}

interface ModuleExports {
  named: (Reexport & { fileName: string }) | null;
  stars: string[];
}

interface Declaration {
  source: TS.SourceFile;
  statement: TS.Statement;
  declared: TS.Node;
  extent: Extent;
  name: string;
}

export const frameworkOwner = "akanjs";
export const frameworkPattern = /^akanjs(?:\/|$)/;
const aliasPattern = /^@(apps|libs)\/([^/]+)/;
const maxMapDepth = 4;
//? ES2022 lets an import name be any string (`import { "is(admin" as IsAdmin }`), which no declaration can carry.
const identifierPattern = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u;
const starExportPattern = /export\s*\*\s*from\s*["']([^"']+)["']/g;

const exportingPatternOf = (name: string) =>
  new RegExp(`export\\s*\\{(?:[^}]*?[\\s,])?${escapeRegExp(name)}(?![\\w$])`);

const declaringPatternOf = (name: string, isAnyBinding: boolean) => {
  const escaped = escapeRegExp(name);
  const braced = "\\{(?:[^}]*?[\\s,])?";
  const leads = [
    "function\\s*\\*?\\s*",
    "(?:const|let|var)\\s+",
    `export\\s*${braced}`,
    ...(isAnyBinding ? ["class\\s+", `(?:const|let|var)\\s*${braced}`] : []),
  ];
  return new RegExp(`(?:${leads.join("|")})${escaped}(?![\\w$])|,\\s*${escaped}\\s*(?::[^=;,]+)?=(?![=>])`);
};

export class GuardResolver {
  readonly #source: AkanGraphSource;
  readonly #routes: RouteFactReader;
  readonly #guards = new Map<string, DeclaredGuard[]>();
  readonly #madeInPlace = new Map<string, DeclaredGuard>();
  readonly #mapEntries = new Map<string, MapEntry[]>();
  readonly #reexports = new Map<string, { local: string; site: GuardSite } | null>();
  readonly #declarations = new Map<string, Declaration | null>();
  readonly #starExports = new Map<string, StarExports>();
  readonly #moduleExports = new Map<string, ModuleExports>();
  #ownerFiles: Map<string, [fileName: string, words: string][]> | null = null;
  #modules: Map<string, string[]> | null = null;

  constructor(source: AkanGraphSource, routes: RouteFactReader) {
    this.#source = source;
    this.#routes = routes;
  }

  find(local: string, site: GuardSite) {
    return this.#findGuard(local, site, 0);
  }

  madeInPlace(fileName: string, name: string) {
    return this.#madeInPlace.get(`${fileName}\n${name}`);
  }

  declare(facts: FileFacts[]): DeclaredGuard[] {
    const factories = new Map<string, DeclaredFactory[]>();
    const declaredFactories: DeclaredFactory[] = [];
    for (const file of facts)
      for (const fact of file.guardFactories) {
        const factory = {
          fact,
          owner: file.owner,
          site: file,
          made: [],
          isReal: fact.direct,
          scope: fact.scope,
          layers: fact.layers,
          targets: [],
        };
        factories.set(fact.name, [...(factories.get(fact.name) ?? []), factory]);
        declaredFactories.push(factory);
      }
    for (const factory of declaredFactories)
      factory.targets = factory.fact.via.flatMap(({ callee, layers }) => {
        const target = this.#factoryAt(factories, callee, factory.site);
        return target ? [{ target, layers }] : [];
      });
    //? A wrapper returns its target's guard after its own layers and whatever the target's call leaves uncalled.
    for (let isGrowing = true; isGrowing; ) {
      isGrowing = false;
      for (const factory of declaredFactories) {
        const via = factory.targets.find(({ target, layers }) => target.isReal && target.layers >= layers);
        if (factory.isReal || !via) continue;
        factory.isReal = true;
        factory.layers = factory.fact.layers + via.target.layers - via.layers;
        factory.scope ??= via.target.scope;
        isGrowing = true;
      }
    }
    const partsOf = (factory: DeclaredFactory, seen = new Set<DeclaredFactory>()): GuardPart[] => {
      if (seen.has(factory)) return [];
      seen.add(factory);
      return [
        { fileName: factory.site.fileName, extent: factory.fact.extent },
        ...factory.targets.filter(({ target }) => target.isReal).flatMap(({ target }) => partsOf(target, seen)),
      ];
    };
    const declare = (file: FileFacts, made: GuardFact | GuardCallFact, scope: string | null, parts: GuardPart[]) => {
      const { name, span, extent, doc } = made;
      const label = file.guardLabels[name];
      const own = { fileName: file.fileName, extent };
      const guard = { name, owner: file.owner, span, scope, doc, parts: [own, ...parts], file: null, label };
      if (name.includes("@")) this.#madeInPlace.set(`${file.fileName}\n${name}`, guard);
      else this.#guards.set(name, [...(this.#guards.get(name) ?? []), guard]);
      return guard;
    };
    const extending: [FileFacts, GuardCallFact][] = [];
    for (const file of facts) {
      for (const made of file.guards) {
        const factory = made.factory
          ? factories.get(made.factory)?.find((other) => other.site.fileName === file.fileName)
          : undefined;
        if (!made.factory) declare(file, made, made.scope, []);
        else if (factory?.isReal && factory.layers === made.layers)
          factory.made.push(declare(file, made, factory.scope, partsOf(factory)));
      }
      for (const made of file.guardCalls) {
        if (made.kind === "extends") {
          extending.push([file, made]);
          continue;
        }
        const factory = this.#factoryAt(factories, made.callee, file);
        if (factory?.isReal && factory.layers === made.layers)
          factory.made.push(declare(file, made, factory.scope, partsOf(factory)));
      }
    }
    for (let isGrowing = true; isGrowing; ) {
      isGrowing = false;
      for (const [idx, entry] of extending.entries()) {
        const [file, made] = entry;
        const found = this.#findGuard(made.callee, file, 0, true);
        if (!("guard" in found)) continue;
        declare(file, made, made.scope ?? found.guard.scope, found.guard.parts);
        extending.splice(idx, 1);
        isGrowing = true;
        break;
      }
    }
    for (const { fact, made, isReal } of declaredFactories)
      if (isReal && made.every((guard) => !guard.doc)) for (const guard of made) guard.doc = fact.doc;
    for (const list of this.#guards.values())
      for (const guard of list)
        if (list.some((other) => other !== guard && other.owner === guard.owner))
          guard.file = this.inOwner(guard.span.fileName, guard.owner);
    for (const guard of this.#madeInPlace.values()) guard.file = this.inOwner(guard.span.fileName, guard.owner);
    return [...[...this.#guards.values()].flat(), ...this.#madeInPlace.values()];
  }

  #factoryAt(
    factories: Map<string, DeclaredFactory[]>,
    callee: string,
    site: GuardSite,
    depth = 0,
  ): DeclaredFactory | undefined {
    const [head = callee, member] = callee.split(".");
    const imported = site.imports.find((item) => item.name === head);
    if (!imported)
      return member ? undefined : factories.get(callee)?.find((other) => other.site.fileName === site.fileName);
    if (member && imported.imported !== "*") return undefined;
    const from = this.ownerOfSpecifier(site.fileName, imported.from);
    if (from === undefined || from === frameworkOwner) return undefined;
    const name = member ?? (imported.imported === "default" || imported.imported === "*" ? head : imported.imported);
    const candidates = factories.get(name) ?? [];
    const near = this.pathOfSpecifier(site.fileName, imported.from);
    const own = this.#nearest(
      candidates.filter((other) => other.owner === from),
      ({ site }) => site.fileName,
      near,
    );
    if (own) return own;
    const reexport = from && depth < maxMapDepth ? this.#reexportOf(from, name, near) : null;
    if (reexport) return this.#factoryAt(factories, reexport.local, reexport.site, depth + 1);
    return from && near ? this.#throughStar(candidates, from, name, near) : undefined;
  }

  #findGuard(local: string, site: GuardSite, depth: number, isBase = false): GuardLookup {
    const segments = local.split(".");
    const head = segments[0] ?? local;
    const imported = site.imports.find((item) => item.name === head);
    const from = imported ? this.ownerOfSpecifier(site.fileName, imported.from) : undefined;
    if (imported && from === undefined) return { external: true };
    const near = imported
      ? this.pathOfSpecifier(site.fileName, imported.from)
      : this.#source.relative(site.fileName).replace(/\.tsx?$/, "");
    const named = imported && imported.imported !== "default" && imported.imported !== "*" ? imported.imported : null;
    const path = imported?.imported === "*" ? segments.slice(1) : [named ?? head, ...segments.slice(1)];
    const holder = imported ? (from ?? null) : site.owner;
    const [objectName, member] = path;
    if (path.length === 2 && objectName && member && holder !== frameworkOwner && depth < maxMapDepth) {
      const made = this.#nearest(
        (this.#guards.get(`${objectName}.${member}`) ?? []).filter((guard) => guard.owner === holder),
        ({ span }) => span.fileName,
        near,
      );
      if (made) return { guard: made };
      for (const entry of this.#mapEntriesOf(objectName, member, imported ? null : site.fileName, holder)) {
        const found = this.#findGuard(entry.name, entry.site, depth + 1, isBase);
        if ("guard" in found) return found;
      }
    }
    const name = path[path.length - 1] ?? head;
    if (from === frameworkOwner) return { name, from };
    const declared = this.#guards.get(name) ?? [];
    const own = this.#nearest(
      declared.filter((other) => other.owner === (imported ? from : site.owner)),
      ({ span }) => span.fileName,
      near,
    );
    if (own) return { guard: own };
    if (!imported) {
      const visible = isBase ? undefined : declared.find((other) => this.visible(other.owner, site.owner));
      return visible ? { guard: visible } : { name, from };
    }
    const reexport = from && depth < maxMapDepth ? this.#reexportOf(from, name, near) : null;
    if (reexport) return this.#findGuard(reexport.local, reexport.site, depth + 1, isBase);
    const reached = from && near ? this.#throughStar(declared, from, name, near) : undefined;
    return reached ? { guard: reached } : { name, from };
  }

  #reexportOf(owner: string, name: string, near: string | null) {
    const key = `${owner}\n${name}\n${near ?? ""}`;
    const cached = this.#reexports.get(key);
    if (cached !== undefined) return cached;
    let found: { local: string; site: GuardSite } | null = null;
    const exporting = exportingPatternOf(name);
    for (const fileName of this.#filesOf(owner, name, near)) {
      const text = this.#source.readText(fileName);
      if (text === undefined || !exporting.test(text)) continue;
      const reexport = this.#reexportIn(this.#source.parse(fileName, text), name);
      if (!reexport) continue;
      const site = { fileName, owner, imports: [] };
      found = reexport.from
        ? {
            local: reexport.name,
            site: { ...site, imports: [{ ...reexport, imported: reexport.name, from: reexport.from }] },
          }
        : { local: reexport.name, site };
      break;
    }
    this.#reexports.set(key, found);
    return found;
  }

  #reexportIn(source: TS.SourceFile, name: string): Reexport | null {
    const { ts, reader } = this.#source;
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
      const { exportClause, moduleSpecifier } = statement;
      if (!exportClause || !ts.isNamedExports(exportClause)) continue;
      const element = exportClause.elements.find((item) => !item.isTypeOnly && item.name.text === name);
      if (!element) continue;
      const original = (element.propertyName ?? element.name).text;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) return { name: original, from: moduleSpecifier.text };
      const imported = reader.importsIn(source).find((item) => item.name === original);
      if (!imported) return { name: original, from: null };
      return imported.imported === "default" || imported.imported === "*"
        ? null
        : { name: imported.imported, from: imported.from };
    }
    return null;
  }

  //? The import path is searched first, so `isAdmin` from `@libs/shared/webkit` is not another folder's `isAdmin`.
  #filesOf(owner: string, name: string, near: string | null) {
    const isNear = (fileName: string) => {
      const relative = this.#source.relative(fileName);
      return !!near && (relative.startsWith(`${near}/`) || relative.replace(/\.tsx?$/, "") === near);
    };
    if (!identifierPattern.test(name)) return [];
    const candidates = this.#filesIn(owner)
      .filter(([, words]) => words.includes(`\n${name}\n`))
      .map(([fileName]) => fileName);
    return [...candidates.filter(isNear), ...candidates.filter((other) => !isNear(other))];
  }

  #mapEntriesOf(objectName: string, member: string, fileName: string | null, owner: string | null) {
    const key = `${objectName}\n${member}\n${fileName ?? ""}\n${owner ?? ""}`;
    const cached = this.#mapEntries.get(key);
    if (cached) return cached;
    const { ts, reader } = this.#source;
    const entries: MapEntry[] = [];
    const fileNames = [
      ...(fileName ? [fileName] : []),
      ...(owner === null ? [] : this.#filesIn(owner))
        .filter(
          ([other, words]) =>
            other !== fileName && words.includes(`\n${objectName}\n`) && words.includes(`\n${member}\n`),
        )
        .map(([other]) => other),
    ];
    for (const holder of fileNames) {
      const text = this.#source.readText(holder);
      if (text === undefined) continue;
      const source = this.#source.parse(holder, text);
      const site = { fileName: holder, owner: this.#source.ownerOf(holder), imports: reader.importsIn(source) };
      for (const statement of source.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const map = statement.declarationList.declarations.find(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === objectName,
        )?.initializer;
        const object = map && reader.unwrap(map);
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        for (const property of object.properties) {
          if (ts.isShorthandPropertyAssignment(property) && property.name.text === member)
            entries.push({ name: member, site });
          if (
            !ts.isPropertyAssignment(property) ||
            !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
            property.name.text !== member
          )
            continue;
          const value = reader.unwrap(property.initializer);
          if (ts.isIdentifier(value)) entries.push({ name: value.text, site });
          else if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression))
            entries.push({ name: `${value.expression.text}.${value.name.text}`, site });
        }
      }
    }
    this.#mapEntries.set(key, entries);
    return entries;
  }

  //? Every page names `usePage`, which the generated client hands out undeclared, so a text prefilter skips the parse.
  declarationOf(owner: string, name: string, near: string | null, depth = 0): Declaration | null {
    const key = `${owner}\n${name}\n${near ?? ""}`;
    const cached = this.#declarations.get(key);
    if (cached !== undefined) return cached;
    this.#declarations.set(key, null);
    const declaring = declaringPatternOf(name, false);
    let found: Declaration | null = null;
    for (const fileName of this.#filesOf(owner, name, near)) {
      const text = this.#source.readText(fileName);
      if (text === undefined || !declaring.test(text)) continue;
      const source = this.#source.parse(fileName, text);
      const declared = this.#routes.declarationIn(source, name);
      if (declared) {
        found = { source, ...declared, name };
        break;
      }
      const reexport = this.#reexportIn(source, name);
      if (!reexport) continue;
      if (!reexport.from) {
        const local = this.#routes.declarationIn(source, reexport.name);
        found = local ? { source, ...local, name: reexport.name } : null;
        break;
      }
      const next = this.ownerOfSpecifier(fileName, reexport.from);
      if (next && next !== frameworkOwner && depth < maxMapDepth)
        found = this.declarationOf(next, reexport.name, this.pathOfSpecifier(fileName, reexport.from), depth + 1);
      break;
    }
    this.#declarations.set(key, found);
    return found;
  }

  //? `export *` is the one re-export not followed by name, and one from a package may bring the name itself.
  #throughStar<Declared extends { owner: string | null }>(
    declared: Declared[],
    owner: string,
    name: string,
    near: string,
  ) {
    if (!declared.length) return undefined;
    const { owners, isOpaque } = this.starExportsOf(owner, near);
    const reached = declared.filter((other) => other.owner !== null && owners.includes(other.owner));
    return reached.length === 1 && !isOpaque && !this.declares(owner, name) ? reached[0] : undefined;
  }

  starExportsOf(owner: string, near: string) {
    const key = `${owner}\n${near}`;
    const cached = this.#starExports.get(key);
    if (cached) return cached;
    const found: StarExports = { owners: [], packages: [], paths: [near], isOpaque: false };
    this.#starExports.set(key, found);
    for (let idx = 0; idx < found.paths.length; idx++)
      for (const fileName of this.#modulesAt(found.paths[idx] ?? ""))
        for (const [, specifier = ""] of this.#source.readText(fileName)?.matchAll(starExportPattern) ?? []) {
          const target = this.ownerOfSpecifier(fileName, specifier);
          const path = this.pathOfSpecifier(fileName, specifier);
          if (path === null && !found.packages.includes(specifier)) found.packages.push(specifier);
          if (target === undefined || target === frameworkOwner || path === null) found.isOpaque = true;
          else if (!found.paths.includes(path)) found.paths.push(path);
          if (target && target !== frameworkOwner && target !== owner && !found.owners.includes(target))
            found.owners.push(target);
        }
    return found;
  }

  exportsAt(path: string, name: string) {
    const key = `${path}\n${name}`;
    const cached = this.#moduleExports.get(key);
    if (cached) return cached;
    const found: ModuleExports = { named: null, stars: [] };
    const exporting = exportingPatternOf(name);
    for (const fileName of this.#modulesAt(path)) {
      const text = this.#source.readText(fileName);
      if (text === undefined) continue;
      const named =
        identifierPattern.test(name) && exporting.test(text)
          ? this.#reexportIn(this.#source.parse(fileName, text), name)
          : null;
      if (named) {
        found.named = { ...named, fileName };
        found.stars = [];
        break;
      }
      for (const [, specifier = ""] of text.matchAll(starExportPattern)) {
        const target = this.pathOfSpecifier(fileName, specifier);
        if (target !== null && !found.stars.includes(target)) found.stars.push(target);
      }
    }
    this.#moduleExports.set(key, found);
    return found;
  }

  #modulesAt(path: string) {
    if (!this.#modules) {
      this.#modules = new Map();
      for (const [fileName] of this.#source.files) {
        const module = this.#source.relative(fileName).replace(/\.tsx?$/, "");
        for (const key of module.endsWith("/index") ? [module, module.slice(0, -6)] : [module])
          this.#modules.set(key, [...(this.#modules.get(key) ?? []), fileName]);
      }
    }
    return this.#modules.get(path) ?? [];
  }

  hasModule(path: string) {
    return this.#modulesAt(path).length > 0;
  }

  //? A folder's index is generated and gitignored, so a graph read from git has only the folder's files to go on.
  packagesUnder(owner: string, folder: string) {
    const packages = new Set<string>();
    for (const [fileName, words] of this.#filesIn(owner)) {
      if (!this.#source.relative(fileName).startsWith(`${folder}/`) || !words.includes("\nexport\n")) continue;
      for (const [, specifier = ""] of this.#source.readText(fileName)?.matchAll(starExportPattern) ?? [])
        if (this.pathOfSpecifier(fileName, specifier) === null) packages.add(specifier);
    }
    return [...packages];
  }

  modulesUnder(owner: string, folder: string, name: string) {
    return this.#filesOf(owner, name, folder)
      .map((fileName) => this.#source.relative(fileName))
      .filter((module) => module.startsWith(`${folder}/`))
      .map((module) => module.replace(/\.tsx?$/, ""));
  }

  declares(owner: string, name: string) {
    const declaring = declaringPatternOf(name, true);
    return this.#filesOf(owner, name, null).some((fileName) => declaring.test(this.#source.readText(fileName) ?? ""));
  }

  declaresAt(path: string, name: string) {
    const declaring = declaringPatternOf(name, true);
    return this.#modulesAt(path).some((fileName) => declaring.test(this.#source.readText(fileName) ?? ""));
  }

  #filesIn(owner: string) {
    if (!this.#ownerFiles) {
      this.#ownerFiles = new Map();
      for (const entry of this.#source.files) {
        const fileOwner = testFilePattern.test(entry[0]) ? null : this.#source.ownerOf(entry[0]);
        const files = fileOwner === null ? null : this.#ownerFiles.get(fileOwner);
        if (files) files.push(entry);
        else if (fileOwner !== null) this.#ownerFiles.set(fileOwner, [entry]);
      }
    }
    return this.#ownerFiles.get(owner) ?? [];
  }

  #nearest<Item>(items: Item[], fileOf: (item: Item) => string, near: string | null) {
    const isNear = (fileName: string) => {
      const relative = this.#source.relative(fileName);
      return !!near && (relative.startsWith(`${near}/`) || relative.replace(/\.tsx?$/, "") === near);
    };
    return items.find((item) => isNear(fileOf(item))) ?? items[0];
  }

  inOwner(fileName: string, owner: string | null) {
    const relative = this.#source.relative(fileName);
    return owner && relative.startsWith(`${owner}/`) ? relative.slice(owner.length + 1) : relative;
  }

  ownerOfSpecifier(fileName: string, specifier: string) {
    if (frameworkPattern.test(specifier)) return frameworkOwner;
    const path = this.pathOfSpecifier(fileName, specifier);
    return path === null ? undefined : (ownerOf(path) ?? undefined);
  }

  pathOfSpecifier(fileName: string, specifier: string) {
    const alias = specifier.match(aliasPattern);
    if (alias) return `${alias[1]}/${alias[2]}${specifier.slice(alias[0].length)}`;
    if (!specifier.startsWith(".")) return null;
    const segments = this.#source.relative(fileName).split("/").slice(0, -1);
    for (const segment of specifier.split("/"))
      if (segment === "..") segments.pop();
      else if (segment !== ".") segments.push(segment);
    return segments.join("/");
  }

  visible(target: string | null, from: string | null) {
    return !from || !target || target === from || target.startsWith("libs/");
  }
}
