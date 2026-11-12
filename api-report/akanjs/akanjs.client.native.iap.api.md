# `akanjs/client/native/iap`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface IapApi {
    canMakePayments(): Promise<{
        value: boolean;
    }>;
    getProducts(args: IapGetProductsArgs): Promise<IapGetProductsResult>;
    purchase(args: IapPurchaseArgs): Promise<IapPurchaseResult>;
    finish(args: IapFinishArgs): Promise<void>;
    getUnfinished(): Promise<IapTransactionsResult>;
    getEntitlements(): Promise<IapTransactionsResult>;
    restore(): Promise<IapTransactionsResult>;
    manageSubscriptions(args: {
        productId?: string;
    }): Promise<void>;
}

export interface IapEvents {
    transaction: IapTransaction;
}

export interface IapFinishArgs {
    transactionId: string;
    consume?: boolean;
}

export interface IapGetProductsArgs {
    ids: string[];
    type?: "inapp" | "subs";
}

export interface IapGetProductsResult {
    products: IapProduct[];
    invalidIds: string[];
}

export interface IapOffer {
    kind: IapOfferKind;
    token?: string;
    id?: string;
    basePlanId?: string;
    tags?: string[];
    phases: IapPricingPhase[];
}

export type IapOfferKind = "base" | "introductory" | "oneTime" | "promotional" | "winBack";

export type IapPaymentMode = "freeTrial" | "payAsYouGo" | "payUpFront" | "recurring";

export interface IapPeriod {
    unit: IapPeriodUnit;
    value: number;
}

export type IapPeriodUnit = "day" | "month" | "week" | "year";

export interface IapPricingPhase {
    displayPrice: string;
    price: number;
    currency: string;
    period?: IapPeriod;
    cycles: number;
    mode: IapPaymentMode;
}

export interface IapProduct {
    id: string;
    type: IapProductType;
    title: string;
    description: string;
    displayPrice: string;
    price: number;
    currency: string;
    subscriptionPeriod?: IapPeriod;
    subscriptionGroupId?: string;
    introOfferEligible?: boolean;
    offers: IapOffer[];
}

export type IapProductType = "consumable" | "nonConsumable" | "nonRenewingSubscription" | "oneTime" | "subscription";

export interface IapPromotionalOffer {
    offerId: string;
    jws: string;
}

export interface IapPurchaseArgs {
    productId: string;
    offerToken?: string;
    promotionalOffer?: IapPromotionalOffer;
    accountId?: string;
    quantity?: number;
}

export interface IapPurchaseResult {
    status: IapPurchaseStatus;
    transaction?: IapTransaction;
}

export type IapPurchaseStatus = "pending" | "purchased";

export interface IapTransaction {
    id: string;
    productId: string;
    state: IapTransactionState;
    purchaseDate: number;
    quantity: number;
    originalId?: string;
    expirationDate?: number;
    revocationDate?: number;
    autoRenewing?: boolean;
    acknowledged?: boolean;
    accountId?: string;
    environment?: string;
    verified?: boolean;
    verification: IapVerification;
}

export type IapTransactionState = "pending" | "purchased" | "revoked";

export interface IapTransactionsResult {
    transactions: IapTransaction[];
}

export interface IapVerification {
    jws?: string;
    transactionId?: string;
    originalTransactionId?: string;
    appReceipt?: string;
    purchaseToken?: string;
    orderId?: string;
    packageName?: string;
    originalJson?: string;
    signature?: string;
}

export declare const iap: import("akanjs/client/native.ts").Plugin<IapApi, IapEvents>;

export declare function useIapTransaction(handler: (transaction: IapTransaction) => void): void;
```
