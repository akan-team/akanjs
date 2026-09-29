//* A module factory runs inside one classic script with every module written beside it, so a factory that does not
//* parse as a script drops them all, far from the cause. Each is parsed once, as the page will, before it is written.
export class CsrDevFactoryCheck {
  static readonly #parsed = new Set<number | bigint>();

  /** Why the page could not parse `factory` after `helperDefinition`, or null when it can. */
  static problemOf(factory: string, helperDefinition = ""): string | null {
    const key = Bun.hash(`${helperDefinition}\0${factory}`);
    if (CsrDevFactoryCheck.#parsed.has(key)) return null;
    const problem = CsrDevFactoryCheck.#syntaxError(`${helperDefinition}return (${factory});`);
    if (problem === null) {
      CsrDevFactoryCheck.#parsed.add(key);
      return null;
    }
    if (problem.includes("import.meta")) {
      //? JSC's own line is the caller's, not the factory's; the factory's line N is line N of Bun's output.
      const line = factory.split("\n").findIndex((text) => /(?<![\w$.])import\.meta\b/.test(text));
      return `import.meta is left in it${line > 0 ? ` (compiled line ${line})` : ""}, which a classic script cannot hold: ${problem}`;
    }
    if (CsrDevFactoryCheck.#syntaxError(`${helperDefinition}return (async ${factory});`) === null)
      return `a top-level await is left in it, which a CommonJS factory cannot wait on: ${problem}`;
    return problem;
  }

  /** Stands in for a module left out of the registry: the page runs, and requiring the module says why. */
  static thrower(id: string, problem: string): string {
    const message = `[akan-csr] ${id} was left out of the dev registry: ${problem}`;
    return `function () {\n  throw new Error(${JSON.stringify(message)});\n}`;
  }

  static #syntaxError(source: string): string | null {
    try {
      new Function(source);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}
