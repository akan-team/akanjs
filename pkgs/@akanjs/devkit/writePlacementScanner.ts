import ts from "typescript";
import { StoreAccessScanner } from "./storeAccessScanner";
import type { WritingActionIndex } from "./writingActionIndex";

export interface WritePlacement {
  line: number;
  writes: string[];
}

//* A write leaves the browser through one store action, started by one module component: an agent, a test or another
//* screen reaches it through the store, and `ui/` / `webkit/` stay free of any one model.
export class WritePlacementScanner {
  readonly #index: WritingActionIndex;

  constructor(index: WritingActionIndex) {
    this.#index = index;
  }

  scan(file: string, workspaceFile: string, sourceFile: ts.SourceFile): WritePlacement | null {
    const fetchNames = StoreAccessScanner.localNamesOf(sourceFile, "fetch");
    const stNames = file.startsWith("lib/") ? new Set<string>() : StoreAccessScanner.stNamesOf(sourceFile);
    if (!fetchNames.size && !stNames.size) return null;
    const sites: ts.PropertyAccessExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && this.#isWrite(node, workspaceFile, fetchNames, stNames))
        sites.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const first = sites[0];
    if (!first) return null;
    return {
      line: sourceFile.getLineAndCharacterOfPosition(first.getStart(sourceFile)).line + 1,
      writes: sites.map((site) => site.getText(sourceFile)),
    };
  }

  #isWrite(access: ts.PropertyAccessExpression, workspaceFile: string, fetchNames: Set<string>, stNames: Set<string>) {
    const owner = access.expression;
    if (ts.isIdentifier(owner) && fetchNames.has(owner.text))
      return this.#index.isMutation(workspaceFile, access.name.text);
    return (
      ts.isPropertyAccessExpression(owner) &&
      owner.name.text === "do" &&
      ts.isIdentifier(owner.expression) &&
      stNames.has(owner.expression.text) &&
      this.#index.isWritingAction(access.name.text)
    );
  }
}
