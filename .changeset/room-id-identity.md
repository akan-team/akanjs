---
"akanjs": patch
---

Two cases where a room id did not match the arguments it was built from are fixed.

- A publish to a pubsub room whose required `String` argument is `""` now reaches its subscribers. The publisher's side spelled that argument as "no value" while the subscriber had joined with the empty string, so the message went to a room nobody was in. The publisher now reads each argument with the argument's own nullability, the way the client serializes it and the server parses it.
- An own `__proto__` key in an `Any` room argument or in a live query is part of the room id. It used to be dropped, so two subscriptions whose arguments differed only by that key shared a room.
