---
"akanjs": patch
---

An app filter that extends a library's filter, `from(cnst.User, (filter) => ({ ... }), ...user.filters)`, now carries the library's sort keys in its type, so a sort key the library declares typechecks without being redeclared in the app. Runtime sorting already merged them, and redeclaring a library sort key stays legal. Because the keys are now part of the filter's type, an app dictionary that does not spread the library's dictionaries into `modelDictionary(...)` must translate them in `.sort()`, as it already does for the library's query keys.
