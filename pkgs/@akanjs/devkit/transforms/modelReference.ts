import { readdir } from "node:fs/promises";
import path from "node:path";

const referenceFile = /(?:^|[\\/])lib[\\/]__client[\\/]([^\\/]+)\.ref\.ts$/;
const directive = /^"use client";$/m;
const suffix = ".ref.ts";

//? On disk a reference file names no piece: a bundle holding the whole runtime reads it too and would load each twice.
export class ModelReference {
  static readonly registry = "__client/refs";

  static registrySpecifier(appName: string): string {
    return `@apps/${appName}/lib/${ModelReference.registry}`;
  }

  static async filesOf(workspaceRoot: string, appScope: string): Promise<Map<string, string>> {
    const dir = path.join(workspaceRoot, appScope, "lib/__client");
    const files = await readdir(dir).catch(() => []);
    return new Map(
      files
        .filter((file) => file.endsWith(suffix))
        .sort()
        .map((file) => [file.slice(0, -suffix.length), path.join(dir, file)]),
    );
  }

  static modelOf(file: string): string | null {
    return file.match(referenceFile)?.[1] ?? null;
  }

  static isFile(file: string): boolean {
    return referenceFile.test(file);
  }

  //? `loads` imports each piece by name for `loadedAfter`: Bun's chunk splitting moves an effect-only import away.
  static sourceOf(source: string, loads: string[]): string {
    return loads.length ? source.replace(directive, (line) => [line, ...loads].join("\n")) : source;
  }
}
