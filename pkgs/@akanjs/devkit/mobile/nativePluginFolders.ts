import { readdir } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";

export interface NativePluginFolder {
  id: string;
  /** Absolute: the native build takes a plugin that is not builtin by its folder. */
  dir: string;
  /** Whose `native/` holds it: `apps/<app>` or `libs/<lib>`. */
  owner: string;
}

//* An app's and its libs' own native plugins, each in `native/<id>/` beside its `native-plugin.json`. Every mobile and
//* desktop target of the app ships them (the manifest says per platform what runs there); a lib's reach only the apps
//* that depend on it.
export class NativePluginFolders {
  static readonly folder = "native";

  static async in(root: string, owner: string): Promise<NativePluginFolder[]> {
    const base = path.join(root, NativePluginFolders.folder);
    const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return await Promise.all(
      folders.sort().map(async (name) => {
        const where = `${owner}/${NativePluginFolders.folder}/${name}`;
        const manifest = Bun.file(path.join(base, name, "native-plugin.json"));
        if (!(await manifest.exists()))
          throw new Error(`${where} has no native-plugin.json; a folder in native/ is one native plugin.`);
        const { id } = (await manifest.json()) as { id?: unknown };
        if (id !== name)
          throw new Error(`${where}/native-plugin.json has id ${JSON.stringify(id)}; name the folder after its id.`);
        return { id, dir: path.join(base, name), owner };
      }),
    );
  }

  /** The app's own plugin wins an id; two libs may not both claim one. */
  static select(own: NativePluginFolder[], fromLibs: NativePluginFolder[]): NativePluginFolder[] {
    const chosen = new Map(own.map((plugin) => [plugin.id, plugin]));
    for (const plugin of fromLibs) {
      const held = chosen.get(plugin.id);
      if (!held) chosen.set(plugin.id, plugin);
      else if (held.owner.startsWith("libs/"))
        throw new Error(
          `${held.owner} and ${plugin.owner} both hold native plugin "${plugin.id}"; give the app its own native/${plugin.id} to pick one.`,
        );
    }
    return [...chosen.values()];
  }

  static async of(app: App): Promise<NativePluginFolder[]> {
    const scanInfo = app.getScanInfo({ allowEmpty: true }) ?? (await app.scan({ write: false }));
    const root = app.workspace.workspaceRoot;
    const [own, ...fromLibs] = await Promise.all([
      NativePluginFolders.in(app.cwdPath, `apps/${app.name}`),
      ...scanInfo.getLibs().map((lib) => NativePluginFolders.in(path.join(root, "libs", lib), `libs/${lib}`)),
    ]);
    return NativePluginFolders.select(own ?? [], fromLibs.flat());
  }
}
