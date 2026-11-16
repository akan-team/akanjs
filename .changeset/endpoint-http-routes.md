---
"akanjs": minor
---

`SignalSerializer.httpRoutesOf(EndpointClass, apiPrefix?)` from `akanjs/server` lists the HTTP routes an endpoint class declares: each query and mutation's `key`, `method` and `path`, the path being the one the route table mounts, with `apiPrefix` joined unless the endpoint opts out of the global prefix. It reads the class's declarations alone, so a test can check an endpoint's routes without booting an app or importing a file `akanjs/server` does not publish.
