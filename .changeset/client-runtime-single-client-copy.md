---
"akanjs": patch
"@akanjs/devkit": patch
---

A page downloads the framework's `akanjs/client` code once. A production build used to bundle the `akanjs/client` files that the framework's UI imports by path into the page's own chunks, beside the copy the page's server-rendering client already loaded, so a page ran two copies of them, each with its own state (`Device.instance` among it). Both now come from one browser entry for `akanjs/client`, which, like the other framework entries, holds only the names the app uses. This applies to a page loading per module and to one keeping the whole runtime alike; what a page shows and how it behaves do not change.

- **Size.** In the framework's own sample apps each route loads 9 to 17 KB (brotli) less when it loads per module and 9 to 50 KB less when it loads every module. A page loading per module can make one more request, for the `akanjs/client` entry; a page loading every module makes the same number or fewer.
- **Which files.** A file comes from the entry when the `akanjs/client` barrel re-exports all of it under its own names, whether the importer names `akanjs/client`, a path into it, a relative path, or a path through a linked `akanjs` install. A file the barrel leaves out or renames, such as `akanjs/client/native`, any dynamic `import()`, and a file of another framework entry imported by its path stay in the page's chunks. The native bridge behind `akanjs/client/native` is therefore still written into both builds, because the entry's `Device` and `storage` import it lazily, but only the CSR shell loads it.
- **Development.** `akan start` serves those files from its whole `akanjs/client` entry as well, so a development page runs one copy of the client's state; a few stateless helpers the framework's UI imports by path (`cn` among them) still load beside it from the development module registry.
- **Unchanged.** The single-file CSR build that native apps load and MCP App views carry one copy, as before.

Nothing to do. A workspace on an older `akanjs` without the `akanjs/client` entry builds as it did.
