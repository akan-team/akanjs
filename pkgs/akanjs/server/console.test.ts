import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import { assertAkanConsoleAllowed, evaluateAkanConsoleInput, getAkanConsoleMethods } from "./console";

const originalEnv = {
  AKAN_CONSOLE: process.env.AKAN_CONSOLE,
  NODE_ENV: process.env.NODE_ENV,
};

const makeEnv = (
  environment: BaseEnv["environment"],
  operationMode: BaseEnv["operationMode"],
): Pick<BaseEnv, "environment" | "operationMode"> => ({
  environment,
  operationMode,
});

describe("Akan console", () => {
  afterEach(() => {
    if (originalEnv.AKAN_CONSOLE === undefined) delete process.env.AKAN_CONSOLE;
    else process.env.AKAN_CONSOLE = originalEnv.AKAN_CONSOLE;
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  test("requires AKAN_CONSOLE for production-like environments", () => {
    delete process.env.AKAN_CONSOLE;
    process.env.NODE_ENV = "development";

    expect(() => assertAkanConsoleAllowed(makeEnv("local", "local"))).not.toThrow();
    expect(() => assertAkanConsoleAllowed(makeEnv("testing", "local"))).not.toThrow();
    expect(() => assertAkanConsoleAllowed(makeEnv("main", "cloud"))).toThrow("Akan console is disabled");

    process.env.AKAN_CONSOLE = "1";
    expect(() => assertAkanConsoleAllowed(makeEnv("main", "cloud"))).not.toThrow();
  });

  test("lists public prototype methods", () => {
    class Parent {
      parentMethod() {
        return "parent";
      }
    }
    class Child extends Parent {
      childMethod() {
        return "child";
      }
      get label() {
        return "child";
      }
    }

    expect(getAkanConsoleMethods(new Child())).toEqual(["childMethod", "parentMethod"]);
  });

  test("evaluates async expressions and persists assignments on the context", async () => {
    const context = {
      service: (refName: string) => ({
        refName,
        count: async () => 7,
      }),
    };

    await expect(evaluateAkanConsoleInput('await service("user").count()', context)).resolves.toBe(7);
    await evaluateAkanConsoleInput('userService = service("user")', context);
    expect((context as typeof context & { userService: { refName: string } }).userService.refName).toBe("user");
  });
});
