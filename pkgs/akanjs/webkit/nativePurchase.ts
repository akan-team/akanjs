"use client";
import { app, type IapTransaction, loadIap } from "akanjs/client/native";

export type PurchaseProductType = "consumable" | "nonConsumable" | "subscription";

export interface PurchaseProductInfo {
  id: string;
  type: PurchaseProductType;
}

//* What the verification server (another repo) reads under `data`: iOS sends the transaction's JWS alone (App Store
//* Server API, no appReceipt and no accountId), Android the purchase token with its package name (Play Developer API).
export interface BillingVerification {
  platform: "apple" | "google";
  packageName: string;
  productId: string;
  receipt: string;
  transactionId: string;
}

export type PurchaseCallback = (transaction: IapTransaction, verified: unknown) => void | Promise<void>;

export interface NativePurchaseOptions {
  productInfo: PurchaseProductInfo[];
  /** The verification server's origin; it answers `POST <url>/billing/verifyBilling`. */
  url: string;
  onPay?: PurchaseCallback;
  onSubscribe?: PurchaseCallback;
}

export type SettleResult = "finished" | "unverified" | "skipped";

/** One transaction's way from the store to the app: verified by the server, handed to the app, then finished. */
export class NativePurchase {
  //? A transaction can reach the page twice at launch (getUnfinished and a "transaction" event), and crediting it twice
  //? is a real loss; every hook on the page shares the ids already taken.
  static readonly #claimed = new Set<string>();

  constructor(readonly options: NativePurchaseOptions) {}

  //? An unknown product is acknowledged, never consumed: consuming what the person owns for good would take it away.
  typeOf(productId: string): PurchaseProductType {
    return this.options.productInfo.find(({ id }) => id === productId)?.type ?? "nonConsumable";
  }

  async verificationOf({ id, productId, verification }: IapTransaction): Promise<BillingVerification | null> {
    if (verification.jws)
      return {
        platform: "apple",
        packageName: (await app.getInfo()).id,
        productId,
        receipt: verification.jws,
        transactionId: id,
      };
    if (verification.purchaseToken)
      return {
        platform: "google",
        packageName: verification.packageName ?? (await app.getInfo()).id,
        productId,
        receipt: verification.purchaseToken,
        transactionId: verification.orderId ?? id,
      };
    return null;
  }

  async verify(transaction: IapTransaction): Promise<{ ok: true; body: unknown } | { ok: false }> {
    const data = await this.verificationOf(transaction);
    if (!data) return { ok: false };
    const res = await fetch(`${this.options.url.replace(/\/$/, "")}/billing/verifyBilling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) return { ok: false };
    return { ok: true, body: await res.json().catch(() => null) };
  }

  //? Finished only once the server accepted it and the app took it: an unfinished purchase comes back (iOS at the next
  //? launch, Google refunds it after three days), which is what a refused verification or a failed callback should get.
  async settle(transaction: IapTransaction): Promise<SettleResult> {
    if (transaction.state !== "purchased" || NativePurchase.#claimed.has(transaction.id)) return "skipped";
    NativePurchase.#claimed.add(transaction.id);
    try {
      const verified = await this.verify(transaction);
      if (!verified.ok) {
        NativePurchase.#claimed.delete(transaction.id);
        return "unverified";
      }
      const type = this.typeOf(transaction.productId);
      await (type === "subscription" ? this.options.onSubscribe : this.options.onPay)?.(transaction, verified.body);
      const { iap } = await loadIap();
      await iap.finish({ transactionId: transaction.id, consume: type === "consumable" });
      return "finished";
    } catch (error) {
      NativePurchase.#claimed.delete(transaction.id);
      throw error;
    }
  }
}
