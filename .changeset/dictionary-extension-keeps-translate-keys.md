---
"akanjs": patch
---

fix(dictionary): restore the translate keys an extending dictionary inherits from the lib it extends

`ModelDictInfo` briefly carried an extra generic parameter, placed before `ErrorKey` and `EtcKey`. The three
positional lists that merge two dictionaries — `AnyModelDictInfo`, and both halves of `MergeTwoModelDicts` — were
not extended with it. Every parameter has a default, so supplying one too few is legal TypeScript: inference
shifted by one slot and the last parameter fell off the end into its default.

For an app dictionary built as `modelDictionary(["en", "ko"], ...setting.dictionaries)`, that meant:

- `EtcKey` (the `.translate()` keys) became `never` — `l("setting.updateSuccessMsg")` for a key the *lib*
  declared stopped typechecking, in an app whose own source had not changed
- `ErrorKey` was read one slot early, so `${refName}.error.${ErrorKey}` was built from the translate keys instead

Only the types were wrong. `modelDictionary` returns the base instance and the extending chain mutates it, so
every entry was still there at runtime — which is why the failure surfaced only as a typecheck error in
downstream workspaces, and why re-declaring the key in the app (the obvious workaround) silenced it while
duplicating a translation the lib already owned.

Both a runtime test (an extending dictionary keeps the base's `translate`/`error` entries) and type assertions
over the merged `EtcKey` now cover it, and the positional lists carry a note that adding a parameter means adding
it in all three places.
