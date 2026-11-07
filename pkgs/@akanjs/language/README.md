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
change. A name resolves within its own app and every lib, never another app. `renameAt` returns the edits that rename
a slice or query key together with every name derived from it.

The package ships as an ES module and as CommonJS, with no runtime dependency.
