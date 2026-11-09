---
"akanjs": patch
---

A query takes `signal` in its `FetchPolicy`, joined with its deadline: an abort rejects the call with the signal's reason, stops the request, and ends the retries, including one waiting between tries. A signal from `AbortSignal.timeout` rejects with the slow-server error (`base.error.gatewayTimeout`, 408), as the query's own deadline does. A mutation ignores it, since one already sent may have run.

A slice's list loads (`init`, `refresh`, `setPage`, `setLimit`, `setSort`, `setQueryArgs`, `loadMore`) abort the request a newer load of the same slice supersedes, instead of letting it run to the end and dropping its answer. The superseded load writes nothing and shows no error, and so does one aborted by a `signal` its caller passed. A store action that rejects with an abort no longer shows an error toast.
