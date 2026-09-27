import { afterEach, describe, expect, test } from "bun:test";
import { closureFor, loadMavenLock } from "../../../packages/cli/src/lib/maven.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type IapProduct, type IapPurchaseArgs, type IapTransaction, iap } from "../src/index.ts";

// akanjs readiness O6-3. The stores themselves are tested in the apps that sell (user decision).

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});
const tick = () => new Promise((r) => setTimeout(r, 0));

const transaction: IapTransaction = {
  id: "2000000123456789",
  productId: "coins_100",
  state: "purchased",
  purchaseDate: 1790000000000,
  quantity: 1,
  originalId: "2000000123456789",
  environment: "Sandbox",
  verified: true,
  verification: {
    jws: "eyJhbGciOiJFUzI1NiJ9.e30.sig",
    transactionId: "2000000123456789",
    originalTransactionId: "2000000123456789",
  },
};

describe("iap", () => {
  test("the web and desktops have no store: every method is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    for (const call of [
      () => iap.canMakePayments(),
      () => iap.getProducts({ ids: ["x"] }),
      () => iap.getUnfinished(),
    ]) {
      expect(isAkanNativeError(await call().catch((e) => e), "UNSUPPORTED")).toBe(true);
    }
  });

  test("the akanjs flow: products, purchase, server verification data, finish", async () => {
    const product: IapProduct = {
      id: "coins_100",
      type: "consumable",
      title: "100 coins",
      description: "",
      displayPrice: "₩1,200",
      price: 1200,
      currency: "KRW",
      offers: [
        {
          kind: "oneTime",
          phases: [{ displayPrice: "₩1,200", price: 1200, currency: "KRW", cycles: 1, mode: "payUpFront" }],
        },
      ],
    };
    const finished: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        iap: {
          methods: {
            getProducts: (args: { ids: string[] }) => ({
              products: [product],
              invalidIds: args.ids.filter((id) => id !== product.id),
            }),
            purchase: (args: IapPurchaseArgs) =>
              args.productId === product.id ? { status: "purchased", transaction } : { status: "pending" },
            finish: (args: unknown) => void finished.push(args),
          },
          events: ["transaction"],
        },
      },
    });
    const { products, invalidIds } = await iap.getProducts({ ids: ["coins_100", "gone"] });
    expect(products[0]!.displayPrice).toBe("₩1,200");
    expect(invalidIds).toEqual(["gone"]);
    const result = await iap.purchase({ productId: "coins_100", accountId: "7f1c6a52-2a4b-4f3e-9d61-3b1f0a9b8c11" });
    expect(result.status).toBe("purchased");
    expect(result.transaction!.verification.jws).toContain(".");
    await iap.finish({ transactionId: result.transaction!.id, consume: true });
    expect(finished).toEqual([{ transactionId: "2000000123456789", consume: true }]);
  });

  test("transactions that no purchase() answered arrive as events", async () => {
    host = installMockHost({ platform: "android", plugins: { iap: { methods: {}, events: ["transaction"] } } });
    const seen: IapTransaction[] = [];
    const stop = iap.listen("transaction", (t) => seen.push(t));
    await tick();
    const android: IapTransaction = {
      id: "token-abc",
      productId: "premium",
      state: "purchased",
      purchaseDate: 1790000000000,
      quantity: 1,
      acknowledged: false,
      verification: {
        purchaseToken: "token-abc",
        orderId: "GPA.1234-5678-9012-34567",
        packageName: "com.akanjs.sample",
      },
    };
    host.emit("iap", "transaction", android);
    expect(seen).toEqual([android]);
    stop();
  });

  test("the manifest: StoreKit on iOS, the pinned Billing closure on Android", () => {
    expect(manifest.ios.frameworks).toEqual(["StoreKit"]);
    expect(manifest.android.maven).toEqual(["com.android.billingclient:billing:9.1.0"]);
    const lock = loadMavenLock();
    expect(closureFor(lock, manifest.android.maven)!.name).toBe("billing");
    // push and iap together use the union closure
    const push = ["com.google.firebase:firebase-messaging:25.1.3", "androidx.core:core:1.10.0"];
    expect(closureFor(lock, [...manifest.android.maven, ...push])!.name).toBe("union");
  });
});
