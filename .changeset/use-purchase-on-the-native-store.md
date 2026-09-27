---
"akanjs": minor
---

`usePurchase` sells through the native in-app purchase plugin: StoreKit 2 on iOS, Play Billing on Android.

- `usePurchase({ platform, productInfo, url, onPay, onSubscribe })` answers `{ isLoading, products,
  purchaseProduct, restorePurchases }`. `purchaseProduct(product | id, offerToken?)` resolves `"purchased"`,
  `"pending"`, `"cancelled"` or `"unverified"`; a shell on a platform the app does not sell in asks the store
  nothing, and the web sells nothing.
- A transaction is verified by `POST <url>/billing/verifyBilling` with `{ data }`, handed to `onPay` or
  `onSubscribe`, and only then finished (a consumable consumed, anything else acknowledged). A refused
  verification or a failing callback leaves it unfinished, so the store hands it over again; what the last launch
  left unfinished is settled at mount, and one transaction is never credited twice.

**Breaking.** The hook's options and answer changed, and `cordova-plugin-purchase` is no longer a peer. iOS sends
the transaction's JWS alone as `receipt` (no app receipt, no `accountId`), so the verification server has to accept
the App Store Server API form in the same release.
