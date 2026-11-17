---
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

Under `clientRuntime: "route"`, a page loads only the parts of an object it names: `Memo.Zone.View` brings `Memo.Zone.tsx` and not the model's other part files, and `Layout.Navbar` brings the navbar and not every layout part. With `"all"`, the build output is byte for byte what it was.

- In a build and in the development server alike, an import of an object whose file only gathers imports is rewritten to imports of the members the importing file writes out: `Memo.Zone.View`, `<Field.Text />`, `const { Util } = Memo`, and a member one level down such as `Constant.Doc.Zone`. Server rendering and the browser load the same part file.
- An object's file qualifies when, while it loads, it only declares names (imports, types, functions, `const` values, export lists) and puts members on objects it created above (`X.member = …`, `Object.assign(X, …)`), and nothing it evaluates calls a function, assigns or awaits. A file that imports a module only for its effect (`import "./x"`, `import {} from "./x"`), re-exports from another module, runs any other statement, calls a function such as `memo(…)`, or puts a member on an import or on a name it did not create keeps the whole object. So does an importing file that passes the object on, spreads it, reads a member with a computed key, renders or calls the object itself, writes to a member (an assignment, `++`, `delete`, a `for … of` target or a destructuring assignment), or calls a member through it (`Obj.run()`) that may read `this`: only an arrow function, or a function with no `this` outside its nested functions, is called on its own.
- A member of a `"use client"` object reached from a server file is narrowed only when the member's own file is `"use client"`, so the server still meets a client reference where it met one before.
- `export { a, b as c } from "<barrel>"` in an app or lib is narrowed to the files that declare those names, and a name a barrel's entry re-exports from a package resolves to that package.
- In development, saving a part file updates the page in place, adding an export to a part file and naming it from a page works without a restart, and pointing an object's member at another file rereads every page that reached it.
- `akan quality runtime` prints, per app and lib, how many object imports load only the members they name and how many load the whole object, by reason; `--format json` lists each of the latter with its file and line.

In the sample apps every route got smaller: the largest route of `apps/minimal` went from 469 KB to 319 KB, and the median route of `apps/akan` from 535 KB to 304 KB (brotli).

**Upgrading.**

A part file a page does not name no longer runs its top-level code on that page; what that can break is in the upgrade note of the entry that makes `"route"` the default. `akan quality runtime` shows what kept an object whole: per app and lib it counts the imports that load the whole object by reason (`call`, `reexport`, `method-call`, `written`, `passed-on`, …), and `--format json` lists each one with its file, line, object and reason. An object kept whole for a `call` loads every part, so moving the call (`memo(…)`) into the member's own file lets pages load parts again.
