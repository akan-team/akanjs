---
"@akanjs/devkit": patch
---

The build reads three more ways of writing a dictionary key, so a route holding one loads the groups it shows instead of the whole page dictionary. A key held in a `const` that may also be `null`, `undefined` or `false` (`const noteKey = denied ? "weather.locationDenied" : null`) is read as the keys written in it. A key read from a table the file made with `.map()` from another table (`stages.map((stage) => ({ ...stage, label: l(stage.key) }))`, then `l(item.key)`) is read as the keys the first table writes. A key picked from a `static` table of a constant class (`l(cnst.RunnerBot.labelKeyOf[botRole])`) is read as the keys that table writes, when the static has no type annotation and is an `as const` object or array of nothing but written strings; any other static, and a `.map()` callback that returns something the file does not write, keep the route on the whole dictionary as before.
