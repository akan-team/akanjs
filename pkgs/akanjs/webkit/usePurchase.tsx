"use client";
import "cordova-plugin-purchase/www/store";

import { app as nativeApp } from "akanjs/client/native";
import { useEffect, useRef, useState } from "react";

export type PlatformType = "android" | "ios" | "all";
export interface ProductType {
  id: string;
  type: keyof typeof CdvPurchase.ProductType;
}

export type CdvProductType = CdvPurchase.ProductType;

/** @deprecated Needs `cordova-plugin-purchase`, a package-wide peer dependency; use `@revenuecat/purchases-capacitor`. */
export const usePurchase = ({
  platform,
  productInfo,
  url,
  onPay,
  onSubscribe,
}: {
  platform: PlatformType;
  productInfo: ProductType[];
  url: string;
  onPay?: (transaction: CdvPurchase.Transaction) => void | Promise<void>;
  onSubscribe?: (transaction: CdvPurchase.Transaction) => void | Promise<void>;
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const billingRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      if (CdvPurchase.store.isReady) {
        setIsLoading(false);

        return;
      }
      const app = await nativeApp.getInfo();
      const storePlatforms =
        platform === "all"
          ? [CdvPurchase.Platform.GOOGLE_PLAY, CdvPurchase.Platform.APPLE_APPSTORE]
          : [platform === "android" ? CdvPurchase.Platform.GOOGLE_PLAY : CdvPurchase.Platform.APPLE_APPSTORE];
      CdvPurchase.store.register(
        storePlatforms.flatMap((storePlatform) =>
          productInfo.map((product) => ({
            id: product.id,
            platform: storePlatform,
            type: CdvPurchase.ProductType[product.type],
          })),
        ),
      );

      await CdvPurchase.store.initialize([
        { platform: CdvPurchase.Platform.APPLE_APPSTORE, options: { needAppReceipt: false } },
        { platform: CdvPurchase.Platform.GOOGLE_PLAY },
      ]);
      await CdvPurchase.store.update();
      await CdvPurchase.store.restorePurchases();
      CdvPurchase.store.validator = (async (
        request: { id: string; transaction: { id: string; purchaseToken: string; appStoreReceipt: string } },
        callback: (result: {
          ok: boolean;
          data: { id: string; latest_receipt: boolean; transaction: CdvPurchase.Transaction };
        }) => void,
      ) => {
        const transactionId = request.transaction.id;
        const transactions = CdvPurchase.store.localTransactions;
        const verifingTransaction = transactions.find((transaction) => transaction.transactionId === transactionId);

        if (verifingTransaction?.state !== "approved") return;

        const billing = await fetch(`${url}/billing/verifyBilling`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: {
              platform: verifingTransaction.platform === CdvPurchase.Platform.GOOGLE_PLAY ? "google" : "apple",
              packageName: app.id,
              productId: verifingTransaction.products[0].id,
              receipt:
                verifingTransaction.platform === CdvPurchase.Platform.GOOGLE_PLAY
                  ? request.transaction.purchaseToken
                  : request.transaction.appStoreReceipt,
              transactionId: verifingTransaction.transactionId,
            },
          }),
        });

        billingRef.current = billing.json();

        callback({
          ok: !!billing,
          data: { id: request.id, latest_receipt: true, transaction: request.transaction } as any,
        });
      }) as any;
      CdvPurchase.store.localReceipts.forEach((receipt) => {
        if (receipt.platform === CdvPurchase.Platform.GOOGLE_PLAY)
          if (receipt.transactions[0].state === CdvPurchase.TransactionState.APPROVED)
            void receipt.transactions[0].verify();
          else void receipt.transactions[0].finish();
      });

      CdvPurchase.store
        .when()
        .approved((transaction) => {
          void transaction.verify();
        })
        .verified((receipt) => {
          void receipt.finish();
        })
        .finished((transaction) => {
          void inAppPurchase(transaction);
        });
      setIsLoading(false);
    };
    void init();
  }, []);
  const purchaseProduct = async (product: CdvPurchase.Product) => {
    await product.getOffer()?.order();
  };

  const restorePurchases = async () => {
    await CdvPurchase.store.restorePurchases();
  };

  const inAppPurchase = async (transaction: CdvPurchase.Transaction) => {
    const product = CdvPurchase.store.get(transaction.products[0].id);
    if (product?.type === "consumable") await onPay?.(transaction);
    else await onSubscribe?.(transaction);
    await transaction.finish();
  };

  return {
    isLoading,
    products: CdvPurchase.store.products,
    purchaseProduct,
    restorePurchases,
  };
};
