---
"akanjs": patch
---

Identical queries a browser tab has in flight at once share one request: same endpoint, arguments, credential, timeout and retry. The caller that started it parses the answer, and the others parse a copy. One caller's abort leaves the request running for the rest, and it stops only when every caller waiting on it has aborted. A server still memoizes a request's queries for the whole render, and outside a request it sends each call.

`FetchPolicy.cache` and `FetchPolicy.partial` are deprecated. Nothing has read them since v2 dropped GraphQL; an endpoint reuses its answer with its own `query(T, { cache })`.
