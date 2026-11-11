import { createAst, createFactReader, type FileFacts } from "@akanjs/language";
import { modelNames } from "akanjs/common";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";

interface EndpointShape {
  kind: "query" | "mutation";
  argCount: number;
}

export class SignalMutationIndex {
  //? As the client generates them: `update<Model>(id, data, option?)`, `add<Model>Files(files, parentId?, option?)`.
  static #generatedArgCounts = [
    ["createModel", 1],
    ["updateModel", 2],
    ["removeModel", 1],
    ["mergeModel", 2],
    ["addModelFiles", 2],
  ] as const;
  static #reader = createFactReader(ts, createAst(ts));
  readonly #shapesByOwner = new Map<string, Map<string, EndpointShape>>();

  constructor(sourceFiles: SourceFileInfo[]) {
    for (const { file, sourceFile } of sourceFiles) {
      if (!/^(apps|libs)\/[^/]+\/lib\/.+\.signal\.ts$/.test(file)) continue;
      const owner = file.split("/").slice(0, 2).join("/");
      const shapes = this.#shapesByOwner.get(owner) ?? new Map<string, EndpointShape>();
      SignalMutationIndex.#collect(SignalMutationIndex.#reader.read(sourceFile, owner), shapes);
      this.#shapesByOwner.set(owner, shapes);
    }
  }

  isMutation(consumerFile: string, name: string) {
    return this.#shapeOf(consumerFile, name)?.kind === "mutation";
  }

  /** Where a call to the mutation passes its `FetchPolicy`: the argument right after the ones it declares. */
  policyIndexOf(consumerFile: string, name: string): number | null {
    const shape = this.#shapeOf(consumerFile, name);
    return shape?.kind === "mutation" ? shape.argCount : null;
  }

  #shapeOf(consumerFile: string, name: string) {
    const [root, owner] = consumerFile.split("/");
    const own = this.#shapesByOwner.get(`${root}/${owner}`)?.get(name);
    if (own) return own;
    for (const [key, shapes] of this.#shapesByOwner) {
      const shape = shapes.get(name);
      if (key.startsWith("libs/") && shape?.kind === "mutation") return shape;
    }
    return undefined;
  }

  static #collect(facts: FileFacts, shapes: Map<string, EndpointShape>) {
    for (const { model } of facts.slices) {
      if (!model) continue;
      const names = modelNames(model);
      for (const [role, argCount] of SignalMutationIndex.#generatedArgCounts)
        shapes.set(names[role], { kind: "mutation", argCount });
    }
    for (const { keys } of facts.endpoints)
      for (const { name, verb, argCount } of keys) {
        //? A socket message writes with the visitor's credential as a mutation does, and the client refuses it alike.
        const kind = verb === "message" ? "mutation" : verb;
        if (kind === "query" || kind === "mutation") shapes.set(name, { kind, argCount });
      }
  }
}
