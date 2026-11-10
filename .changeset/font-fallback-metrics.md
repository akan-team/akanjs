---
"@akanjs/devkit": patch
---

A font declared on a root layout now gets its metric-adjusted fallback faces: `@font-face` rules named `"<font> fallback"` that draw a local system font with `size-adjust`, `ascent-override` and `descent-override` matched to the web font. The variable `--font-<name>` already named that family, but the build never wrote it, because fontaine's `readMetrics` takes a URL and returned nothing for the file path it was given. While a web font loaded (`font-display: swap`), text drew in the browser's default font, usually a serif, and moved when the web font arrived. The metrics are read from the source font, not the subset, so a subset without Latin letters (`subsets: ["ks-x-1001"]`, or only `subsetText`) still sizes the fallback correctly. A font whose metrics cannot be read keeps its face and gets no fallback, as before. Set `adjustFontFallback: false` on a font to keep the old output. Cached font output from `akan start` is regenerated once.
