---
"akanjs": patch
---

A cascade removes each document once. When two `removeRef` fields, or one array, held the same id (one file used as the banner for two locales), the cascade removed it twice. The second removal found no live row and failed with a 500, so the fields after it were never reached and their files stayed behind. A document that an earlier step of the same cascade already removed, through `removeRef` or `removeWith`, is now skipped too.
