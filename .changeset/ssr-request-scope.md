---
"akanjs": patch
---

Security: a server render reads only its own request. Once the SSR shell had gone out, a boundary React resumed later — a client component streamed in behind a Suspense fallback, or one that suspended on `use()` — rendered outside any request scope, and `cookies()`, `headers()`, `getRequest()` and `getAccount()` fell back to a process-wide stack holding whichever render had started last. Under concurrent traffic that was another visitor's request: their cookies, their session token, their basePath. The same fallback answered any read made outside a request on the server while a page was streaming, so a server-side `fetch.*` from a queue job or a websocket handler could forward that visitor's session. The host now decodes the Flight stream inside the request's scope and renders HTML with React's edge server build, whose scheduler carries that scope (the browser build resumes a boundary from a `MessageChannel` task, which runs with none), and the fallback stack is gone.

The not-found and error documents read their own request too. A route that failed before its first byte rendered its fallback outside the request's scope, so the theme cookie, `x-base-path` and head code could read another request in flight.

Upgrade note: `pushRequestFallback` is no longer exported from `akanjs/fetch`. A read outside every request scope now sees no request — `getRequest()` is `undefined`, `cookies()` and `headers()` are empty — instead of whichever render started last; code that needs one runs inside `requestStorage.run(request, …)`.
