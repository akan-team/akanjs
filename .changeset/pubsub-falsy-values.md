---
"akanjs": patch
---

A pubsub now publishes `0`, `false` and `""`. The publisher dropped any falsy value with a `Failed to serialize data` warning, so a `pubsub(Int)` counting down to zero or a `pubsub(Boolean)` turning off never reached its subscribers. A pubsub declared `{ nullable: true }` (or returning `Any`) now delivers `null` too, and publishing `undefined` to it delivers `null`. On any other pubsub, publishing `null` or `undefined` throws an error naming the pubsub and its non-nullable return, instead of `Invalid Value (Nullable)`.
