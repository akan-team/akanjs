import { definePlugin } from "../../../packages/core/src/index.ts";
import { usePluginEvent } from "../../../packages/react/src/index.ts";

// In-app purchase (akanjs readiness O6-3): StoreKit 2 on iOS, the Play Billing Library on Android
// (the pinned, opt-in Billing module: native/android/maven.lock.json). The web and desktops have none
// (UNSUPPORTED).
//
// The flow: getProducts → purchase → send `transaction.verification` to your server → finish (consume
// a consumable, else acknowledge). A purchase that is not finished comes back: iOS delivers it again as
// a "transaction" event at the next launch, Google refunds it after three days. Transactions that do not
// answer a purchase() call (Ask to Buy approvals, pending payments that complete, renewals, refunds,
// purchases on another device, promo codes) arrive as "transaction" events; the ones that arrive before
// the page listens are kept for the first listener. At startup, getUnfinished() lists what still needs
// verifying and finishing.

/**
 * iOS knows the kind; Google Play only knows one-time products and subscriptions ("oneTime": whether it
 * is consumed is the app's decision, made at finish()).
 */
export type IapProductType = "consumable" | "nonConsumable" | "subscription" | "nonRenewingSubscription" | "oneTime";

export type IapPeriodUnit = "day" | "week" | "month" | "year";

export interface IapPeriod {
  unit: IapPeriodUnit;
  value: number;
}

/** freeTrial: free for `cycles` periods; payAsYouGo: `price` per period for `cycles` periods; payUpFront: `price` once for the whole span; recurring: the regular price, until cancelled. */
export type IapPaymentMode = "freeTrial" | "payAsYouGo" | "payUpFront" | "recurring";

export interface IapPricingPhase {
  displayPrice: string;
  price: number;
  currency: string;
  /** Absent for a one-time price. */
  period?: IapPeriod;
  /** How many periods the phase lasts (0 for recurring). */
  cycles: number;
  mode: IapPaymentMode;
}

/** base: a subscription's regular plan or a one-time product's price. The others are discounts. */
export type IapOfferKind = "base" | "introductory" | "promotional" | "winBack" | "oneTime";

export interface IapOffer {
  kind: IapOfferKind;
  /** Android: pass as purchase({ offerToken }) to buy this offer. */
  token?: string;
  /** iOS: the promotional or win-back offer's id. Android: the offer id (absent for a base plan). */
  id?: string;
  /** Android subscriptions: the base plan this offer belongs to. */
  basePlanId?: string;
  /** Android: the tags set in Play Console. */
  tags?: string[];
  phases: IapPricingPhase[];
}

export interface IapProduct {
  id: string;
  type: IapProductType;
  title: string;
  description: string;
  /** The regular price, formatted for the store's locale and currency. */
  displayPrice: string;
  price: number;
  /** ISO 4217. */
  currency: string;
  /** Subscriptions: the regular billing period. */
  subscriptionPeriod?: IapPeriod;
  /** iOS subscriptions: the subscription group. */
  subscriptionGroupId?: string;
  /** iOS subscriptions: whether this account may still take the introductory offer. */
  introOfferEligible?: boolean;
  offers: IapOffer[];
}

export interface IapGetProductsArgs {
  ids: string[];
  /** Android: which kind to look up; both when absent (two queries). iOS ignores it. */
  type?: "inapp" | "subs";
}

export interface IapGetProductsResult {
  products: IapProduct[];
  /** Ids the store did not return (unknown, not approved yet, or not available in this storefront). */
  invalidIds: string[];
}

/** An iOS promotional offer: its id and the compact JWS your server signed (App Store Server Library). */
export interface IapPromotionalOffer {
  offerId: string;
  jws: string;
}

export interface IapPurchaseArgs {
  productId: string;
  /** Android: the offer to buy (IapOffer.token). Default: a subscription's first base plan, a one-time product's first offer. */
  offerToken?: string;
  /** iOS: a promotional offer signed by your server. Introductory offers apply by themselves. */
  promotionalOffer?: IapPromotionalOffer;
  /**
   * Ties the purchase to your user, so the server can check who bought it. iOS: appAccountToken, which
   * must be a UUID. Android: obfuscatedAccountId (at most 64 characters; do not send personal data).
   */
  accountId?: string;
  /** iOS consumables: how many (default 1). */
  quantity?: number;
}

/** purchased: paid, verify and finish it. pending: waiting for payment or approval; it arrives later as a "transaction" event. revoked: refunded or taken away (iOS). */
export type IapTransactionState = "purchased" | "pending" | "revoked";

/** What your server checks. iOS: jws (App Store Server API) or, for old servers, appReceipt. Android: purchaseToken with packageName (Google Play Developer API). */
export interface IapVerification {
  /** iOS: the transaction's signed JWS. */
  jws?: string;
  transactionId?: string;
  originalTransactionId?: string;
  /** iOS: the app receipt (base64), for servers that still use verifyReceipt. Absent when the device has none. */
  appReceipt?: string;
  /** Android. */
  purchaseToken?: string;
  /** Android: absent while pending. */
  orderId?: string;
  packageName?: string;
  /** Android: the purchase JSON and its signature (the app's license key checks it). */
  originalJson?: string;
  signature?: string;
}

export interface IapTransaction {
  /** What finish() takes. iOS: the transaction id. Android: the purchase token. */
  id: string;
  productId: string;
  state: IapTransactionState;
  /** Milliseconds since the epoch. */
  purchaseDate: number;
  quantity: number;
  /** iOS: the first transaction of this subscription or purchase. */
  originalId?: string;
  /** iOS subscriptions. */
  expirationDate?: number;
  /** iOS: when it was refunded or revoked. */
  revocationDate?: number;
  /** Android subscriptions. */
  autoRenewing?: boolean;
  /** Android: already acknowledged or consumed (finished). */
  acknowledged?: boolean;
  /** What purchase() was given as accountId. */
  accountId?: string;
  /** iOS: "Production", "Sandbox" or "Xcode". */
  environment?: string;
  /** iOS: StoreKit's own signature check passed. Your server must still check it. */
  verified?: boolean;
  verification: IapVerification;
}

export type IapPurchaseStatus = "purchased" | "pending";

export interface IapPurchaseResult {
  status: IapPurchaseStatus;
  /** Present when purchased. */
  transaction?: IapTransaction;
}

export interface IapFinishArgs {
  /** IapTransaction.id. */
  transactionId: string;
  /** Android: consume it so it can be bought again (consumables). Otherwise it is acknowledged. iOS finishes either way. */
  consume?: boolean;
}

export interface IapTransactionsResult {
  transactions: IapTransaction[];
}

export interface IapApi {
  /** False when purchases are turned off (iOS Screen Time) or Google Play billing is unavailable. */
  canMakePayments(): Promise<{ value: boolean }>;
  getProducts(args: IapGetProductsArgs): Promise<IapGetProductsResult>;
  /** Shows the store's purchase sheet. Rejects with CANCELLED when the user closes it. */
  purchase(args: IapPurchaseArgs): Promise<IapPurchaseResult>;
  /** After your server verified it: finishes (iOS), consumes or acknowledges (Android) the transaction. */
  finish(args: IapFinishArgs): Promise<void>;
  /** Paid transactions that were not finished yet: verify and finish them at startup. */
  getUnfinished(): Promise<IapTransactionsResult>;
  /** What the user owns now: non-consumables, active subscriptions and (Android) unconsumed one-time products. */
  getEntitlements(): Promise<IapTransactionsResult>;
  /** A "Restore purchases" button: iOS syncs with the App Store (may ask to sign in), then answers like getEntitlements. */
  restore(): Promise<IapTransactionsResult>;
  /** Opens the store's subscription management (iOS sheet, Google Play page). */
  manageSubscriptions(args: { productId?: string }): Promise<void>;
}

export interface IapEvents {
  /** A transaction that is not the answer to a purchase() call. Verify and finish it like one. */
  transaction: IapTransaction;
}

export const iap = definePlugin<IapApi, IapEvents>("iap", {
  methods: [
    "canMakePayments",
    "getProducts",
    "purchase",
    "finish",
    "getUnfinished",
    "getEntitlements",
    "restore",
    "manageSubscriptions",
  ],
  events: ["transaction"],
});

/** Subscribes to transactions for the component's lifetime. */
export function useIapTransaction(handler: (transaction: IapTransaction) => void): void {
  usePluginEvent(iap, "transaction", handler);
}
