---
"akanjs": minor
---

feat(constant): remove a relation's target with its owner via `cascade: "remove"`

A relation field can now take its target down with it: `image: field(File, { cascade: "remove" })`, arrays
included. The removal runs through the **target's service**, so the target's own `_postRemove` runs with it —
that is how removing a model also deletes the file's stored blob or object, with no extra wiring in the owning
module.

Only a relation accepts the option. A `String`, an `ID`, a scalar, and a nested array each fail while the class
is being built, naming the field: none of them points at a document the framework could remove.

Target services resolve lazily, at removal time, so a cascade adds no boot-order edge between two services and a
cascade cycle cannot fail the boot. They resolve *before* the parent is touched, so a model cascading into a
module the app never mounted fails with nothing half-removed.

Two limits worth knowing. Nothing checks whether another document still references the same target, so declaring
`cascade` asserts that the field owns its target exclusively. And query-level removal (`deleteManyByQuery` /
`updateManyByQuery`) stamps `removedAt` in one atomic update that fires no hooks and therefore no cascade —
remove documents one at a time when they cascade.
