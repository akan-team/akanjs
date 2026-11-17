---
"akanjs": patch
"@akanjs/devkit": patch
---

The development server now loads what a production page loads, so a page that works in development works the same once built.

- A server-rendered page in development takes the descriptors and stores of only the modules its client code names, from the same `lib/__client/` pieces a route build uses, and imports from `akanjs/ui` narrow as they do in a build. The tab keeps one store, and each piece loads once.
- Saving a store, signal or constant file rereads which module declares each name and recompiles the files whose names moved to another module. A store save that adds an action replaces that store's actions and keeps its state, without reloading the page.
- Saving a lib's store file or store piece runs the app's piece of that module and the app's assembled store again after it, and the app's store of that model too when it extends the lib's, so a lib store the app extends keeps the app's actions.
- A component saved to name another module loads that module's piece without reloading the page; a file saved to pick a name at run time loads the whole runtime.
- An app whose `lib/__client/` files, or a mounted lib's, are missing, or whose modules cannot be read, loads the whole runtime in development as a build does. The development server says which once, names the sync to run, and loads per module again on the next save after that sync, with no restart.
- Reading a store key the page has not loaded fails with the name of the module whose store declares it, and says to name the key in the file that reads it or import `st` from the app's `client` barrel there. The list of each store's keys behind that message exists only in development: a production bundle carries neither the list nor the message.
