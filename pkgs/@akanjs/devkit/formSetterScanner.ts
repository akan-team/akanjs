import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";

/**
 * The inventory of model fields a screen writes but does not publish.
 *
 * A control handed `onChange={st.do.setTitleOnTask}` **by reference** names the field it writes, so it emits
 * `data-akan-action` and `useFieldTool` publishes the field to the in-page agent. Any wrapper around that setter is
 * an anonymous closure carrying neither, and the field goes quiet — for the agent, for an E2E selector, and for the
 * accessibility tree.
 *
 * `no-unpublished-form-setter.grit` is the per-line enforcement, and it fires only on a pure forwarding wrapper,
 * because every other shape has a legitimate reading and a lint error would be wrong. This is the other half: the
 * per-file count of fields that ended up unreachable whatever the reason, which is the number worth watching. A
 * warning rather than an error for the same reason — the remedy depends on why the wrapper is there.
 *
 * Only a handler that takes a parameter is counted. A zero-parameter handler (`onClick={() => st.do.setStatusOnUser
 * ("active")}`) is a button setting a constant, not a form control, and its remedy is an `st.tool` beside it.
 */
export class FormSetterScanner {
  static #fieldSetter = /^set[A-Za-z0-9_$]*On[A-Za-z0-9_$]*$/;

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    return sourceFiles.filter((sourceFile) => sourceFile.file.endsWith(".tsx")).flatMap((f) => this.#scanFile(f));
  }

  #scanFile({ file, sourceFile }: SourceFileInfo): QualityWarning[] {
    const wrapped: { setter: string; line: number }[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node)) {
        const setter = FormSetterScanner.#wrappedSetterOf(node);
        if (setter) wrapped.push({ setter, line: FormSetterScanner.#lineOf(sourceFile, node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!wrapped.length) return [];
    const setters = [...new Set(wrapped.map((entry) => entry.setter))].sort();
    return [
      {
        rule: "akan.agent.unpublished-form-setter",
        scope: "agent",
        severity: "warning",
        message:
          setters.length === 1
            ? `${setters[0]} is reached through a wrapper, so that field publishes no agent tool and carries no data-akan-action.`
            : `${setters.length} field setters are reached through a wrapper, so those fields publish no agent tool and carry no data-akan-action: ${setters.join(", ")}.`,
        file,
        line: wrapped[0]?.line,
        locations: wrapped.map(({ line }) => ({ file, line })),
      },
    ];
  }

  /** The setter a handler prop writes behind a wrapper, or null when it is passed by reference or absent. */
  static #wrappedSetterOf(attribute: ts.JsxAttribute): string | null {
    if (!ts.isIdentifier(attribute.name) || !/^on[A-Z]/.test(attribute.name.text)) return null;
    const initializer = attribute.initializer;
    if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return null;
    const handler = initializer.expression;
    if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return null;
    if (!handler.parameters.length) return null;
    return FormSetterScanner.#setterCallIn(handler.body);
  }

  static #setterCallIn(node: ts.Node): string | null {
    let found: string | null = null;
    const visit = (current: ts.Node) => {
      if (found) return;
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
        const { expression, name } = current.expression;
        if (
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === "st" &&
          expression.name.text === "do" &&
          FormSetterScanner.#fieldSetter.test(name.text)
        ) {
          found = name.text;
          return;
        }
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
  }

  static #lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }
}
