---
"akanjs": minor
---

A list no longer keeps rows from before a write when the navigation cache replays its page. `Load.Units` refetches rows it seeded from a replayed page, since a cached route is replayed with no TTL and no live room kept those rows current. A live event that arrives while a slice refetches still marks the slice stale, though it is not applied, and the refetch dates its rows from when the request started, so a write it may have missed is read again on the next mount. A new generated `invalidate<Model>()` marks every slice of a model stale without a request, for a custom mutation whose changed rows the store never received. It replaces writing `<model>StaleAt<Suffix>` keys by hand.

Upgrade note: a page reached through the navigation cache now issues one list request per `Load.Units` whose store held other query arguments, and the reload overlay shows while that request runs. Pass `loading={null}` to hide the overlay.
