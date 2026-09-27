"use client";
import { AkanNativeError, type IapProduct, type IapTransaction, loadIap, nativePlatform } from "akanjs/client/native";
import { useEffect, useRef, useState } from "react";

import { NativePurchase, type NativePurchaseOptions } from "./nativePurchase";

export type {
  BillingVerification,
  PurchaseCallback,
  PurchaseProductInfo,
  PurchaseProductType,
} from "./nativePurchase";

export type PlatformType = "android" | "ios" | "all";

export type PurchaseResult = "purchased" | "pending" | "cancelled" | "unverified";

interface UsePurchaseOptions extends NativePurchaseOptions {
  /** The stores this app sells in; a native shell on another platform shows no products. */
  platform: PlatformType;
}

/** In-app purchase on the native iap plugin: StoreKit 2 on iOS, Play Billing on Android. The web sells nothing. */
export const usePurchase = ({ platform, ...options }: UsePurchaseOptions) => {
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<IapProduct[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const flow = () => new NativePurchase(optionsRef.current);
  //? A settle that throws leaves the transaction unfinished, so the store hands it over again.
  const settleLater = (transaction: IapTransaction) =>
    void flow()
      .settle(transaction)
      .catch(() => undefined);

  useEffect(() => {
    const current = nativePlatform();
    if (!current || (platform !== "all" && platform !== current)) {
      setIsLoading(false);
      return;
    }
    let active = true;
    let stop: () => void = () => undefined;
    void (async () => {
      const { iap } = await loadIap();
      if (!active) return;
      stop = iap.listen("transaction", settleLater);
      const [{ products }, { transactions }] = await Promise.all([
        iap.getProducts({ ids: optionsRef.current.productInfo.map(({ id }) => id) }),
        iap.getUnfinished(),
      ]);
      if (!active) return;
      setProducts(products);
      for (const transaction of transactions) settleLater(transaction);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
      stop();
    };
  }, []);

  const purchaseProduct = async (product: IapProduct | string, offerToken?: string): Promise<PurchaseResult> => {
    const { iap } = await loadIap();
    try {
      const productId = typeof product === "string" ? product : product.id;
      const { status, transaction } = await iap.purchase({ productId, ...(offerToken ? { offerToken } : {}) });
      if (status === "pending" || !transaction) return "pending";
      const settled = await flow().settle(transaction);
      return settled === "finished" ? "purchased" : settled === "unverified" ? "unverified" : "pending";
    } catch (error) {
      if (AkanNativeError.from(error).code === "CANCELLED") return "cancelled";
      throw error;
    }
  };

  //? What the person owns now; an Android purchase still unacknowledged is verified and finished on the way.
  const restorePurchases = async () => {
    const { iap } = await loadIap();
    const { transactions } = await iap.restore();
    for (const transaction of transactions) if (transaction.acknowledged === false) settleLater(transaction);
    return transactions;
  };

  return { isLoading, products, purchaseProduct, restorePurchases };
};
