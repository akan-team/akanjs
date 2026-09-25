---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(css): fail the build on a stylesheet import that resolves to nothing, and let a lib own its design tokens

Two halves of the same problem, reported together. An `@import` the pipeline could not resolve was allowed to
produce nothing, and a lib had nowhere to declare the colours its own components pin — so the workaround was to
copy one vendor palette into every app's stylesheet, where a single missed import broke that app alone, silently.
Since vocabulary closure (`@theme { --color-*: initial }`) makes a component whose token declaration never
arrived render unstyled rather than wrong, the quiet half is the dangerous one.

**Every specifier is verified, path-shaped ones included.** `@import "./missing.css"` and
`@import "../../../libs/shared/ui/brand.css"` used to be turned into a path without asking whether a file was
there, surfacing later as a bare `ENOENT` that names no importer — or, in the dev server, as one log line while
the previous CSS kept serving. They now raise the same `[css] failed to resolve stylesheet import "…" from …`
error a bare specifier already did, naming the path that was tried.

**A package subpath resolves literally or not at all.** `@import "@libs/shared/ui/brand.css"` fell back to the
package's own `style` entry (`pkg.exports["."].style`, `pkg.style`, `index.css`) when the subpath was not in
`exports` — loading a *different* stylesheet than the author asked for and reporting success. The fallback now
applies only to the bare package name.

**`libs/<lib>/ui/tokens.css` is the one CSS file a lib owns.** Plain `:root` custom properties for colours pinned
by someone else's brand guide — Kakao `#fee500`, Naver `#1ec800` — or by a fixed surface. Every app whose page
graph reaches that lib compiles the file automatically, ordered ahead of the app's own stylesheets so the app
stays the last word on any variable both declare. Nothing is imported by hand and adding an app cannot forget it.
Reference them as `bg-[var(--kakao)]`, which `no-arbitrary-color` allows by design; `@theme` extensions stay in
the app stylesheet, because the colour vocabulary is closed per stylesheet.

**A stylesheet under `page/` that no route imports now warns.** It compiles to nothing and reports success, which
reads exactly like an empty theme — the failure the two fixes above cannot see, because nothing ever asked for
the file.

**An `@import` that resolved, was read, and still contributed nothing now warns twice over.** Custom properties
declared outside `@theme` pass through Tailwind verbatim, so a stylesheet whose every declaration is missing from
the output did not make it in, whatever dropped it — the last shape of this bug that no check upstream of the
output can see. The compiled text is checked per compiled stylesheet, and the written asset is checked again
against the imports of its own base path, because those are two different places a declaration can go missing: a
build that ships a token to the CSR bundle and not to `styles/<base>-<hash>.css` renders unstyled on a
server-rendered page while looking correct in the browser bundle. Each resolution also logs at `verbose` with the
specifier, the importer, the resolved path, and the byte count.

A name that survives only because something else declares it — an app overriding a lib token, which is the
ordering this release introduces — keeps the check quiet: the warning fires only when *no* declaration of the
imported file's own names is present anywhere in the asset.
