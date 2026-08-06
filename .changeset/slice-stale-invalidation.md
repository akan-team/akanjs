---
"akanjs": minor
---

feat(store): invalidate sibling slices on create and refetch them in `Load.Units`

A model with more than one parent is listed by more than one slice, and a create could only ever be spliced
into the slice it was issued from. Creating a `bizDoc` from `bizDocInOrg` left `bizDocListInProject` without
it, and an RSC navigation back to that page replayed a cached payload whose server-stamped
`bizDocInitAtInProject` still satisfied `Load.Units`' cache check — so the new document stayed invisible until
a full reload.

`create<Model>` and `create<Model>InForm` now stamp a new per-slice `<model>StaleAt<Suffix>` on every slice
*except* the one named by `sliceName`. Whether the new document belongs to a sibling slice is a server-side
filter decision, so the siblings are marked for revalidation rather than patched optimistically. `Load.Units`
refetches through `refresh<Model><Suffix>` when its slice's `StaleAt` is newer than its `InitAt`, and a
completed refresh restamps `InitAt` past `StaleAt` to end the stale state. The refetch is skipped while the
list is already loading, which also dedups several `Load.Units` mounted on one slice.

`Load.Units` also takes a `staleTime` prop, in milliseconds, for age-based revalidation independent of any
create: `staleTime={0}` always refetches on mount, `staleTime={30_000}` refetches only when the cached data is
older than 30s. Omitting it leaves the component purely invalidation-driven.

Update and remove are unchanged — they already walk every slice, because a document they touch is one the
cached lists can be searched for by id.
