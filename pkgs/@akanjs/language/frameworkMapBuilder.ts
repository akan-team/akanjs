import type { AkanGraphLocation, FrameworkClass, FrameworkFacet, FrameworkImport, FrameworkMap } from "akanjs/common";
import type * as TS from "typescript";
import type { Ts } from "./ast";
import { FrameworkChannelReader, type FrameworkChannelSpec } from "./frameworkChannelReader";

export interface FrameworkSourcePackage {
  name: string;
  root: string;
  split: boolean;
}

export interface FrameworkMapSource {
  ts: Ts;
  packages: FrameworkSourcePackage[];
  files: [file: string, text: string][];
  channels: FrameworkChannelSpec[];
}

interface ImportSite {
  facet: string;
  kind: "value" | "type" | "dynamic";
  at: AkanGraphLocation;
}

const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class FrameworkMapBuilder {
  readonly #source: FrameworkMapSource;
  readonly #fileSet: Set<string>;

  constructor(source: FrameworkMapSource) {
    this.#source = source;
    this.#fileSet = new Set(source.files.map(([file]) => file));
  }

  static isSourcePath(file: string) {
    return /\.tsx?$/.test(file) && !/\.d\.ts$|\.(?:test|spec)\.tsx?$|fixture/i.test(file);
  }

  build(): FrameworkMap {
    const { ts, packages, files, channels } = this.#source;
    const sources = new Map<string, TS.SourceFile>();
    for (const [file, text] of [...files].sort(([a], [b]) => byText(a, b)))
      sources.set(
        file,
        ts.createSourceFile(
          file,
          text,
          ts.ScriptTarget.Latest,
          true,
          file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      );
    const facets = new Map<string, FrameworkFacet>();
    const imports = new Map<string, FrameworkImport>();
    for (const [file, source] of sources) {
      const facet = this.#facetOf(file);
      if (!facet) continue;
      const pkg = this.#packageOf(file);
      const current = facets.get(facet) ?? {
        id: facet,
        name: pkg?.split ? facet.slice(pkg.name.length + 1) : facet,
        packageName: pkg?.name ?? facet,
        layer: 0,
        files: 0,
        classes: [],
      };
      current.files += 1;
      current.classes.push(...this.#classesOf(source));
      facets.set(facet, current);
      for (const site of this.#importsOf(file, source)) {
        if (site.facet === facet) continue;
        const key = `${facet}\n${site.facet}`;
        const entry = imports.get(key) ?? { from: facet, to: site.facet, value: 0, type: 0, dynamic: 0, at: site.at };
        if (entry.value === 0 && site.kind === "value" && imports.has(key)) entry.at = site.at;
        entry[site.kind] += 1;
        imports.set(key, entry);
      }
    }
    const { layerOf, cycles } = FrameworkMapBuilder.#layersOf([...imports.values()]);
    for (const facet of facets.values()) {
      facet.classes.sort((a, b) => b.members - a.members || byText(a.name, b.name));
      facet.layer = layerOf(facet.id);
    }
    const reader = new FrameworkChannelReader(ts, channels, sources);
    return {
      version: 1,
      packages: packages.map(({ name, root }) => ({ name, root })),
      facets: [...facets.values()].sort((a, b) => byText(a.id, b.id)),
      imports: [...imports.values()].sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to)),
      channels: reader.channels(),
      missing: reader.missing,
      cycles,
    };
  }

  static #layersOf(imports: FrameworkImport[]) {
    const deps = new Map<string, string[]>();
    for (const { from, to, value, dynamic } of imports)
      if (value + dynamic > 0) deps.set(from, [...(deps.get(from) ?? []), to]);
    const components = FrameworkMapBuilder.#stronglyConnected(deps);
    const componentOf = new Map(components.flatMap((component) => component.map((id) => [id, component] as const)));
    const layers = new Map<string[], number>();
    const layerOf = (id: string): number => {
      const component = componentOf.get(id);
      if (!component) return 0;
      const known = layers.get(component);
      if (known !== undefined) return known;
      const below = component.flatMap((member) => (deps.get(member) ?? []).filter((to) => !component.includes(to)));
      const layer = Math.max(-1, ...below.map(layerOf)) + 1;
      layers.set(component, layer);
      return layer;
    };
    const cycles = components
      .filter((component) => component.length > 1)
      .map((component) => [...component].sort(byText))
      .sort((a, b) => byText(a[0], b[0]));
    return { layerOf, cycles };
  }

  static #stronglyConnected(deps: Map<string, string[]>) {
    const ids = [...new Set([...deps.keys(), ...[...deps.values()].flat()])].sort(byText);
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const components: string[][] = [];
    const visit = (id: string) => {
      index.set(id, index.size);
      low.set(id, index.get(id) ?? 0);
      stack.push(id);
      onStack.add(id);
      for (const to of deps.get(id) ?? []) {
        if (!index.has(to)) {
          visit(to);
          low.set(id, Math.min(low.get(id) ?? 0, low.get(to) ?? 0));
        } else if (onStack.has(to)) low.set(id, Math.min(low.get(id) ?? 0, index.get(to) ?? 0));
      }
      if (low.get(id) !== index.get(id)) return;
      const component: string[] = [];
      for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
        onStack.delete(member);
        component.push(member);
        if (member === id) break;
      }
      components.push(component);
    };
    for (const id of ids) if (!index.has(id)) visit(id);
    return components;
  }

  #packageOf(file: string) {
    return this.#source.packages
      .filter(({ root }) => file.startsWith(`${root}/`))
      .sort((a, b) => b.root.length - a.root.length)[0];
  }

  #facetOf(file: string) {
    const pkg = this.#packageOf(file);
    if (!pkg) return null;
    if (!pkg.split) return pkg.name;
    const rest = file.slice(pkg.root.length + 1);
    const slash = rest.indexOf("/");
    return slash < 0 ? null : `${pkg.name}/${rest.slice(0, slash)}`;
  }

  #location(source: TS.SourceFile, node: TS.Node): AkanGraphLocation {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file: source.fileName, line: line + 1, column: character + 1 };
  }

  #classesOf(source: TS.SourceFile): FrameworkClass[] {
    const { ts } = this.#source;
    return source.statements.flatMap((statement) =>
      ts.isClassDeclaration(statement) && statement.name
        ? [{ name: statement.name.text, members: statement.members.length, at: this.#location(source, statement.name) }]
        : [],
    );
  }

  #importsOf(file: string, source: TS.SourceFile): ImportSite[] {
    const { ts } = this.#source;
    const sites: ImportSite[] = [];
    const push = (specifier: string, kind: ImportSite["kind"], node: TS.Node) => {
      const target = this.#resolve(file, specifier);
      const facet = target ? this.#facetOf(target) : null;
      if (facet) sites.push({ facet, kind, at: this.#location(source, node) });
    };
    const visit = (node: TS.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const isTypeOnly =
          !!clause?.isTypeOnly ||
          (!!clause &&
            !clause.name &&
            !!named &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((element) => element.isTypeOnly));
        push(node.moduleSpecifier.text, isTypeOnly ? "type" : "value", node);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.exportClause;
        const isTypeOnly =
          node.isTypeOnly ||
          (!!clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((element) => element.isTypeOnly));
        push(node.moduleSpecifier.text, isTypeOnly ? "type" : "value", node);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        push(node.arguments[0].text, "dynamic", node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sites;
  }

  #resolve(file: string, specifier: string) {
    const pkg = specifier.startsWith(".")
      ? null
      : this.#source.packages
          .filter(({ name }) => specifier === name || specifier.startsWith(`${name}/`))
          .sort((a, b) => b.name.length - a.name.length)[0];
    if (!specifier.startsWith(".") && !pkg) return null;
    const base = pkg
      ? `${pkg.root}${specifier.slice(pkg.name.length)}`
      : FrameworkMapBuilder.#normalize(`${file.slice(0, file.lastIndexOf("/"))}/${specifier}`);
    return (
      extensions.map((extension) => `${base}${extension}`).find((candidate) => this.#fileSet.has(candidate)) ?? null
    );
  }

  static #normalize(path: string) {
    const parts: string[] = [];
    for (const part of path.split("/"))
      if (part === "..") parts.pop();
      else if (part !== "." && part !== "") parts.push(part);
    return parts.join("/");
  }
}
