import { describe, expect, test } from "bun:test";
import { CsrDevFactoryCheck } from "./csrDevFactoryCheck";

const factoryOf = (body: string) =>
  `function (require, module, exports, $RefreshReg$, $RefreshSig$, __akanImport) {\n${body}\n}`;

describe("CsrDevFactoryCheck", () => {
  test("a factory that parses as a classic script has no problem, twice over", () => {
    const factory = factoryOf('var a = require("akan-module:x");\nmodule.exports = { a, label: "import.meta" };');
    expect(CsrDevFactoryCheck.problemOf(factory)).toBeNull();
    expect(CsrDevFactoryCheck.problemOf(factory)).toBeNull();
  });

  test("an import.meta left in a factory is named with its compiled line", () => {
    const problem = CsrDevFactoryCheck.problemOf(factoryOf("var a = 1;\nvar url = import.meta.url;"));
    expect(problem).toStartWith("import.meta is left in it (compiled line 2), which a classic script cannot hold");
  });

  test("a top-level await left in a factory is named as one", () => {
    const problem = CsrDevFactoryCheck.problemOf(factoryOf("var a = await Promise.resolve(1);"));
    expect(problem).toStartWith("a top-level await is left in it, which a CommonJS factory cannot wait on");
  });

  test("any other syntax error answers the parser's message, and a broken helper preamble counts too", () => {
    expect(CsrDevFactoryCheck.problemOf(factoryOf("var = ;"))).toBeString();
    expect(CsrDevFactoryCheck.problemOf(factoryOf("module.exports = 1;"), "var { a } = ;\n")).toBeString();
  });

  test("the stand-in for a module left out throws its id and the reason", () => {
    const thrower = new Function(`return (${CsrDevFactoryCheck.thrower("node_modules/x/index.js", "why")});`)();
    expect(() => thrower()).toThrow("[akan-csr] node_modules/x/index.js was left out of the dev registry: why");
  });
});
