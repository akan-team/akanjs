//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static importLines(appName: string): string[] {
    return [`@apps/${appName}/lib/useClient`, `@apps/${appName}/lib/st`].map(
      (specifier) => `import ${JSON.stringify(specifier)};`,
    );
  }

  static source(appName: string): string {
    return `${StoreBootstrap.importLines(appName).join("\n")}\n`;
  }
}
