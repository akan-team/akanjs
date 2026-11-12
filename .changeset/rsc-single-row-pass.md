---
"akanjs": patch
---

A client navigation decodes its RSC payload faster. The browser's RSC client used to read each navigation's Flight stream three times before decoding it: once for the redirect guard, once to note which chunks the navigation names, and once to watch for a server error. A partial navigation's patch did the same, with its redirect and error check in place of the redirect guard. Each now reads the stream once, with every check on the same row, in the same order. Measured in Bun on payloads of 1.1 and 1.5 MB, a navigation's decode time drops from about 8 and 11.5 ms to about 5 and 7 ms. A page behaves as before.
