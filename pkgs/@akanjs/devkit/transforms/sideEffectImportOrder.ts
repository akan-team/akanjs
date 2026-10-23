import { existsSync } from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";

//* Without splitting, Bun (1.4.4 included) wraps a module that only an `import()` reaches, and the wrapper runs its ESM
//* imports before its CommonJS ones whatever their order: `@lexical/code-prism` imports `prismjs`, then language files
//* that read the `Prism` global it sets, so a single-file bundle threw. A vendor module's bare import that may run late
//* is pointed at a shim importing the same specifier instead: an ESM import, so it keeps its place.
export class SideEffectImportOrder {
  static readonly #prefix = "akan-side-effect:";
  static readonly #vendorModule = /[\\/]node_modules[\\/].+\.m?js$/;
  static readonly #shim = /\.akan-side-effect$/;

  static plugin(): BunPlugin {
    return {
      name: "akan-side-effect-order",
      setup(build) {
        const specifiers = new Map<string, string>();
        //? Listed after the `__dirname` plugin: Bun runs one onLoad per module, so a module that one rewrites stays as is.
        build.onLoad({ filter: SideEffectImportOrder.#vendorModule }, async ({ path: modulePath }) => {
          const source = await Bun.file(modulePath).text();
          const rewritten = await SideEffectImportOrder.rewrite(source, modulePath);
          return rewritten === source ? undefined : { contents: rewritten, loader: "js" };
        });
        //? The prefix alone: an onResolve that matches an import loses its package's `sideEffects`, even unanswered.
        build.onResolve({ filter: /^akan-side-effect:/ }, ({ path: prefixed, importer }) => {
          const specifier = prefixed.slice(SideEffectImportOrder.#prefix.length);
          //? Beside its importer, so the bundler resolves the shim's import as it would have the importer's.
          const shimPath = `${importer}.${Bun.hash(specifier).toString(36)}.akan-side-effect`;
          specifiers.set(shimPath, specifier);
          return { path: shimPath };
        });
        build.onLoad({ filter: SideEffectImportOrder.#shim }, ({ path: shimPath }) => ({
          contents: `import ${JSON.stringify(specifiers.get(shimPath))};\n`,
          loader: "js",
        }));
      },
    };
  }

  static async rewrite(source: string, filePath: string): Promise<string> {
    if (!/\bimport\s*["']/.test(source)) return source;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const literals = sourceFile.statements.flatMap((statement) =>
      ts.isImportDeclaration(statement) &&
      !statement.importClause &&
      !statement.attributes &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier]
        : [],
    );
    const late = await Promise.all(literals.map((literal) => SideEffectImportOrder.#runsLate(literal.text, filePath)));
    return literals
      .filter((_, idx) => late[idx])
      .reverse()
      .reduce(
        (rewritten, literal) =>
          `${rewritten.slice(0, literal.getStart(sourceFile))}${JSON.stringify(`${SideEffectImportOrder.#prefix}${literal.text}`)}${rewritten.slice(literal.end)}`,
        source,
      );
  }

  //? Judged off the specifier, never resolved: a `Bun.resolveSync` primes the bundler's resolution, browser field lost.
  static async #runsLate(specifier: string, importer: string) {
    const from = path.dirname(importer);
    const target = specifier.startsWith(".") ? path.resolve(from, specifier) : null;
    //? An ESM import already keeps its place among the others.
    if (target && (await SideEffectImportOrder.#isEsModule(target))) return false;
    const sideEffects = await SideEffectImportOrder.#sideEffectsOf(
      target ? path.dirname(target) : SideEffectImportOrder.#packageDirOf(specifier, from),
    );
    //? The bundler drops a bare import of a module its package declares pure, which a shim would keep.
    return sideEffects === undefined || sideEffects === true;
  }

  static async #isEsModule(filePath: string) {
    const file = Bun.file(filePath);
    if (!/\.m?js$/.test(filePath) || !(await file.exists())) return false;
    const sourceFile = ts.createSourceFile(
      filePath,
      await file.text(),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.JS,
    );
    return ts.isExternalModule(sourceFile);
  }

  static #packageDirOf(specifier: string, from: string) {
    const name = specifier
      .split("/")
      .slice(0, specifier.startsWith("@") ? 2 : 1)
      .join("/");
    for (let dir = from; ; dir = path.dirname(dir)) {
      const packageDir = path.join(dir, "node_modules", name);
      if (existsSync(packageDir)) return packageDir;
      if (path.dirname(dir) === dir) return from;
    }
  }

  static async #sideEffectsOf(fromDir: string): Promise<unknown> {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const manifest = Bun.file(path.join(dir, "package.json"));
      if (await manifest.exists()) return ((await manifest.json()) as { sideEffects?: unknown }).sideEffects;
      if (path.dirname(dir) === dir) return undefined;
    }
  }
}
