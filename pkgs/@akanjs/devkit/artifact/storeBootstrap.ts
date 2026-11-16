import path from "node:path";
import type { App } from "../commandDecorators";
import type { BarrelExportMap } from "../transforms/barrelAnalyzer";

const PAGE_ONLY_NAMES = new Set(["usePage", "msg", "Err"]);

export type ClientRuntimeScope = "whole" | "page";

//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static readonly pageRuntime = "usePage";

  //? `akanjs/ui/modelRuntime` is empty on disk: a framework UI file reaching a store key or a fetch handler by a
  //? computed name imports it, and a build whose entries load only the page runtime answers it with the app's.
  static readonly modelRuntimeFilter = /[\\/]akanjs[\\/]ui[\\/]modelRuntime\.[jt]s$/;

  //? `"page"` only where the page runtime file exists: a workspace not synced since it came keeps the whole runtime.
  static async scopeOf(app: App): Promise<ClientRuntimeScope> {
    if ((await app.getConfig()).clientRuntime !== "route") return "whole";
    const lib = path.join(app.cwdPath, "lib");
    const [hasStore, hasPage] = await Promise.all(
      ["st.ts", `${StoreBootstrap.pageRuntime}.ts`].map((file) => Bun.file(path.join(lib, file)).exists()),
    );
    return hasStore && hasPage ? "page" : "whole";
  }

  static importLines(appName: string, scope: ClientRuntimeScope = "whole"): string[] {
    return StoreBootstrap.#lines(
      scope === "page"
        ? [`@apps/${appName}/lib/${StoreBootstrap.pageRuntime}`]
        : [`@apps/${appName}/lib/useClient`, `@apps/${appName}/lib/st`],
    );
  }

  static source(appName: string, scope: ClientRuntimeScope = "whole"): string {
    return `${StoreBootstrap.importLines(appName, scope).join("\n")}\n`;
  }

  //? Absolute paths: the marker sits in `akanjs`, where neither a consumer's node_modules nor this repo's package
  //? tsconfig maps `@apps/*`. Always the app's runtime, never a lib's, so every module's descriptors and stores load.
  static modelRuntimeSource(app: App): string {
    const files = ["useClient.ts", "st.ts"].map((file) => path.join(app.cwdPath, "lib", file));
    return `${StoreBootstrap.#lines(files.map((file) => file.split(path.sep).join("/"))).join("\n")}\n`;
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
