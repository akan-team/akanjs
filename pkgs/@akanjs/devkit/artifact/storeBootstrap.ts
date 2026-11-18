import path from "node:path";
import type { App } from "../commandDecorators";
import type { BarrelExportMap } from "../transforms/barrelAnalyzer";
import { ModelReference } from "../transforms/modelReference";

const PAGE_ONLY_NAMES = new Set(["usePage", "msg", "Err"]);

export type ClientRuntimeScope = "whole" | "page";

//* Not a bare `@apps/<app>/client` import: it names nothing the barrel rewrite can narrow, so every module's UI ships.
export class StoreBootstrap {
  static readonly pageRuntime = "usePage";
  //? `akanjs/signal`'s own descriptors, which framework UI on any page calls by a static name (`Reconnect`'s `ping`).
  static readonly baseDescriptors = "__client/_base.fetch";
  //? The whole runtime as its per-module pieces: what a page loads beside the pieces it already holds, each once.
  static readonly assembled = ["__client/_useClient", "__client/_st"];

  //? `akanjs/ui/modelRuntime` is empty on disk: a framework UI file reaching a store key or a fetch handler by a
  //? computed name imports it, and a build whose entries load only the page runtime answers it with the app's.
  static readonly modelRuntimeFilter = /[\\/]akanjs[\\/]ui[\\/]modelRuntime\.[jt]s$/;

  //? `"page"` only where the page runtime files exist: a workspace not synced since it came keeps the whole runtime.
  static async scopeOf(app: App): Promise<ClientRuntimeScope> {
    const lib = path.join(app.cwdPath, "lib");
    const found = await Promise.all(
      [
        "st",
        StoreBootstrap.pageRuntime,
        StoreBootstrap.baseDescriptors,
        ...StoreBootstrap.assembled,
        ModelReference.registry,
      ].map((file) => Bun.file(path.join(lib, `${file}.ts`)).exists()),
    );
    return found.every(Boolean) ? "page" : "whole";
  }

  static serverSpecifiers(appName: string): string[] {
    return [`@apps/${appName}/lib/useClient`, `@apps/${appName}/lib/st`];
  }

  static importLines(appName: string, scope: ClientRuntimeScope = "whole"): string[] {
    return StoreBootstrap.#lines(
      scope === "page"
        ? [StoreBootstrap.pageRuntime, StoreBootstrap.baseDescriptors].map((file) => `@apps/${appName}/lib/${file}`)
        : StoreBootstrap.serverSpecifiers(appName),
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

  static ofClientBarrel(
    specifier: string,
    exports: BarrelExportMap,
    names: string[] = [],
    { perModule = false }: { perModule?: boolean } = {},
  ): string[] | null {
    if (!/^@(?:apps|libs)\/[^/]+\/client$/.test(specifier)) return null;
    const page = exports.get("usePage");
    const descriptors = exports.get("fetch") ?? page;
    const store = exports.get("st");
    //? A barrel with only one of the two is not the generated shape, so what else it runs on import is unknown.
    if (!page || page.namespace || !descriptors || descriptors.namespace || !store || store.namespace)
      return [specifier];
    const pageOnly = perModule || (names.length > 0 && names.every((name) => PAGE_ONLY_NAMES.has(name)));
    if (pageOnly && page.subpath !== descriptors.subpath) return [page.subpath];
    return [...new Set([descriptors.subpath, store.subpath])];
  }

  static #lines(specifiers: string[]): string[] {
    return specifiers.map((specifier) => `import ${JSON.stringify(specifier)};`);
  }
}
