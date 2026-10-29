---
"akanjs": patch
---

A pubsub now publishes `0`, `false` and `""`. The publisher dropped any falsy value with a `Failed to serialize data` warning, so a `pubsub(Int)` counting down to zero or a `pubsub(Boolean)` turning off never reached its subscribers. Only a missing value (`null` or `undefined`) is still dropped.
