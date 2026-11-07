---
description: Model and scalar shapes in *.constant.ts: the five layers, scalars, defaults and field kinds.
paths:
  - "apps/**/*.constant.ts"
  - "libs/**/*.constant.ts"
---

<!-- akan:generated -->

# Scalar Modeling

- Models use `via` from `akanjs/constant`, all five layers (`Input`, `Object`, `Light<Model>`, `<Model>`,
  `<Model>Insight`). `Int` for counts, `Float` only for decimals, `ID` for references; structured fields over `Any`.
- Import `Int`, `Float`, `ID`, `Any`, `Binary`, `Upload`, `ImageResult`, `enumOf`, `dayjs` from `akanjs/base`;
  `String` / `Boolean` / `Date` are globals. No `JSON` scalar (use `Any`), no `Number`, and `Binary` / `Upload` are
  never fields — a file is `field(File).optional()` / `field([File])`, uploaded by the generated
  `upload<Field>On<Model>` (which `Field.Img` / `Files` and siblings use when handed the generated setter); it marks
  the field in `<model>FormUploading` while the request runs and drops a result whose form was set whole meanwhile
  (or, on a single field, re-picked) — gate a hand-written submit on it.
- Defaults: a literal for scalars, a thunk for anything constructed (`default: () => dayjs()`). Arrays
  `field([T])`; optional `.optional()`.
- **`field.hidden` / `field.secret` read `null` on the client while the type declares them** — guard with `??` or
  `== null`, never `=== undefined` or a default. `field.visual(T)` is rendered but stripped from every agent and MCP
  read. Full contract: `fieldRule`.

- **No `static` on an `XObject` or `LightX` class** — `via()` mixes in their prototypes only; use `XInput` (or a
  scalar), `X`, or `XInsight`.
