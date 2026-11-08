# @akanjs/language

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/language/README.ko.md) | [Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/language) | [Runtime](https://www.npmjs.com/package/akanjs)

The editor-neutral index behind Akan.js editor support.

Akan.js builds many names from one source key: the slice key `inPublic` on `memo` becomes `fetch.initMemoInPublic`
and `st.use.memoListInPublic`, a field `name` becomes `st.do.setNameOnMemo`, and a Filter query key `byName` becomes
`listByName`. TypeScript keeps no declaration for such names. `@akanjs/language` reads a workspace's constant,
document, service, signal and store files by syntax alone and maps each derived name back to its source key.

It is for editor integrations. Apps never import it.

## Install

```bash
bun add -d @akanjs/language typescript
```

## Usage

```ts
import { AkanIndex } from "@akanjs/language";
import ts from "typescript";

const index = new AkanIndex({ ts, root: "/path/to/workspace" });
index.setFile(fileName, text);

index.definitionAt(fileName, text, offset);
index.hoverAt(fileName, text, offset);
index.referencesAt(fileName, offset, readText);
index.sourceKeysOf(fileName);
index.renameAt(fileName, offset, "inFeed", readText);
```

Pass the host's own `typescript`: the package bundles none, and two copies would disagree on `SyntaxKind` numbers.
Feed every `apps/**` and `libs/**` TypeScript file to `setFile`, then call `setFile` again or `removeFile` as files
change. File names may use either separator; `readText` is called with, and every span carries, forward slashes. A
name resolves within its own app and every lib, never another app. `renameAt` returns the edits that rename a slice or
query key together with every name derived from it and its key in the module dictionary.

The package ships as an ES module and as CommonJS, with no runtime dependency.

## Language server

`akan-language-server --stdio` serves the same index over LSP. It is for editors other than VS Code and Cursor,
which have the Akan extension: run it next to TypeScript's server, and the editor merges the two servers' answers. It
answers definition, hover and references. It indexes the folder holding `apps/` or `libs/` at or above the editor's
root. It rereads files changed on disk when the editor supports watched-file registration.

Neovim 0.11:

```lua
vim.lsp.config("akan", {
  cmd = { "bunx", "akan-language-server", "--stdio" },
  filetypes = { "typescript", "typescriptreact" },
  root_markers = { "bun.lock" },
})
vim.lsp.enable("akan")
```

Helix, in `languages.toml`:

```toml
[language-server.akan]
command = "bunx"
args = ["akan-language-server", "--stdio"]

[[language]]
name = "typescript"
language-servers = ["typescript-language-server", "akan"]

[[language]]
name = "tsx"
language-servers = ["typescript-language-server", "akan"]
```
