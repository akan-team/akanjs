---
"akanjs": patch
---

Intern every framework React context on `globalThis`, so an override or a provider value cannot be lost to bundle
chunking.

An akan build inlines each reachable module into every client chunk that reaches it — `client/sharedContext.ts`
itself lands in two chunks of this repo's docs app — and a React context is identified by object identity. A
Provider mounted from one copy is invisible to a consumer holding another, which reads the context default
instead, silently.

`UiOverrideContext` was a plain `createContext`, so a route's `_overrides.tsx` bound its slots in the chunk
holding the generated provider while overridable components in other chunks kept rendering the framework default.
Nothing threw, and only *some* slots were affected — which reads like a bug in the app's own component, not in
the framework. The same shape had already cost a zone agent every tool its screen declared.

All ten of the framework's contexts now go through `sharedContext`, which is exported from `akanjs/client` so an
app or lib can make its own the same way. A test fails if anything under `client/` or `ui/` calls `createContext`
directly: the plain call works in the monorepo, where there is one copy of every module, and breaks only once
bundled — so using the feature cannot catch it.
