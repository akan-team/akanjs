---
"akanjs": patch
---

The optional `happy-dom` and `@happy-dom/global-registrator` peers now ask for `^21.0.4`. Versions 17.0.0 through 21.0.3 compile a `<script type="module">` import alias into code unchecked, so a page loaded into a happy-dom window could run code on the host (GHSA-834v-8h66-3h79). UI tests register one through `akanjs/test/registerDom`; run `bun update happy-dom @happy-dom/global-registrator` in a workspace that pins an older one.
