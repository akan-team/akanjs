---
"akanjs": patch
---

Internal: `DatabaseResolver.resolveDatabase` composes each model's adaptor from named helpers in `server/resolver/` (`modelSchema.ts`, `databaseModelInstance.ts`, `modelFacade.ts`, `modelLoaders.ts`, `timedQuery.ts`) instead of one 381-line method. Schemas, indexes, the model facade, loaders, save listeners, sort and paging options and their errors are unchanged, and `DatabaseResolver` keeps the same members.
