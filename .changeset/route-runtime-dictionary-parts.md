---
"akanjs": minor
"@akanjs/devkit": minor
---

Under `clientRuntime: "route"`, a page loads the dictionary texts it can show rather than every module's. With `"all"`, the default, the dictionary files are byte for byte what they were; its bundles are not, since the page's runtime entry carries the loader, which changes nothing a page shows.

- **What a route can show.** `akan build` and the development server read the keys each route's client modules name: a written key, a template whose module name is written, and a key picked from a table or a typed union the file holds. To those they add the models, scalars and enums whose labels and options the framework's lists, views, forms and remove dialogs build at run time, reached through the module pieces the route loads, and `base`. A route with a key the build cannot follow, such as one read from data, loads the whole page dictionary, and `akan build` warns with its file, line and reason. A route that renders a `Signal` or `Constant` component loads the whole page dictionary too. Server components need nothing: their texts arrive rendered.
- **Files.** Each language's dictionary is packed into files by module, sized on the default language, so that a route loads at most four of them besides the API description file. Each file is written to `/_akan/dict` with the table naming the file of every module. A route whose client components name an endpoint's description or argument key loads the API description file with them.
- **Loading.** A server-rendered page preloads its route's files and merges them before hydration; a client navigation merges the next route's files before the new page commits; a language switch loads that language's files. Each file is requested once per language, and a file that fails is tried again.
- **Safety net.** A key of a module the route's files leave out loads that module's file, and the page renders again once it merges, so the key shows only until then. A toast from `msg`, an action error or an agent message waits for its text rather than showing the key. Development logs the first such key of each module once; production never throws.
- **Development.** `akan start` writes one file per module and loads what each route's build counted, so saving a `*.dictionary.ts` file updates the page as in production. The save restarts the backend, and a page open meanwhile now takes the new texts without a reload, in either mode: `RenderState.dictionaryStamp` names the dictionary files the backend serves, and the development socket's greeting carries it.
- **Unchanged.** The server, MCP and the single-file CSR build that native apps load keep the whole dictionary inline.
- **Size.** In the framework's sample apps, the English dictionary a first visit downloads drops from 4.9 KB (brotli) to 2.5 KB on the median route of `minimal`, and from 5.0 KB to 4.0 KB on `akan`, in one request on the median route and at most two. The loader adds about 1.4 KB to every route's JavaScript.
- `akan build` prints one line per language: `Dictionary en: first visit 2.5KB / 2.5KB / 3.0KB brotli on the lightest / median / largest route (whole 5.0KB), API descriptions 846B where shown`.
- `Translator.ready(lang, key)` answers `null` when the key's module is loaded, or a promise settling once it is. `DictionaryAssetBuilder.buildAll` in `@akanjs/devkit` takes `{ routes, everyGroupAlone }` beside `{ splitApi }`.

**Upgrading.**

Nothing to do under `"all"`. Under `"route"`, a client component whose key the build cannot follow makes its route load the whole dictionary, and `akan build` names it: writing the key out, or picking it from an object or union in the same file, lets the route load only its own files. A text shown once outside React, such as your own toast that calls `Translator.translateByLocale`, can wait on `Translator.ready(lang, key)` first, so a late module's text is not shown as its key.
