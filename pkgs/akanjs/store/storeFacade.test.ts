import { afterEach, describe, expect, test } from "bun:test";
import { StoreFacade } from "./storeFacade";

const ownersKey = Symbol.for("akanjs.store.owners");
const globals = globalThis as { [key: symbol]: unknown };

const inDevelopment = <T>(run: () => T): T => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    return run();
  } finally {
    process.env.NODE_ENV = previous;
  }
};

const messageOf = (read: () => unknown): string => {
  try {
    read();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the read to throw");
};

describe("StoreFacade on a key no loaded store declares", () => {
  afterEach(() => {
    delete globals[ownersKey];
  });

  test("names the module whose store declares it, when the dev server published the owners", () => {
    globals[ownersKey] = { use: { "memo (apps/minimal)": ["memo", "memoList"] }, do: {}, slice: {} };
    const facade = inDevelopment(() => StoreFacade.guard("use", { known: 1 } as Record<string, unknown>));

    const message = messageOf(() => facade.memoList);

    expect(message).toContain("st.use.memoList is not registered");
    expect(message).toContain("memo (apps/minimal)");
    expect(message).toContain("name st.use.memoList statically in the file that reads it");
    expect(message).toContain("import st from the app's client barrel");
    expect(facade.known).toBe(1);
  });

  test("still says how to load it when no module declares the key", () => {
    globals[ownersKey] = { use: {}, do: { "memo (apps/minimal)": ["setMemo"] }, slice: {} };
    const facade = inDevelopment(() => StoreFacade.guard("do", {} as Record<string, unknown>));

    const message = messageOf(() => facade.setNote);

    expect(message).toContain("no store loaded on this page declares it");
    expect(message).toContain("name st.do.setNote statically");
    expect(message).not.toContain("memo (apps/minimal)");
  });

  test("keeps its message where no owners were published", () => {
    const facade = inDevelopment(() => StoreFacade.guard("slice", {} as Record<string, unknown>));

    expect(messageOf(() => facade.memoInSelf)).toBe(
      "st.slice.memoInSelf is not registered: no store loaded on this page declares it. Check the name, or import st from the app's client barrel in a client component of this route.",
    );
  });
});
