---
"akanjs": patch
---

- A `q.raw()` or `q.search()` condition compiles only when `q` built it; an object of the same shape, from JSON or a spread copy, is refused with an error naming `q.raw()`/`q.search()`.
- An open (`Any`) request value is remembered by `InputParser`. A query refuses a condition read out of one: a combinator node, or an operator object such as `{ ne: ... }` or an operator node (`{ kind: "op", ... }`) at a field. The same shorthand written in code works as before. An `Any` value shaped exactly like `{ kind: "raw", sql, params }` is refused as a request value (400).
- A combinator (`q.all`/`q.any`/`q.not`) or a `q.raw()`/`q.search()` node used as a field's value is refused with an error that shows where it goes, in the SQL compiler and in the in-memory evaluator, instead of recursing.
- A plain object as the value of a single-value field (`String`, `ID`, `Int`, `Float`, `Boolean`, `Date`, or a base column) is refused instead of compiling to an equality that matches nothing.
- Root-slice filter arguments are parsed by `InputParser` against their declared type, enum included, so a value outside an enum is a 400.
- A filter argument declared as `Any` (or `[Any]`) throws when the filter is declared. Declare a primitive, an enum or a scalar instead.
- A list filter argument from the root slice takes at most 1000 items in total; raise it per argument with `.arg(name, [Type], { maxItems })`.
- Filter and sort keys are looked up as the filter's own keys only, so `constructor`, `__proto__` and similar names are unknown keys (400).
- `q.search()` text is refused past 32 terms or 1000 characters (400); raise either with `database.search.maxTerms` / `database.search.maxLength`.
- `BlobStorage` read, write, copy, delete and listing methods resolve every key under their root and refuse one that leaves it.
- `agent.error.llmRequestFailed` now carries `provider` and `status` only; the provider's own sentence goes to the server log at `warn`.
- The Postgres JSON path literal double-quotes a key that contains `,`, `{`, `}`, `"` or `\`, has leading or trailing whitespace, is empty, or is `NULL`. Other keys compile to the same SQL as before.
