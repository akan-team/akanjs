import path from "node:path";
import { ModuleParts } from "./moduleParts";
import { PartImports, type PartImportsOptions } from "./partImports";

export interface PartSource {
  source: string;
  //? A source handed over as it is: a macro host, a file another one stands in for, a vendor file.
  settled?: boolean;
}

export interface PartModulesOptions {
  workspaceRoot: string;
  resolve: PartImportsOptions["resolve"];
  //? A file as its bundle loads it, read once per bundle; null for one the bundler loads itself.
  read: (file: string) => Promise<PartSource | null>;
  //? Parts by file and source text, shared by the bundles of one build: most files read the same in each.
  cache: Map<string, ModuleParts | null>;
}

interface Loaded extends PartSource {
  parts: ModuleParts | null;
}

const CONVENTION_FILE = /\.(?:constant|dictionary|document|service|signal|store)\.ts$/;
const SOURCE_FILE = /\.tsx?$/;

//* What a bundle loads for a workspace file taken apart: the file's path answers with re-exports of its parts, and
//* the path with a part's id answers with that part.
export class PartModules {
  readonly #options: PartModulesOptions;
  readonly #imports: PartImports;
  readonly #loaded = new Map<string, Promise<Loaded | null>>();

  constructor(options: PartModulesOptions) {
    this.#options = options;
    this.#imports = new PartImports({
      resolve: options.resolve,
      partsOf: async (file) => (this.#splits(file) ? ((await this.#loadedOf(file))?.parts ?? null) : null),
    });
  }

  #splits(file: string): boolean {
    return PartModules.splits(this.#options.workspaceRoot, file);
  }

  static fileOf(request: string): string {
    return request.replace(ModuleParts.specifier, "");
  }

  //? Generated barrels, runtime pieces and convention files stay whole: other build steps read them by path.
  static splits(workspaceRoot: string, file: string): boolean {
    const [kind, , ...rest] = path.relative(workspaceRoot, file).split(path.sep);
    if (kind !== "apps" && kind !== "libs") return false;
    if (rest.length < 2 || rest.includes("node_modules") || rest.includes(".akan")) return false;
    if (rest[0] === "lib" && (rest.length < 3 || rest[1] === "__client")) return false;
    const base = rest[rest.length - 1] ?? "";
    return SOURCE_FILE.test(base) && !CONVENTION_FILE.test(base) && !/^index\.tsx?$/.test(base);
  }

  async load(request: string): Promise<string | null> {
    const file = PartModules.fileOf(request);
    const id = request.match(ModuleParts.specifier)?.[1];
    const loaded = await this.#loadedOf(file);
    if (!loaded) return null;
    if (loaded.settled) return loaded.source;
    const text = id ? loaded.parts?.sourceOf(id, file) : (loaded.parts?.facade(file) ?? loaded.source);
    if (typeof text !== "string") throw new Error(`[akan] ${file} was asked for a part it does not have: ${id}`);
    return (await this.#imports.rewrite(text, file)) ?? text;
  }

  #loadedOf(file: string): Promise<Loaded | null> {
    const known = this.#loaded.get(file);
    if (known) return known;
    const loaded = this.#options.read(file).then((read) => {
      if (!read) return null;
      return { ...read, parts: read.settled || !this.#splits(file) ? null : this.#partsOf(file, read.source) };
    });
    this.#loaded.set(file, loaded);
    return loaded;
  }

  #partsOf(file: string, source: string): ModuleParts | null {
    const key = `${file}\n${Bun.hash(source).toString(36)}`;
    const known = this.#options.cache.get(key);
    if (known !== undefined) return known;
    const parts = ModuleParts.read(source, file);
    this.#options.cache.set(key, parts);
    return parts;
  }
}
