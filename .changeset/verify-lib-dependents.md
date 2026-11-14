---
"@akanjs/cli": patch
---

`akan verify` now also syncs and typechecks every app and lib that uses a changed lib, so a lib change that breaks an app using it no longer prints `verify ok`. Those dependents are not linted or built, and targets are linted and typechecked several at a time.

**Upgrading.** A verify run after a lib edit takes longer and can report an error in a file you did not edit; the file it names is where the lib's change broke a caller.
