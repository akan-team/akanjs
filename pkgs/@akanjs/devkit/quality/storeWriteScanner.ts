import type ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { type StoreCallTarget, StoreSource } from "./storeSource";
import { WritePath } from "./writePath";
import type { WritingActionIndex } from "./writingActionIndex";

export interface StoreMultiWrite {
  action: string;
  line: number;
  writes: string[];
  writeCount: number;
  isRootChain: boolean;
}

export class StoreWriteScanner {
  readonly #index: WritingActionIndex;

  constructor(index: WritingActionIndex) {
    this.#index = index;
  }

  scan({ file, sourceFile }: Pick<SourceFileInfo, "file" | "sourceFile">): StoreMultiWrite[] {
    const source = new StoreSource({ file, sourceFile });
    return source.methods.flatMap((method) => {
      const targets = new Map<ts.CallExpression, StoreCallTarget>();
      const path = new WritePath((call) => {
        const target = this.#index.writeOf(source, method, call);
        if (target) targets.set(call, target);
        return !!target;
      });
      const writes = path.along(method.body);
      const writeCount = path.countOf(writes);
      const second = writes[1] ?? writes[0];
      if (writeCount < 2 || !second) return [];
      return [
        {
          action: method.name,
          line: sourceFile.getLineAndCharacterOfPosition(second.getStart(sourceFile)).line + 1,
          writes: writes.map((call) => path.labelOf(call, sourceFile)),
          writeCount,
          isRootChain: writes.some((call) => StoreWriteScanner.#crossesStores(targets.get(call), method.store)),
        },
      ];
    });
  }

  static #crossesStores(target: StoreCallTarget | undefined, ownStore: string) {
    return (target?.kind === "static" && target.store !== ownStore) || (target?.kind === "action" && !target.isOwn);
  }
}
