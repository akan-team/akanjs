---
"@akanjs/cli": patch
---

perf(build): stop shipping one dictionary copy per lib in the client bundle

`lib/useClient.ts` inlined the full dictionary through a Bun macro in every app *and* every lib. Because
`lib/dict.ts` is cumulative — the generator writes `makeDictionary(<libs...>, { ownModules })`, so a scope's
dictionary is the union of its lib deps' plus its own — an app that mounts `util` and `shared` bundled the same
strings three times over. Measured on this workspace: util 17,408B + shared 111,756B + app 111,864B = 241,028B of
dictionary in a CSR build, of which only the app's 111,864B is unique. The other 129KB was pure duplication.

The lib copies were never even the ones in use. `registerClientRuntime` returns early for a `lib` scope once an
`app` scope has registered (`clientRuntime.ts`), so the app's runtime always wins regardless of module evaluation
order, and every lib payload was executed and thrown away.

Libs now pass `{}`. Nothing else changes, because `Translator` state is global
(`globalThis.__AKAN_TRANSLATOR_STATE__`): the constructor only seeds the shared map, and `l()` reads it through
`Translator.translateByLocale`, so a lib resolves keys the app seeded. This is not a new code path — SSR builds
already pass `{}` from every `useClient.ts` (`clientEntriesBundler` defines `AKAN_PUBLIC_RENDER_ENV` as `"ssr"`)
and rely on `SSR.tsx` calling `Translator.replace`. CSR now behaves the same way.

**Only the dictionary macro moved; `getSerializedSignal()` stays in libs.** `store()` consumes its signal
eagerly at class-definition time — it reads `serializedSignal.slice` to generate slice state and actions, and
`signal.fetch` to build form setters — and `store(sig.banner, …)` sits at module top level. Resolving `sig`
lazily would throw whenever a lib store evaluated before the app registered its runtime, which RSC's
per-`"use client"` entry splitting cannot guarantee. That leaves ~17KB of signal duplication per app in place.

Verified by building `apps/akan` before and after: the CSR artifact drops 18,408B and the util dictionary marker
goes from two copies to one. `apps/akan` only depends on `util`; a `util` + `shared` + app chain saves ~129KB.
Lib test suites are unaffected — `akan test <lib>` loads `@libs/<lib>/server`, which exports `fetch` from
`lib/sig.ts` and never evaluates `useClient.ts`.

Run `akan sync` on each app and lib to regenerate `lib/useClient.ts`.
