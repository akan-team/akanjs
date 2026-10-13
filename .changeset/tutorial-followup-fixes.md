---
"akanjs": patch
"@akanjs/cli": patch
---

- `Select` given an `enumOf(...)` class lists each value under its dictionary name, as `Field.ToggleSelect` already did; a value the dictionary does not name shows as is.
- `Model.ViewEditModal` shows its edit button and remove menu only for the verbs the slice's guards open.
- A one-argument `adapt(name)` keeps the `Adaptor` members on the class that extends it, so `plug(TheClass)` typechecks without a cast.
- The app template's `text-primary` sugar no longer blanks a descendant that has a background of its own; it takes the primary color back unless it names a text color.
- The app template's `env.client.type.ts` declares `AppClientEnv` as `Record<never, never>`, which passes lint.
