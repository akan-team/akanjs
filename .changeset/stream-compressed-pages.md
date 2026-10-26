---
"akanjs": patch
---

Server-rendered HTML and RSC flight responses are now compressed with brotli, or gzip for a client that takes only gzip, as they stream. The shell still reaches the browser before the render ends, and a client that disconnects still cancels the render. Before, only JSON was compressed, so a page went out at full size; the akanjs.com home page drops from 444 KB to about 48 KB. Behind the gateway each replica compresses for the client's `Accept-Encoding` and the gateway relays its bytes, compressing only what a replica left as is. A page compressed as it streams carries a weak `ETag` and no `Content-Length`, and `AKAN_HTTP_COMPRESS=0` still turns compression off.

The `Clipboard` button from `akanjs/ui` now has an accessible name, `base.copy` ("Copy" / "복사"), so a screen reader no longer announces it as an unlabeled button.

A server-rendered page now loads less client JavaScript. On the akanjs.com home page, the client components and their chunks went from 403 KB to 219 KB before compression:
- `akanjs/common` and `tailwind-merge` come from the import map once, instead of being bundled again into each page's chunks.
- Recipes build on `tailwind-variants/lite` and merge once through `cn`, with the same output.
- A server-rendered page no longer loads react-spring or the native plugins.

`akanjs/ui` exports `SelectLanguage`, `ThemeToggle` and `DevModeToggle` by name. In a `"use client"` file, import them that way: `System.ThemeToggle` there bundles the whole app shell. `akanjs/client` now also exports `isNativeApp`, `isNativeShell`, `nativePlatform`, `desktopPlatform` and `openExternalUrl`.

In the browser, a Korean `RecentTime` or `dayjs().locale("ko")` no longer falls back to English after hydration. The `ko` locale is now registered on the dayjs instance that `akanjs/base` exports.

A font path in `rootLayout().fonts([...])` now takes `preload: false`. That weight loads when text first uses it, instead of competing with the page for bandwidth. The akanjs.com home page now preloads 3 Pretendard weights instead of 7.

The WebSocket now opens at a page's first subscribe or message instead of at load, so a page that never uses it opens no socket. `.wsConnect(true)` on the root layout still connects at load, and so does `.reconnect()`, whose overlay learns of a restart through the socket. `.wsConnect(false)` still waits for `fetch.instance.connect()`. `fetch.instance.connectOnUse()` is the new mode.

A page in the HTML result cache now keeps its brotli and gzip bytes, made once when the page is stored, so a cache hit sends them instead of compressing the page again. Cache hits on the akanjs.com home page went from 4,500 to 38,800 requests a second (one process, 32 concurrent clients). `AKAN_HTML_RESULT_CACHE_MAX_BYTES` now counts those bytes too.

A file from `public/` is now served with `stale-while-revalidate=86400` beside its 5-minute `max-age`, so a repeat view past those 5 minutes paints from the browser's copy while the browser revalidates it in the background.

A server-rendered page no longer carries its locale's dictionary in the RSC flight. A build now writes one module per locale, `/_akan/dict/<lang>-<hash>.js`, served immutable and precompressed, with any key a locale lacks taken from the default locale. The page preloads its locale's module and hydrates once that module has loaded. A navigation into another locale loads that locale's module before it commits. The browser now fetches each locale once per build, instead of again with every page and navigation. On akanjs.com, an RSC navigation drops from 22.9 KB to 16.8 KB, and the home page from 46.2 KB to 39.7 KB. `System.Provider` no longer takes a `dictionary` prop; only Akan's generated root layout passed it.

`/_akan/styles/` and `/_akan/fonts/` now serve files only from the build's own `styles/` and `fonts/` folders.

`fetch.ws` listeners on `"connect"` and `"disconnect"` now fire, so the `.reconnect()` overlay shows when the socket drops. A server-rendered page's client components now read their own request's locale and path while other requests render, and a request's `x-locale` header counts only when it names one of the app's locales.
