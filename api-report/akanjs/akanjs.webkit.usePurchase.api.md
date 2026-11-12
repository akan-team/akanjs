# `akanjs/webkit/usePurchase`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface BillingVerification {
    platform: "apple" | "google";
    packageName: string;
    productId: string;
    receipt: string;
    transactionId: string;
}

export type PlatformType = "all" | "android" | "ios";

export type PurchaseCallback = (transaction: IapTransaction, verified: unknown) => Promise<void> | void;

export interface PurchaseProductInfo {
    id: string;
    type: PurchaseProductType;
}

export type PurchaseProductType = "consumable" | "nonConsumable" | "subscription";

export type PurchaseResult = "cancelled" | "pending" | "purchased" | "unverified";

export declare const usePurchase: ({ platform, ...options }: UsePurchaseOptions) => {
    isLoading: boolean;
    products: IapProduct[];
    purchaseProduct: (product: IapProduct | string, offerToken?: string) => Promise<PurchaseResult>;
    restorePurchases: () => Promise<IapTransaction[]>;
};
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type BillingVerifier = (data: BillingVerification, transaction: IapTransaction) => Promise<unknown>;

interface NativePurchaseOptions {
    productInfo: PurchaseProductInfo[];
    url?: string;
    verify?: BillingVerifier;
    onPay?: PurchaseCallback;
    onSubscribe?: PurchaseCallback;
}

interface UsePurchaseOptions extends NativePurchaseOptions {
    platform: PlatformType;
}
```
