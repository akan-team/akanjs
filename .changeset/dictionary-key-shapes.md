---
"@akanjs/devkit": patch
---

The build reads two more ways of writing a dictionary key, so a route holding one loads the groups it shows instead of the whole page dictionary. A key held in a `const` that may also be `null`, `undefined` or `false` (`const noteKey = denied ? "weather.locationDenied" : null`) is read as the keys written in it. A key read from a table the file made with `.map()` from another table (`stages.map((stage) => ({ ...stage, label: l(stage.key) }))`, then `l(item.key)`) is read as the keys the first table writes; a callback that returns anything the file does not write keeps the route on the whole dictionary, as before.
