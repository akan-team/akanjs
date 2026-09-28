import fs from "node:fs";
import path from "node:path";

//* The sources `lib/useClient.ts` reads through its macros, which no registry graph lists as a dependency. A registry
//* records their stamp, so a builder that loads one built before a signal or dictionary save rebuilds it, whichever
//* process saw that save (a builder restarted for it never finishes the rebuild it started).
export class RegistryMetadataFingerprint {
  static readonly #sources = new Bun.Glob("**/*.{signal,dictionary}.ts");
  static readonly #libFiles = ["sig.ts", "dict.ts", "useClient.ts"];

  /** `roots` are app and lib directories; only the metadata files under each one's `lib/` count. */
  static async of(roots: string[], isMetadataFile: (file: string) => boolean): Promise<string> {
    const stamps: string[] = [];
    for (const root of new Set(roots)) {
      const libDir = path.join(root, "lib");
      if (!fs.existsSync(libDir)) continue;
      const files = RegistryMetadataFingerprint.#libFiles.map((name) => path.join(libDir, name));
      for await (const relative of RegistryMetadataFingerprint.#sources.scan({ cwd: libDir, onlyFiles: true }))
        files.push(path.join(libDir, relative));
      for (const file of files) {
        if (!isMetadataFile(file)) continue;
        const stat = fs.statSync(file, { throwIfNoEntry: false });
        if (stat) stamps.push(`${file}:${stat.mtimeMs}:${stat.size}`);
      }
    }
    return Bun.hash(stamps.sort((a, b) => a.localeCompare(b)).join("\n")).toString(36);
  }
}
