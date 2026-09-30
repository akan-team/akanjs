---
"akanjs": minor
---

A push for the page on screen is not shown in front, and `usePurchase` verifies with the app's own function.

- The push plugin's `setForegroundPresentation` takes `except: { key, values }`: a push whose `data[key]` is one of
  `values` is not shown while the app is in front, and still arrives as `received`. The CSR frame keeps it set to
  the page on screen, so the chat room being read does not banner its own messages; `data.url` may spell the page
  with or without the locale and the target's basePath.
- `usePurchase({ verify })` checks a purchase with the app's function instead of `POST <url>/billing/verifyBilling`.
  It gets the normalized proof and the transaction, whose `verification` carries the store's own; what it resolves
  reaches `onPay`/`onSubscribe`, and `null`, `undefined` or `false` refuses. The finish flow is unchanged.
