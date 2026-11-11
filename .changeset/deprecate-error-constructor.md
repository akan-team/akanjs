---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`setErrorConstructor` on `FetchClient`, `HttpClient` and `WsClient`, `HttpClientOptions.ErrorCls` and `FetchClient.build`'s `Err` option are deprecated. Every dictionary's `Err` is `akanjs/common`'s `Err`, which a restored error already is, so they change nothing. They keep working. A generated `lib/sig.ts` no longer calls `fetch.setErrorConstructor(Err)`, and a generated `lib/useClient.ts` no longer passes `{ Err: pageProto.Err }`; `akan sync` rewrites both. No upgrade step is needed.
