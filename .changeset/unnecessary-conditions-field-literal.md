---
"@akanjs/devkit": patch
---

fix(lint): `noUnnecessaryConditions` is off in the base Biome config again

Biome reads a class field initialised with a literal as that literal for good: `#isBusy = false` stays `false` however many methods assign it, so `if (this.#isBusy)` gets "This condition is always falsy" and `if (!this.#hasFeeder)` "always truthy". Private, public and static fields, and boolean, number and string literals, all read this way; an explicit annotation (`#isBusy: boolean = false`) does not. It is biomejs/biome#11174, open since 2.5.6 and still there in 2.5.15 and 2.6.8, so the 2.5.15 bump that fixed the `RegExp.exec` misreading did not make the rule safe to show. In this repository 174 of its 607 warnings are checks on such a field.

`akan verify` prints the warning to agents, and the fix it suggests is to delete a guard that is live. So the base config turns the rule off, as it was from 3.3.0-rc.38 to rc.45. A workspace that wants it sets `"noUnnecessaryConditions": "warn"` under `linter.rules.suspicious` in its own `biome.json`; this repository's does. A test pins the misreading, so the rule can come back when Biome fixes it.
