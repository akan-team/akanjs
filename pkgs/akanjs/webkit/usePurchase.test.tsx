import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { IapProduct, IapTransaction } from "@akanjs/native/plugins/iap";

import { fakeReact, hooks } from "./hookHarness.fixture";

const product: IapProduct = {
  id: "coins_100",
  type: "consumable",
  title: "100 coins",
  description: "",
  displayPrice: "₩1,200",
  price: 1200,
  currency: "KRW",
  offers: [],
};
const purchaseOf = (id: string): IapTransaction => ({
  id,
  productId: "coins_100",
  state: "purchased",
  purchaseDate: 1790000000000,
  quantity: 1,
  verification: { jws: `jws-${id}`, transactionId: id },
});

const state = {
  calls: [] as string[],
  finished: [] as string[],
  unfinished: [] as IapTransaction[],
  purchase: null as AkanNativeError | IapTransaction | null,
};
let host: MockHost | null = null;
const originalFetch = globalThis.fetch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeAll(() => {
  mock.module("react", () =>
    fakeReact({
      useEffect: (fn: () => (() => undefined) | undefined) => {
        const cleanup = fn();
        if (cleanup) hooks.cleanups.push(cleanup);
      },
      lazy: (loader: unknown) => ({ loader }),
    }),
  );
});

const installShell = () => {
  host = installMockHost({
    platform: "ios",
    plugins: {
      app: { methods: { getInfo: () => ({ id: "com.example.app", name: "Example", version: "1.0.0" }) } },
      iap: {
        methods: {
          getProducts: ({ ids }: { ids: string[] }) => {
            state.calls.push(`getProducts ${ids.join(",")}`);
            return { products: [product], invalidIds: [] };
          },
          getUnfinished: () => {
            state.calls.push("getUnfinished");
            return { transactions: state.unfinished };
          },
          purchase: ({ productId }: { productId: string }) => {
            state.calls.push(`purchase ${productId}`);
            if (state.purchase instanceof AkanNativeError) throw state.purchase;
            return { status: "purchased", transaction: state.purchase };
          },
          finish: ({ transactionId }: { transactionId: string }) => {
            state.finished.push(transactionId);
          },
        },
        events: ["transaction"],
      },
    },
  });
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
  return host;
};

const hookOf = async (platform: "ios" | "android" | "all" = "all") => {
  const { usePurchase } = await import("./usePurchase");
  hooks.index = 0;
  return usePurchase({
    platform,
    productInfo: [{ id: "coins_100", type: "consumable" }],
    url: "https://b.example.com",
  });
};

afterEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  hooks.states.length = 0;
  host?.uninstall();
  host = null;
  globalThis.fetch = originalFetch;
  Object.assign(state, { calls: [], finished: [], unfinished: [], purchase: null });
});

describe("usePurchase", () => {
  test("at mount: loads the products and finishes what the last launch left unfinished, and later transactions", async () => {
    const shell = installShell();
    state.unfinished = [purchaseOf("left-over")];
    await hookOf();
    await settle();

    expect(state.calls).toEqual(["getProducts coins_100", "getUnfinished"]);
    expect(state.finished).toEqual(["left-over"]);
    expect(hooks.states[1]).toEqual([product]);

    shell.emit("iap", "transaction", purchaseOf("ask-to-buy"));
    await settle();
    expect(state.finished).toEqual(["left-over", "ask-to-buy"]);
  });

  test("a shell on a platform the app does not sell in asks the store nothing", async () => {
    installShell();
    await hookOf("android");
    await settle();
    expect(state.calls).toEqual([]);
  });

  test("a purchase answers purchased once finished, cancelled when the sheet is closed", async () => {
    installShell();
    const purchase = await hookOf();
    await settle();

    state.purchase = purchaseOf("bought-now");
    expect(await purchase.purchaseProduct(product)).toBe("purchased");
    state.purchase = new AkanNativeError("CANCELLED", "closed");
    expect(await purchase.purchaseProduct("coins_100")).toBe("cancelled");
    expect(state.finished).toEqual(["bought-now"]);
  });
});
