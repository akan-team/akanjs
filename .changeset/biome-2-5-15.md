---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

chore(lint): Biome 2.5.15, and `noUnnecessaryConditions` is `warn` again in the base config

Biome 2.5.14 read `RegExp.prototype.exec` as never returning null, so `/…/.exec(url)?.[1]` got "Unnecessary optional chaining" and `match ? … : …` got "This condition is always truthy" (biomejs/biome#11278, fixed in 2.5.15). A new workspace now pins `@biomejs/biome` 2.5.15 and its `biome.json` names the 2.5.15 schema, and the base config keeps the rule at `warn` as in 3.2.0. An existing workspace gets the fix by setting `@biomejs/biome` to 2.5.15 in its root `package.json` and the `$schema` in `biome.json` to `https://biomejs.dev/schemas/2.5.15/schema.json`.

2.5.15 also knows the global `Array` type, so `useArraySortCompare` (on at `warn` through the base config's `types` domain) now reports a `.sort()` or `.toSorted()` with no compare function on any array, `Object.keys(…).sort()` included. `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` keeps the order the default sort gives a string array.
