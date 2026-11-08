import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface ModuleFolder {
  dir: string;
  name: string;
  system: string;
}

export interface EditorGrid {
  orientation: 0;
  groups: { groups?: Record<string, never>[] }[];
}

const roles = ["constant", "dictionary", "document", "service", "signal", "store"] as const;
const systemKinds = ["apps", "libs"] as const;
const segment = /^[A-Za-z0-9][\w-]{0,63}$/;

const isDirectory = (dir: string) => existsSync(dir) && statSync(dir).isDirectory();

export class ModuleLayout {
  static folderOf(root: string, fileName: string): ModuleFolder | null {
    const [kind, system, layer, folder, scalar] = path.relative(root, fileName).split(path.sep);
    if (!systemKinds.some((systemKind) => systemKind === kind) || !system || layer !== "lib" || !folder) return null;
    return ModuleLayout.#folderAt(path.join(root, kind, system, "lib"), system, folder, scalar);
  }

  static #folderAt(lib: string, system: string, folder: string, scalar?: string): ModuleFolder | null {
    const isScalar = folder === "__scalar";
    const name = isScalar ? scalar : folder;
    if (!name || name.includes(".") || (!isScalar && folder.startsWith("__"))) return null;
    const dir = isScalar ? path.join(lib, folder, name) : path.join(lib, folder);
    return isDirectory(dir) ? { dir, name: name.replace(/^_+/, ""), system } : null;
  }

  static folderFor(root: string, system: string, module: string): ModuleFolder | null {
    if (!segment.test(system) || !segment.test(module)) return null;
    for (const kind of systemKinds)
      for (const folder of [module, `_${module}`, path.join("__scalar", module)]) {
        const dir = path.join(root, kind, system, "lib", folder);
        if (isDirectory(dir)) return { dir, name: module, system };
      }
    return null;
  }

  static modulesOf(root: string): ModuleFolder[] {
    return systemKinds.flatMap((kind) => {
      const systems = path.join(root, kind);
      if (!isDirectory(systems)) return [];
      return readdirSync(systems)
        .sort()
        .flatMap((system) => {
          const lib = path.join(systems, system, "lib");
          if (!isDirectory(lib)) return [];
          const scalars = path.join(lib, "__scalar");
          const found = [
            ...readdirSync(lib)
              .sort()
              .map((folder) => ModuleLayout.#folderAt(lib, system, folder)),
            ...(isDirectory(scalars) ? readdirSync(scalars).sort() : []).map((scalar) =>
              ModuleLayout.#folderAt(lib, system, "__scalar", scalar),
            ),
          ];
          return found.filter((folder): folder is ModuleFolder => !!folder && ModuleLayout.filesIn(folder).length > 0);
        });
    });
  }

  static filesIn({ dir, name }: ModuleFolder): string[] {
    return roles.map((role) => path.join(dir, `${name}.${role}.ts`)).filter((file) => existsSync(file));
  }

  static gridOf(count: number, { besideStudio = false } = {}): EditorGrid {
    const files =
      count <= 3
        ? Array.from({ length: Math.max(count, 1) }, () => ({}))
        : Array.from({ length: Math.ceil(count / 2) }, (_, idx) => ({
            groups: idx * 2 + 1 < count ? [{}, {}] : [{}],
          }));
    return { orientation: 0, groups: besideStudio ? [...files, {}] : files };
  }
}
