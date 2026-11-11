import type ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import type { SignalMutationIndex } from "./signalMutationIndex";
import { type StoreCallTarget, type StoreMethod, StoreSource } from "./storeSource";

//? Stores merge into one root, so an action name means one action wherever it is called from.
export class WritingActionIndex {
  readonly #mutations: SignalMutationIndex;
  readonly #actions = new Set<string>();
  readonly #statics = new Set<string>();

  constructor(mutations: SignalMutationIndex, storeFiles: Pick<SourceFileInfo, "file" | "sourceFile">[]) {
    this.#mutations = mutations;
    const sources = storeFiles.map((storeFile) => new StoreSource(storeFile));
    for (const source of sources)
      for (const { refName } of source.stores) {
        const generated = refName ? StoreSource.generatedWritesOf(refName) : [];
        if (generated[0] && mutations.isMutation(source.file, generated[0]))
          for (const name of generated) this.#actions.add(name);
      }
    const methods = sources.flatMap((source) =>
      source.methods.map((method) => ({ file: source.file, method, targets: source.targetsIn(method) })),
    );
    let grew = true;
    while (grew) {
      grew = false;
      for (const { file, method, targets } of methods) {
        if (this.#holds(method) || !targets.some((target) => this.#writes(file, target))) continue;
        if (method.isStatic) this.#statics.add(`${method.store}.${method.name}`);
        else this.#actions.add(method.name);
        grew = true;
      }
    }
  }

  isWritingAction(name: string) {
    return this.#actions.has(name);
  }

  isMutation(consumerFile: string, name: string) {
    return this.#mutations.isMutation(consumerFile, name);
  }

  writeOf(source: StoreSource, method: StoreMethod, call: ts.CallExpression): StoreCallTarget | null {
    const target = source.targetOf(method, call);
    if (!target || !this.#writes(source.file, target)) return null;
    const isSelf =
      target.kind !== "fetch" &&
      target.name === method.name &&
      (target.kind === "static" ? method.isStatic && target.store === method.store : !method.isStatic);
    return isSelf ? null : target;
  }

  #holds(method: StoreMethod) {
    return method.isStatic ? this.#statics.has(`${method.store}.${method.name}`) : this.#actions.has(method.name);
  }

  #writes(file: string, target: StoreCallTarget) {
    if (target.kind === "fetch") return this.#mutations.isMutation(file, target.name);
    if (target.kind === "action") return this.#actions.has(target.name);
    return this.#statics.has(`${target.store}.${target.name}`);
  }
}
