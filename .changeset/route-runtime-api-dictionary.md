---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

Under `clientRuntime: "route"`, the descriptions of API endpoints leave the dictionary file every page loads, and load only on a page that shows them. With `"all"`, the default, the dictionary files are byte for byte what they were.

- `akan build` and the development server write two files per language under `/_akan/dict`: the page dictionary, without the `.desc` and `.arg` texts of each `signal` entry, and an API file holding exactly those. The page file names the API file in an exported `parts` map. The endpoint labels stay in the page file.
- The API explorer (`Signal` in `akanjs/ui`) loads the API file before it shows a description: a server-rendered page preloads it and carries its texts in the HTML, and a client navigation into the explorer waits for it. A page showing no description never requests it. A file that fails to load is retried once; after a second failure the explorer shows without descriptions and logs the error.
- The server, MCP, the API and schema reference routes and a CSR build keep the whole dictionary.
- `TranslatorState` merges the files of a language into its dictionary, each file once. A language switch keeps each language's merged files to that language, and a file arriving after its language moved to another build is dropped. A page dictionary asked for before another of the same language but answering after it no longer replaces the newer one.
- `akan build` prints one line per language with the brotli size of each file: `Dictionary en: 4.9KB brotli on every page, API descriptions 836B where shown`.
- `DictionaryAssetBuilder.build` in `@akanjs/devkit` takes an option `{ splitApi }`.

**Upgrading.**

Nothing to do under the default `"all"`. Under `"route"`, a client component of your own that reads an endpoint's description or argument text (`l("<module>.signal.<endpoint>.desc")`) gets the key back on a page without the API explorer; read it in a server component and pass the text down.
