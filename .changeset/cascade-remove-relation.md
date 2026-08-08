---
"akanjs": minor
---

feat(constant): take a relation down in either direction with `cascade: "removeRef"` / `"removeWith"`

A relation field can now say which end of it goes away with the other, and the value names the direction because
both actions sit on the same field shape.

`cascade: "removeRef"` is declared on the relation an owner holds — `image: field(File, { cascade: "removeRef" })`,
arrays included — and removes the target when the owner is removed. Only a relation accepts it; a `String`, a bare
`ID`, a scalar, and a nested array each fail while the class is being built, naming the field.

`cascade: "removeWith"` is declared on a child's own reference to its owner and removes the child when that owner
is removed, so the owner never learns its children exist and a lib model can be extended by an app's. It takes a
relation, an id with `ref` (`field(ID, { ref: "agentSession", cascade: "removeWith" })`), or an id with `refPath`
for a polymorphic owner. A `refPath` must name an `enumOf` field: a free-form owner type is unknowable at build
time, so every model's removal would otherwise have to sweep the polymorphic table on the chance it is the owner.
An array, a Map, `ref` together with `refPath`, and a field naming no owner all fail the class build.

The removal runs through the **target's service**, so the target's own `_postRemove` runs with it — that is how
removing a model also deletes a file's stored blob, with no extra wiring in the owning module. When the target
provably carries no removal side effect (no `remove` schema hook, no `_pre`/`_postRemove` of its own or a lib's,
no cascade of its own, no children of its own) one `removeManyByQuery` leaves exactly the rows the per-document
loop would, and the framework takes it. The decision is made per target model and shared by both directions, so
`images: field([File])` stops being an N+1 the moment `File` has no side effect left. The boot log names every
edge and its strategy: adding a `_postRemove` to a target flips it back to one document at a time, and nothing
else would show that.

The plan is sealed once every service is live, so a `listenPost("remove")` registered in `onInit` still counts and
a `removeRef` target the app never mounted fails the boot instead of the first removal. An unmounted `removeWith`
owner fails the boot too; an unmounted `refPath` candidate only warns, since that candidate list spans optional
modules by design.

A `removeWith` declaration creates its own index — `{ removedAt, fk }`, or `{ removedAt, typeKey, fk }` when
polymorphic. Every non-base field lives in the `_doc` JSON column, so without one the lookup scans the table on
every owner removal.

Three limits worth knowing. Nothing checks whether another document still references the same target, so
`removeRef` asserts exclusive ownership. Query-level removal (`removeManyByQuery` / `updateManyByQuery`) stamps
`removedAt` in one atomic update that fires no hooks and therefore no cascade — remove documents one at a time
when they cascade. And reviving an owner does not revive what went with it.
