---
"@akanjs/language": patch
---

Internal: `createFactReader` in `moduleFacts.ts` is composed from one reader per fact family (`syntaxReaderOf`, `sourceReaderOf`, `signalKeyReaderOf`, `jobKeyReaderOf`, `serviceReaderOf`, `constantReaderOf`) instead of one 451-line closure. The facts it reads and the `createFactReader` and `AkanFactReader` signatures are unchanged.
