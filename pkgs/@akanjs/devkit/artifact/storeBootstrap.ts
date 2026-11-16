import type { BarrelExportMap } from "../transforms/barrelAnalyzer";

const PAGE_ONLY_NAMES = new Set(["usePage", "msg", "Err"]);

//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static importLines(appName: string): string[] {
    return StoreBootstrap.#lines([`@apps/${appName}/lib/useClient`, `@apps/${appName}/lib/st`]);
  }

  static source(appName: string): string {
    return `${StoreBootstrap.importLines(appName).join("\n")}\n`;
  }

  static ofClientBarrel(specifier: string, exports: BarrelExportMap, names: string[] = []): string[] | null {
    if (!/^@(?:apps|libs)\/[^/]+\/client$/.test(specifier)) return null;
    const page = exports.get("usePage");
    const descriptors = exports.get("fetch") ?? page;
    const store = exports.get("st");
    //? A barrel with only one of the two is not the generated shape, so what else it runs on import is unknown.
    if (!page || page.namespace || !descriptors || descriptors.namespace || !store || store.namespace)
      return [specifier];
    const pageOnly = names.length > 0 && names.every((name) => PAGE_ONLY_NAMES.has(name));
    if (pageOnly && page.subpath !== descriptors.subpath) return [page.subpath];
    return [...new Set([descriptors.subpath, store.subpath])];
  }

  static #lines(specifiers: string[]): string[] {
    return specifiers.map((specifier) => `import ${JSON.stringify(specifier)};`);
  }
}
