//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static importLines(appName: string): string[] {
    return StoreBootstrap.#linesOf(`@apps/${appName}`);
  }

  static source(appName: string): string {
    return `${StoreBootstrap.importLines(appName).join("\n")}\n`;
  }

  static ofClientBarrel(specifier: string): string[] | null {
    if (!/^@(?:apps|libs)\/[^/]+\/client$/.test(specifier)) return null;
    return StoreBootstrap.#linesOf(specifier.slice(0, -"/client".length));
  }

  static #linesOf(sysRoot: string): string[] {
    return [`${sysRoot}/lib/useClient`, `${sysRoot}/lib/st`].map((specifier) => `import ${JSON.stringify(specifier)};`);
  }
}
