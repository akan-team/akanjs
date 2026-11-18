---
"@akanjs/devkit": patch
---

fix(lint): `noUnnecessaryConditions` is off in the base Biome config

Biome 2.5.14 reads `RegExp.prototype.exec` as never returning null, so a workspace got "Unnecessary optional chaining"
on `/…/.exec(url)?.[1]` and "This condition is always truthy" on `match ? … : …`. The fix it offers, `?.` to `.`,
throws on every string that does not match, and `akan verify` printed the warning to agents that then tried to fix
it. A workspace that wants the rule back sets `"noUnnecessaryConditions": "warn"` under `linter.rules.suspicious` in
its own `biome.json`.
