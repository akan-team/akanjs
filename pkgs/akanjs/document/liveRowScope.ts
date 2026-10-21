import {
  type DocumentQuery,
  type DocumentQueryOperator,
  isDocumentQueryNode,
  queryOperatorKeys,
} from "./documentQuery";

type RemovedAtTest = "isNull" | "isNotNull" | "value";

/**
 * Why a query can never match a live row, or null: without `withRemoved` every read and write is scoped to
 * `removedAt IS NULL`. `q.raw()` is SQL this walk cannot read, so it goes unchecked.
 */
export class LiveRowScope {
  static conflictOf(query: DocumentQuery | undefined, negated = false): string | null {
    if (!query || typeof query !== "object") return null;
    if (isDocumentQueryNode(query)) {
      if (query.kind === "all" || query.kind === "any")
        return query.queries.reduce<string | null>(
          (found, sub) => found ?? LiveRowScope.conflictOf(sub, negated),
          null,
        );
      if (query.kind === "not") return LiveRowScope.conflictOf(query.query, !negated);
      return null;
    }
    return Object.entries(query).reduce<string | null>(
      (found, [path, value]) => found ?? LiveRowScope.#fieldConflict(path, value, negated),
      null,
    );
  }

  static #fieldConflict(path: string, value: unknown, negated: boolean): string | null {
    if (isDocumentQueryNode(value) && value.kind !== "op") return LiveRowScope.conflictOf(value, negated);
    if (path !== "removedAt") return null;
    for (const [test, spelled] of LiveRowScope.#testsOf(value)) {
      const named = negated ? `not(removedAt ${spelled})` : `removedAt ${spelled}`;
      // Negating one does not help: against a null `removedAt` the comparison is NULL, and so is its NOT.
      if (test === "value") return `${named} compares a value no live row holds`;
      if ((test === "isNotNull") !== negated) return `${named} asks for removed rows`;
    }
    return null;
  }

  static #testsOf(value: unknown): [RemovedAtTest, string][] {
    if (value === undefined) return [];
    if (value === null) return [["isNull", "null"]];
    if (isDocumentQueryNode(value) && value.kind === "op") {
      const test = LiveRowScope.#testOf(value.op, value.value);
      return test ? [test] : [];
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const operators = value as Record<string, unknown>;
      const keys = Object.keys(operators).filter((key) => queryOperatorKeys.has(key));
      if (keys.length)
        return keys.flatMap((key): [RemovedAtTest, string][] => {
          const spelled = `{ ${key}: ${String(operators[key])} }`;
          // These three carry a boolean that selects the operator, as the compiler reads them.
          if (key === "exists") return [[operators.exists ? "isNotNull" : "isNull", spelled]];
          if (key === "missing" || key === "empty") return [[operators[key] ? "isNull" : "isNotNull", spelled]];
          const test = LiveRowScope.#testOf(key as DocumentQueryOperator, operators[key]);
          return test ? [test] : [];
        });
    }
    return [["value", "eq"]];
  }

  static #testOf(op: DocumentQueryOperator, operand: unknown): [RemovedAtTest, string] | null {
    if (op === "exists") return ["isNotNull", op];
    if (op === "missing" || op === "empty") return ["isNull", op];
    if ((op === "eq" || op === "ne") && operand === null) return [op === "eq" ? "isNull" : "isNotNull", `${op}(null)`];
    // An empty list compiles to a constant (`0 = 1` / `1 = 1`), which no `removedAt` value decides.
    if ((op === "oneOf" || op === "notOneOf") && !(operand as unknown[] | undefined)?.length) return null;
    return ["value", op];
  }
}
