import { afterEach, describe, expect, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { IapTransaction } from "@akanjs/native/plugins/iap";

import { NativePurchase, type PurchaseProductInfo } from "./nativePurchase";

const productInfo: PurchaseProductInfo[] = [
  { id: "coins_100", type: "consumable" },
  { id: "remove_ads", type: "nonConsumable" },
  { id: "pro_monthly", type: "subscription" },
];

const iosPurchase = (id: string, productId = "coins_100"): IapTransaction => ({
  id,
  productId,
  state: "purchased",
  purchaseDate: 1790000000000,
  quantity: 1,
  verification: { jws: `jws-${id}`, transactionId: id, appReceipt: "receipt" },
});

const androidPurchase = (token: string, productId: string): IapTransaction => ({
  id: token,
  productId,
  state: "purchased",
  purchaseDate: 1790000000000,
  quantity: 1,
  acknowledged: false,
  verification: { purchaseToken: token, orderId: `GPA.${token}`, packageName: "com.example.app" },
});

const state = {
  finished: [] as { transactionId: string; consume?: boolean }[],
  verified: [] as unknown[],
  answer: 200,
};
let host: MockHost | null = null;
const originalFetch = globalThis.fetch;

const installShell = (platform: "ios" | "android") => {
  host = installMockHost({
    platform,
    plugins: {
      app: { methods: { getInfo: () => ({ id: "com.example.app", name: "Example", version: "1.0.0" }) } },
      iap: {
        methods: {
          finish: (args: { transactionId: string; consume?: boolean }) => {
            state.finished.push(args);
          },
        },
        events: ["transaction"],
      },
    },
  });
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    state.verified.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ granted: true }), { status: state.answer });
  }) as unknown as typeof fetch;
};

afterEach(() => {
  host?.uninstall();
  host = null;
  globalThis.fetch = originalFetch;
  Object.assign(state, { finished: [], verified: [], answer: 200 });
});

describe("NativePurchase", () => {
  test("iOS: the server gets the JWS alone under `data`, then the app, then the store finishes it", async () => {
    installShell("ios");
    const delivered: unknown[] = [];
    const flow = new NativePurchase({
      productInfo,
      url: "https://billing.example.com/",
      onPay: (transaction, verified) => {
        delivered.push([transaction.id, verified, state.finished.length]);
      },
    });

    expect(await flow.settle(iosPurchase("2000000001"))).toBe("finished");
    expect(state.verified).toEqual([
      {
        url: "https://billing.example.com/billing/verifyBilling",
        body: {
          data: {
            platform: "apple",
            packageName: "com.example.app",
            productId: "coins_100",
            receipt: "jws-2000000001",
            transactionId: "2000000001",
          },
        },
      },
    ]);
    expect(delivered).toEqual([["2000000001", { granted: true }, 0]]);
    expect(state.finished).toEqual([{ transactionId: "2000000001", consume: true }]);
  });

  test("the app's own verify replaces the server call: it gets the store's proof, and a falsy answer refuses", async () => {
    installShell("android");
    const asked: unknown[] = [];
    const delivered: unknown[] = [];
    const flow = new NativePurchase({
      productInfo,
      verify: async (data, transaction) => {
        asked.push([data.receipt, transaction.verification.purchaseToken, data.packageName]);
        return data.receipt === "refused" ? null : { credited: data.productId };
      },
      onPay: (transaction, verified) => {
        delivered.push([transaction.id, verified]);
      },
    });

    expect(await flow.settle(androidPurchase("token-1", "coins_100"))).toBe("finished");
    expect(await flow.settle(androidPurchase("refused", "coins_100"))).toBe("unverified");
    expect(asked).toEqual([
      ["token-1", "token-1", "com.example.app"],
      ["refused", "refused", "com.example.app"],
    ]);
    expect(delivered).toEqual([["token-1", { credited: "coins_100" }]]);
    expect(state.verified).toEqual([]);
    expect(state.finished).toEqual([{ transactionId: "token-1", consume: true }]);
  });

  test("Android: the purchase token and order id; only a consumable is consumed, a subscription goes to onSubscribe", async () => {
    installShell("android");
    const paid: string[] = [];
    const subscribed: string[] = [];
    const flow = new NativePurchase({
      productInfo,
      url: "https://billing.example.com",
      onPay: ({ productId }) => {
        paid.push(productId);
      },
      onSubscribe: ({ productId }) => {
        subscribed.push(productId);
      },
    });

    await flow.settle(androidPurchase("tok-a", "remove_ads"));
    await flow.settle(androidPurchase("tok-b", "pro_monthly"));

    expect((state.verified[0] as { body: { data: unknown } }).body.data).toEqual({
      platform: "google",
      packageName: "com.example.app",
      productId: "remove_ads",
      receipt: "tok-a",
      transactionId: "GPA.tok-a",
    });
    expect([paid, subscribed]).toEqual([["remove_ads"], ["pro_monthly"]]);
    expect(state.finished).toEqual([
      { transactionId: "tok-a", consume: false },
      { transactionId: "tok-b", consume: false },
    ]);
  });

  test("a refused verification or a failing app callback leaves it unfinished, to come back and be tried again", async () => {
    installShell("ios");
    state.answer = 402;
    const flow = new NativePurchase({ productInfo, url: "https://billing.example.com" });
    expect(await flow.settle(iosPurchase("2000000002"))).toBe("unverified");

    state.answer = 200;
    const failing = new NativePurchase({
      productInfo,
      url: "https://billing.example.com",
      onPay: () => {
        throw new Error("credit failed");
      },
    });
    await expect(failing.settle(iosPurchase("2000000002"))).rejects.toThrow("credit failed");
    expect(state.finished).toEqual([]);

    expect(await flow.settle(iosPurchase("2000000002"))).toBe("finished");
  });

  test("the same transaction arriving twice is credited once; pending and revoked ones are left alone", async () => {
    installShell("ios");
    let credits = 0;
    const flow = new NativePurchase({
      productInfo,
      url: "https://billing.example.com",
      onPay: () => {
        credits += 1;
      },
    });
    const results = await Promise.all([flow.settle(iosPurchase("2000000003")), flow.settle(iosPurchase("2000000003"))]);
    expect(results.sort()).toEqual(["finished", "skipped"]);
    expect(await flow.settle(iosPurchase("2000000003"))).toBe("skipped");
    expect(await flow.settle({ ...iosPurchase("2000000004"), state: "pending" })).toBe("skipped");
    expect(await flow.settle({ ...iosPurchase("2000000005"), state: "revoked" })).toBe("skipped");
    expect(credits).toBe(1);
  });

  test("a product the app did not list is acknowledged, never consumed", async () => {
    installShell("android");
    await new NativePurchase({ productInfo, url: "https://billing.example.com" }).settle(
      androidPurchase("tok-c", "unknown_sku"),
    );
    expect(state.finished).toEqual([{ transactionId: "tok-c", consume: false }]);
  });
});
