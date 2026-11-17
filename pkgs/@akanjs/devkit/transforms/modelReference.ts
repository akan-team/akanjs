import { readdir } from "node:fs/promises";
import path from "node:path";

export interface ModelReferenceSource {
  source: string;
  pieces: string[];
}

const referenceFile = /^(?:apps|libs)\/[^/]+\/lib\/__client\/([^/]+)\.ref\.ts$/;
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

  //? Each piece is a binding the exported value uses: Bun's chunk splitting moves an effect-only import to the entries.
  static sourceOf(
    source: string,
    fileName: string,
    scopesInLoadOrder: string[],
    pieces: ReadonlySet<string>,
  ): ModelReferenceSource | null {
    const [, model] = fileName.match(referenceFile) ?? [];
    if (!model) return null;
    const outermost = (kind: "fetch" | "st") =>
      [...scopesInLoadOrder]
        .reverse()
        .map((scope) => `${scope}/lib/__client/${model}.${kind}`)
        .find((piece) => pieces.has(piece));
    const [descriptors, store] = [outermost("fetch"), outermost("st")];
    if (!descriptors && !store) return { source, pieces: [] };
    const lines = [
      '"use client";',
      "",
      ...(descriptors ? [`import * as descriptors from ${JSON.stringify(`@${descriptors}`)};`] : []),
      ...(store ? [`import { ${model} as store } from ${JSON.stringify(`@${store}`)};`] : []),
      "",
      `export const reference = ${descriptors ? "descriptors && " : ""}${store ? "store.refName" : JSON.stringify(model)};`,
      "",
    ];
    return { source: lines.join("\n"), pieces: [descriptors, store].flatMap((piece) => piece ?? []) };
  }
}
