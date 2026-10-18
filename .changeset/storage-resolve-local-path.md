---
"akanjs": minor
---

`StorageAdaptor` gains an optional `resolveLocalPath(path, access?)`, and `BlobStorage` implements it: the absolute disk path of a stored file, picked from `root` / `privateRoot` the way the adaptor writes (with `access`) and reads (by the `private/` prefix), or `null` for a key it refuses: one that is rooted, holds a NUL, or leaves that root. Refuse such a key (answer 404) and never fall back to `readData()` for it; fall back only when the adaptor has no `resolveLocalPath` (object storage). A key that comes from a request passes `access: "public"`, since without it a `private/` key resolves under the private root. An app serving or processing stored files no longer casts the role to reach its internals; an object-storage adaptor leaves the method out.
