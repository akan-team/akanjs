---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

feat(lint): `no-init-fetch-in-client` — keep slice hydration on the server

`fetch.init<Model><Suffix>` is not a request, it is a hydration snapshot: `#registerSlice` composes it out of the
slice's list and insight queries and returns a `ServerInit` whose only consumer is the `init` prop of
`Load.Units` / `Load.View`, which seeds the store from it before React renders. `fetch.get<Model>Init<Suffix>` is
the same call returning the payload alone. From a route both resolve before the first byte and the markup ships
populated; from a client component they are two extra round-trips for a shell the browser already painted empty,
landing in a local variable nothing reads — `Load.*` seeds state, so a value held in a client closure reaches
nowhere. Nothing in the framework flagged this, and the mistake reads as an ordinary load.

The fix the message points at is the route: `await fetch.initXInY(...)` in `page/**` and pass the result down as
an `init` prop, or hand the unawaited promise to a `Zone`. The client is not missing the load either — every
slice also generates `st.do.init<Model><Suffix>()`, which runs the same two queries and commits them to state.

The gate is the file, not the call site. `"use client"` is anchored to `JsDirective`, so the same text as an
ordinary string literal or inside a template-literal code sample — both common in docs pages — is not mistaken
for the directive. `*.store.ts` is added by name, being client-only by role while carrying no directive.

The name is matched by shape, a lint rule having no way to know which slices exist. The generated one is `init`
+ `Capitalize<refName>` + `Capitalize<suffix>`, so it always carries two capital-led segments; requiring the
second is what keeps a hand-written `initPayment` / `initSession` endpoint out, and `initializeSomething` was
never at risk since `init` is followed by a lowercase letter there. A custom endpoint spelling the generated
shape exactly — `initPaymentSession`, `get<X>Init<Y>` — is the residue, suppressible with
`// biome-ignore lint/plugin: <reason>`.

`view` / `edit` hydrate the same way but are deliberately unmatched: `edit<X>` is a plausible custom endpoint
name.

A runtime guard was considered instead and rejected: CSR and Capacitor builds render route modules in the
browser (`RootRenderLayer` in `pkgs/akanjs/webkit/bootCsr.tsx` awaits the page's own async render), so
`typeof window !== "undefined"` holds for a perfectly correct page there and nothing at runtime can tell that
apart from a client component calling the same thing after hydration.
