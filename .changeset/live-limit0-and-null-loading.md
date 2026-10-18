---
"akanjs": patch
---

A slice loaded with `limit: 0` keeps every row when a live event adds one, instead of cutting the list to 20 and dropping the oldest rows, and places a row that sorts past its last one. Its `lastPageOf<Model>` is 1 in the store and in the server-rendered init, where it used to be counted in pages of 20.

`Load.Units` with `loading={null}` shows nothing while the slice reloads, as it already did on the first load, instead of the default "Processing" overlay; leaving `loading` out still shows the overlay. `Model.LoadInit` passes `null`, so a layout that holds one no longer dims the whole page each time its slice reloads. Rows rendered with `renderItem` also stay mounted when the slice re-renders, so a row's open menu or local state survives a live event.
