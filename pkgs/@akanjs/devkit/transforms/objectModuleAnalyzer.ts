import fs from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { type ModuleExports, ObjectModule, type ObjectModuleFacts } from "./objectModule";

const MODULE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const isFile = async (file: string) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

//? A part file's name has a dot of its own (`./Memo.Zone`), so a specifier with an extension is tried bare and with one.
export const resolveModuleFile = async (fromFile: string, specifier: string): Promise<string | null> => {
  const joined = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    joined,
    ...MODULE_EXTS.map((ext) => `${joined}${ext}`),
    ...MODULE_EXTS.map((ext) => path.join(joined, `index${ext}`)),
  ];
  for (const candidate of candidates) if (await isFile(candidate)) return candidate;
  return null;
};

export class ObjectModuleAnalyzer {
  readonly #facts = new Map<string, Promise<ObjectModuleFacts | null>>();
  readonly #exports = new Map<string, Promise<ModuleExports | null>>();

  facts(file: string): Promise<ObjectModuleFacts | null> {
    const key = ObjectModuleAnalyzer.#keyOf(file);
    let facts = this.#facts.get(key);
    if (!facts) {
      facts = ObjectModuleAnalyzer.#text(file).then((source) => {
        if (source === null || !/\bexport\b/.test(source)) return null;
        try {
          return ObjectModule.read(source, file);
        } catch {
          return null;
        }
      });
      this.#facts.set(key, facts);
    }
    return facts;
  }

  exportsOf(file: string): Promise<ModuleExports | null> {
    const key = ObjectModuleAnalyzer.#keyOf(file);
    let exports = this.#exports.get(key);
    if (!exports) {
      exports = ObjectModuleAnalyzer.#text(file).then((source) =>
        source === null ? null : ObjectModule.exportsOf(source, file),
      );
      this.#exports.set(key, exports);
    }
    return exports;
  }

  forget(files: Iterable<string>) {
    for (const file of files) {
      const key = ObjectModuleAnalyzer.#keyOf(file);
      this.#facts.delete(key);
      this.#exports.delete(key);
    }
  }

  static #keyOf(file: string) {
    try {
      return fs.realpathSync.native(file);
    } catch {
      return file;
    }
  }

  static async #text(file: string): Promise<string | null> {
    try {
      return await Bun.file(file).text();
    } catch {
      return null;
    }
  }
}
