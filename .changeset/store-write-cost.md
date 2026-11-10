---
"akanjs": patch
---

A store write now costs about one copy of the state, whatever else the root holds. Before, every `set` copied the state twice, compared every key, re-read every `search()` value, and walked every persisted key and every model form. That came to 173 µs at 1,740 keys and 364 µs at 3,480. Now `set` works out the changed keys from the patch and copies the state once. It then recomputes only the `search()` values (when `searchParams` changed) and the `computed()` values whose dependencies changed, and syncs only the persisted keys and form drafts the write touched. That is 38 µs at 1,740 keys and 78 µs at 3,480, the cost of the copy itself.

- **One `set` per model write.** `update<Model>`, `update<Model>InForm`, `merge<Model>`, `set<Model>`, `remove<Model>`, `create<Model>` and `create<Model>InForm` now write the model, every slice list that holds the row, and the stale stamps in one `set`. Before, they called `set` once per slice, plus once more. An update at 1,640 keys went from 488 µs to 47 µs.
- **`set<Model>` no longer changes the list it read.** It copies a slice's list before replacing the row, so a reader holding the old state keeps the old row. It also leaves alone a slice list that holds none of the given rows, which used to get a new list on every call.
- **A write leaves untouched `search()` values as they were.** An array `search()` value used to be parsed again on every write, as a new array, so a component reading it rendered again on writes it did not read.
- **`set` with a `search()` or `computed()` key** now throws before it writes anything. Before, the state was already replaced when it threw.
