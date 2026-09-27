import path from "node:path";
import type * as NativeBuildApi from "@akanjs/native/api";

export type NativeBuildApiModule = typeof NativeBuildApi;

export class NativeApi {
  //* The build API versions itself; a major this devkit was not written against is refused before anything builds.
  static readonly supportedMajor = 0;

  /** The API of the akanjs the app installed: the workspace package inside this repo, akanjs's vendored copy elsewhere. */
  static entryOf(appDir: string): string {
    const workspaceEntry = NativeApi.#resolve("@akanjs/native/api", appDir);
    if (workspaceEntry) return workspaceEntry;
    const akanjsPackage = NativeApi.#resolve("akanjs/package.json", appDir);
    if (!akanjsPackage) throw new Error(`akanjs is not installed for ${appDir}; the native build ships inside it.`);
    return path.join(path.dirname(akanjsPackage), "vendor", "@akanjs", "native", "packages", "cli", "src", "api.ts");
  }

  static async load(appDir: string): Promise<NativeBuildApiModule> {
    const entry = NativeApi.entryOf(appDir);
    if (!(await Bun.file(entry).exists()))
      throw new Error(`The installed akanjs has no native build at ${entry}; update akanjs.`);
    const api = (await import(entry)) as NativeBuildApiModule;
    const major = Number(api.API_VERSION.split(".")[0]);
    if (major !== NativeApi.supportedMajor)
      throw new Error(
        `The native build API is ${api.API_VERSION}, and this akan CLI speaks ${NativeApi.supportedMajor}.x; install matching versions of akanjs and @akanjs/cli.`,
      );
    return api;
  }

  static #resolve(specifier: string, from: string) {
    try {
      return Bun.resolveSync(specifier, from);
    } catch {
      // Not installed where the app can reach it, which the caller answers with the next place to look.
      return null;
    }
  }
}
