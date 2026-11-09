---
"akanjs": patch
---

A navigation that a newer one overtakes before its page commits now aborts its `/__rsc` request, so the server stops rendering it and the browser stops reading its stream. Before, it ran to the end and was only kept from committing. A refresh, a shallow push and a move back or forward overtake it the same way. A page that has already committed is never cut, so the Suspense content it still streams keeps arriving while the next navigation loads.
