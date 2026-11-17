---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

Under `clientRuntime: "route"`, the descriptions of API endpoints leave the dictionary file every page loads, and load only on a page that shows them. With `"all"`, the dictionary files are byte for byte what they were; its bundles are not, since the `Signal` components carry the loader, a page dictionary answering late no longer replaces a newer one and `akan build` prints a dictionary line, none of which changes what a page shows.

- `akan build` and the development server write two files per language under `/_akan/dict`: the page dictionary, without the `.desc` and `.arg` texts of each `signal` entry, and an API file holding exactly those. The page file names the API file in an exported `parts` map. The endpoint labels stay in the page file.
- Each `Signal` component of `akanjs/ui` that shows an endpoint's description or argument texts, `Signal.Arg.Table` rendered on its own included, loads the API file before it shows them: a server-rendered page preloads it and carries its texts in the HTML, and a client navigation into such a page waits for it. A page showing no description never requests it. A file that fails to load is retried once; after a second failure the page shows without descriptions and logs the error, and the next navigation tries again.
- The server, MCP, the API and schema reference routes and a CSR build keep the whole dictionary.
- `TranslatorState` merges the files of a language into its dictionary, each file once. A language switch keeps each language's merged files to that language, and a file arriving after its language moved to another build is dropped. A page dictionary asked for before another of the same language but answering after it no longer replaces the newer one.
- `akan build` prints one line per language with the brotli size of each file: `Dictionary en: 4.9KB brotli on every page, API descriptions 836B where shown`.
- `DictionaryAssetBuilder.build` in `@akanjs/devkit` takes an option `{ splitApi }`.

**Upgrading.**

A `"use client"` component of your own that writes an endpoint's description or argument key out (`l("<module>.signal.<endpoint>.desc")`) brings the API file to its route. What happens to one that builds the key from data is in the upgrade note of the entry that makes `"route"` the default.
