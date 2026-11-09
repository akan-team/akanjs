import type { BarrelExportMap } from "../transforms/barrelAnalyzer";

//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static importLines(appName: string): string[] {
    return StoreBootstrap.#lines([`@apps/${appName}/lib/useClient`, `@apps/${appName}/lib/st`]);
  }

  static source(appName: string): string {
    return `${StoreBootstrap.importLines(appName).join("\n")}\n`;
  }

  static ofClientBarrel(specifier: string, exports: BarrelExportMap): string[] | null {
    if (!/^@(?:apps|libs)\/[^/]+\/client$/.test(specifier)) return null;
    const runtime = exports.get("usePage");
    const store = exports.get("st");
    if (!runtime || runtime.namespace || !store || store.namespace) return StoreBootstrap.#lines([specifier]);
    return StoreBootstrap.#lines([...new Set([runtime.subpath, store.subpath])]);
  }

  static #lines(specifiers: string[]): string[] {
    return specifiers.map((specifier) => `import ${JSON.stringify(specifier)};`);
  }
}
