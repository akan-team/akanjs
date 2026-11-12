---
"@akanjs/devkit": patch
---

The API break check (`bun run api:report --base`) no longer asks for a `minor` changeset when an inferred type's union members or object members only moved. The checker orders them by when it first met each one, so a refactor that changes which file is checked first reordered them without changing the type. Reordered overloads still count as a change.
