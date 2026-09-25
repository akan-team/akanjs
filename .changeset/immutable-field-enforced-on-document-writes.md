---
"akanjs": patch
---

Enforce `field(..., { immutable: true })` on the document write path instead of carrying it as decoration.

The option survived the v2 migration as metadata and nothing else. v1 handed it to mongoose, which enforced it;
the SQL document layer that replaced mongoose never picked it up, so the only readers left were the schema doc's
`immutable` pill and the devtools serializer. A field declared immutable was freely overwritten by
`doc.set(...).save()`, by `srv.update(id, patch)`, and by every query-level write — while `akan`'s own docs
promised "생성 후 수정할 수 없습니다".

`writeUpdatedDocument` is now the single gate: it compares each immutable field's prepared value against the row
it loaded and throws when they differ. That one choke point covers the whole document path — `.set()` then
`.save()`, a chain method assigning the field directly, and `update(id, patch)` — because all three land there.
`.set()` itself stays a plain in-memory assign, so the throw arrives at `save()`, where the write actually
happens; gating `.set()` too would have missed direct property assignment and gone silent on documents loaded
through a read query, which carry no snapshot to compare against.

The check runs before the save hooks, so the message names the field the caller changed rather than one a
`_preUpdate` derived from it, and it omits the values — an immutable field may also be `field.secret`.

Query-level writes are deliberately left open, mirroring the way mongoose exempts `bulkWrite`:
`updateOneByQuery` / `updateManyByQuery`, the generated `update<Filter>` / `remove<Filter>`, and
`updateById` / `removeById` compile straight to one SQL statement, fire no hooks, and read no existing row to
compare against. A caller reaching for that path has already stepped outside document semantics. `create` and an
upsert's insert are untouched, which is where an immutable field is meant to be set.

Re-saving an unchanged immutable field is not a change and does not throw, so `doc.save()` after editing anything
else keeps working — including on a row written before the field was declared, which reads back as the field's
default on both sides of the comparison.
