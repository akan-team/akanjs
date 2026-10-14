---
"akanjs": patch
---

`Binary.toBase64(bytes)` and `Binary.fromBase64(text)` from `akanjs/base` are public: the codec `Binary` reads and writes its wire form with, on `Buffer` where the runtime has one and on `btoa`/`atob` in a browser bundle. The MCP App view's downloads, `useCamera` and the agent chat's image attachments use it instead of their own copies.
