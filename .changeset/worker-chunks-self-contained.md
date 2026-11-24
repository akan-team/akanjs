---
"@akanjs/devkit": patch
---

A package's module worker now loads in a production build. Some packages start a worker on one of their own modules: they import it lazily and pass `new URL(import.meta.url)` to `new Worker`. Excalidraw's font subsetting is one. Bun stores its runtime helpers (`__require`, `__toESM`) in a chunk of its own choosing, sometimes a page chunk, so that module's chunk could import page code. A worker has no import map, so its first bare `react` import failed, and it has no `window` for page code that reads one on load. The work then fell back to the main thread, where the page's script policy blocks the `new Function` a WebAssembly glue needs. For Excalidraw, the result was an exported SVG that embedded every font whole. A lazy chunk whose module both reads its own URL and sets a `self` message handler is now rebuilt as its own self-contained file, under the same name. The page still imports it as before, and a worker can now load it.
