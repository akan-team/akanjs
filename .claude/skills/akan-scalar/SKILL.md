---
name: akan-scalar
description: "Create an embedded value object (scalar) under lib/__scalar/, or add a relation field to another model — including which cascade direction is which."
---

<!-- akan:generated -->

# Akan scalars and relations

## Scalars

A scalar is an embedded value object with no collection of its own. It lives in `lib/__scalar/<name>/`, is
composed into models with `scalar(...)`, and its dictionary is a `scalarDictionary`. Create one with the
`create-scalar` workflow; its UI surface is limited to `<Scalar>.Template.tsx` and `<Scalar>.Unit.tsx`.

## Relations

A reference to another model is `field(Model)`, or `field([Model])` for many. Files and images are a
relation to the `File` model — `image: field(File).optional()` — never an `Upload` field; `Upload` is a
signal-body primitive only. The store then generates `upload<Field>On<Model>(fileList)` for you.

**Hydrated vs raw.** A server query returns a hydrated `cnst.<Model>` instance with `set` / `save` /
`refresh`. A client `fetch` result is raw plain data with the functions stripped. Code that works in a
service and fails in a store is usually this.

**A model's `Date` fields are prototype accessors, not own properties.** `user.createdAt` is a `Dayjs` built
on first read, so `Object.keys(user)` and `{ ...user }` do **not** include it, while `"createdAt" in user`,
`JSON.stringify(user)` and `plainFieldsOf(user)` do. To copy a model write `new cnst.X().set(user)`, never a
spread.

## Cascade — the value names the direction, and getting it wrong loses data

The two actions sit on the same field shape, so `cascade` never means "related". It means one of exactly
these:

- `removeRef` — *when I am removed, remove what this field points at.* Declared on the relation the owner
  holds: `image: field(File, { cascade: "removeRef" })`.
- `removeWith` — *when what this field points at is removed, remove me.* Declared on the child's own
  reference to its owner, so the owner never learns about its children.

Nothing checks whether another document still references the same target, and `File` in particular is
deduped by `origin`, so two parents can share one row. Removal is soft, but the storage delete a
`_postRemove` performs is not — a cascade is not restorable.

Query-level removes fire no hooks and therefore no cascade: `removeManyByQuery`, the generated
`remove<Filter>`, and the facade's `removeById`. Remove one document at a time when it cascades.

## Field types

Import `Int`, `Float`, `ID`, `Any`, `Binary`, `Upload`, `enumOf` and `dayjs` from `akanjs/base`. `String`,
`Boolean` and `Date` are the globals. **`Number` is not a field type** — use `Int` or `Float`. There is no
JSON scalar; use `Any`. `Binary` is wire bytes and is never a model field.

Full detail: `get_guideline` with `scalarModule`, `scalarConstant`, `fieldRule`, or `queryRule`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-scalar/references/scalarModule.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-scalar/references/scalarConstant.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-scalar/references/scalarDictionary.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
