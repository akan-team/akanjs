---
"akanjs": patch
---

Internal: `FetchClient`'s stateless helpers leave the class for module functions in `fetch/client/signalCatalog.ts` (signal merging, guard and helper facts, argument serializers and return parsers) and `fetch/client/requestScope.ts` (origins, socket URLs, query cache keys, deep copies), and its types move to `fetch/client/fetchClientTypes.ts`. Queries, mutations, rooms, messages and the bridge behave as before, the shared fetch chunk does not grow, and `FetchClient` and its exported types are unchanged.
