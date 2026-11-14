---
"akanjs": patch
---

During a server render, a `fetch.*` query shares a request only with calls that end up with the same `timeout` and `retry`: the call's own, or else its endpoint's timeout and its client's (`clone({ retry })`, `setTimeout`). Before, the render shared one request between every call with the same endpoint, arguments and credential, from any client, so the first call's deadline and retry policy applied to all of them. A page's `fetch.isMemoOpen({ timeout: 3_000 })` after a layout's `fetch.isMemoOpen()` waited as long as the layout's call did, up to the client's 30 s default, and a page's `fetch.clone({ retry: { attempts: 4 } })` call ran without retries. Calls that pass no options still share one request per render, as before. The browser's in-flight sharing keys the same way, so a call naming `retry: false` (the default) now joins one that names none.
