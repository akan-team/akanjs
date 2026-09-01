---
"akanjs": patch
---

Keep a projected field at its declared type instead of guessing it from the value.

Reading with a `select` — which is also every read of a model that carries a `field.secret`, since those force the
projection path — decoded each column by looking at the string it came back as: a value starting with `{` or `[`
was `JSON.parse`d, everything else passed through. That is a guess about the field's type made from its data, so
the same `field(String)` answered as a string most of the time and as an object whenever a caller happened to
store JSON in it. `genImage.prompt` is `field.secret(String)`, so an agent-written prompt that was valid JSON
came back as an object and went out to the provider as one.

The cause is `json_extract`, which unwraps a JSON scalar into a SQL value and so erases the difference between
the string `'{"a":1}'` and the object it spells — and returns `0`/`1` for a boolean, which the same path handed
back as a number. Projection now selects with `->`, whose result is the value's JSON *text*, and parses that: the
type comes from what was stored rather than from what it looks like. Postgres already returned typed jsonb and is
left alone; only the heuristic that ran after it is gone.

The non-projection read path was never affected — it decodes against `FIELD_META` — so this only changes reads
that named a `select` or touched a model with a hidden or secret field.
