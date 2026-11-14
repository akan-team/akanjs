---
"akanjs": patch
---

A page stored in the HTML cache is kept as the bytes it streamed, instead of being decoded to text and encoded again before compression. Storing a 600 KB page takes about a fifth of the main-thread time it did, and the stored page and every response from it are unchanged.
