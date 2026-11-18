---
"@akanjs/devkit": patch
---

A page that names a part through a workspace's own wrapper of an object loads that part's file, not everything the wrapper gathers: with a workspace's own `Field` wrapper, `<Field.Text />` no longer brings the wrapper's rich-text editor, map field and upload field onto the page.

- An object built over an imported one, `export const Field = Object.assign(Section, AkanField, { Rich, File })`, passes the copied object's parts on by file. `Field.Text` is imported from the file `akanjs/ui`'s `Field` takes `Text` from, and `Field.File` from the file the wrapper imports it from. The copied object may come through a barrel listed in `barrelImports` (`akanjs/ui`, a lib's `ui`), and may itself copy another object in.
- An object's file may now call React's `memo`, `forwardRef`, `lazy` and `createContext` while it loads (`const Rich = memo(…)`, `React.memo(…)`); any other call still keeps the whole object.
- What still keeps the whole object: a part declared in the wrapper's own file (`Field.Rich` above), a part the wrapper lists before the object it copies in (`Object.assign(Section, { File }, AkanField)`, where the copied object may replace `File`), a copied object whose own file does not qualify, and a namespace import copied in (`import * as parts`). `akan quality runtime` counts these as before, the first two as `unresolved-member` and a copied object's file by its own reason (`call`, `effect-statement`, …).
- A member reached from a server file past a `"use client"` wrapper or a `"use client"` copied object is narrowed only when the member's own file is `"use client"`, as with an object imported directly.

On the app this was measured on, the files a route loaded only through such a wrapper weighed about 23 KB (brotli) on the median route and up to 119 KB on light ones.

No upgrade step.
