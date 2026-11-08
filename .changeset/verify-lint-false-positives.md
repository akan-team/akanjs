---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan verify` now fixes or explains three lint failures that were costly to resolve by hand.

- **A daisyUI component class your own CSS defines is no longer refused.**
  - `no-daisyui-legacy-class` reports a component name such as `stat-value` or `card-body` as a warning, since the rule cannot read the app's CSS. `akan verify` drops the warning when a stylesheet in the app or a lib defines that class, as a selector or an `@utility`.
  - A dropped daisyUI colour slot such as `bg-base-100` is still an error. In a string that carries both, the colour-slot error is reported first, so the warning cannot hide it.
- **`akan verify` renames `#private` methods in `*.{constant,document,service,store}.ts`.**
  - `#name()` becomes `private name()`, and each call or other reference to it is renamed to match.
  - A method is left to the diagnostic when its class already has a member with that name, or when a `#name in obj` check reads it.
  - `#private` fields are not touched. A call on one, such as `this.#cache.get(key)`, is no longer reported as a private method call.
  - The rule no longer suggests an underscore prefix: a service runs `_preCreate`-style names as lifecycle hooks.
  - The rule's own rewrite is removed. Under `--unsafe` it renamed a `#field` where it was called but not where it was declared.
- **A raw `Error` in an `srvkit/` adapter names its fix.** `akan verify` prints the `Err` import path from that file, and where the key goes: the app's or lib's own service dictionary, `lib/_<name>/<name>.dictionary.ts`, as `<name>.error.<key>`.
