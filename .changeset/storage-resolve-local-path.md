---
"akanjs": minor
---

`StorageAdaptor` gains an optional `resolveLocalPath(path, access?)`, and `BlobStorage` implements it: the absolute disk path of a stored file, picked from `root` / `privateRoot` the way the adaptor writes (with `access`) and reads (by the `private/` prefix), or `null` for a path that leaves that root. An app serving or processing stored files no longer casts the role to reach its internals; an object-storage adaptor leaves the method out.
