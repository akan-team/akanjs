---
"akanjs": patch
---

Resolve a dictionary key whose enum value contains a dot, so `l("llmModel.gpt-5.6-terra")` returns its label
instead of the key itself.

Enum entries are stored under the value verbatim — `llmModel["gpt-5.6-terra"]` is one object key — but every
reader went through `pathGet`, which splits the whole key on `.` unconditionally. A value carrying a dot was read
as `llmModel → gpt-5 → 6-terra`, so it missed: `l()` and `l._()` rendered the raw key on screen (enum labels in
`Field` selects, the constant and signal doc pages), and `DictionaryLookup` returned `undefined`, dropping the
description from the MCP catalogue and the OpenAPI document. `<value>.desc` missed the same way. Nothing warned,
because `TransMessage` builds the key union as `` `${refName}.${value}` `` and typechecks it fine.

The three readers now use `pathGetLoose`, a new `akanjs/common` export that tries joined prefixes when a plain
segment walk finds nothing. It tries the shortest prefix first, so every key that resolved before resolves to the
same node — only keys that used to fall through to the fallback are newly found.
