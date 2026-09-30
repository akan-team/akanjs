# Package

- Source: /references/cli/package
- Mirror: /llms/pages/references/cli/package.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Package CLI (#package-cli)

## Content

Package

Package CLI

Six commands that create, build and verify the packages under `pkgs/`: the framework (`akanjs`), the CLI and other tooling. They sit below the app and library commands, so use those for product code.

Words Used on This Page

Term

- package: A folder under `pkgs/` with its own `package.json`, such as `akanjs` or `@akanjs/cli`.

- dist: The build output in `dist/pkgs/<pkg>/`, which is the folder that gets packed and published.

- exports: The export map in `package.json`: which import paths a consumer may use, and the file each opens.

- npm pack --dry-run: Lists what a publish would upload and its size, without writing a tarball.

Typical Order

`akan create-package --name renderer` makes `pkgs/renderer/`. Add its `package.json` and `index.ts` yourself.

Write the code and test it with `akan test renderer`.

`akan build-package renderer` writes `dist/pkgs/renderer/`.

`akan verify-dist-package renderer` checks that folder before you publish it.

What Each Command Changes

Command

Source

Root tsconfig

Build output

- Check

  - version: Print the `akanjs` version in use.

  - sync-package: Scan one package's imports as a quick check.

- Add and remove

  - create-package: Start a new folder in `pkgs/` and register its import path.

  - remove-package: Delete the folder and its import path.

- Build and publish

  - build-package: Write the dist folder and the dependency list.

  - verify-dist-package: Check the dist folder before you publish it.

Changed

Untouched

Picking a Package

The four commands that take `[pkg]` find the package the same way.

**Name a package by its path under `pkgs/`.** For example `akanjs`, `@akanjs/cli` or `create-akan-workspace`. Leave it out, or mistype it, and you pick one from a list.

**Only a folder with a `package.json` counts as a package.** A folder fresh from `create-package` has none yet, so add one before the other commands.

**Commit before you remove or build a package.** `remove-package` deletes `pkgs/<pkg>/` without asking, and `build-package` rewrites `pkgs/<pkg>/package.json`.

Related Pages

Run a package's tests with `bun test --isolate` before you build it.

Library CLI

Create, sync and remove the shared code apps use in `libs/`.

Upgrade the Akan.js packages and the CLI, then confirm with `akan version`.

Workspace Structure

Where `pkgs/` sits next to `apps/` and `libs/`.

`akan version`

Print the `akanjs` version as one line, `akanjs@<version>`. Check it before a package release, an upgrade or framework maintenance work.

- default source: The `akanjs` version the running CLI resolves or depends on.

- USE_AKANJS_PKGS=true: Reads `pkgs/akanjs/package.json` in this workspace instead.

- akan --version: A separate flag that prints the CLI's own version instead.

- mismatch: If the CLI and `node_modules/akanjs` differ, every command warns and suggests `akan update`.

`akan create-package --name <name>`

Create a new package folder at `pkgs/<name>/` and register its import path in the root `tsconfig.json`. The folder starts with only a `tsconfig.json`; add `package.json` and `index.ts` yourself.

- --name (String, -n): The package name, lowercased with spaces turned into `-`; asked for if left out.

- tsconfig.json: The new `pkgs/<name>/tsconfig.json` extends the root one through `../../tsconfig.json`.

- scoped name: For a name like `@scope/x`, change that `extends` to `../../../tsconfig.json` by hand.

- paths: Adds `<name>` → `./pkgs/<name>/index.ts` and `<name>/*` → `./pkgs/<name>/*` to the root.

- references: Also adds `./pkgs/<name>/tsconfig.json` when the root `tsconfig.json` lists `references`.

`akan remove-package [pkg]`

Delete the whole `pkgs/<pkg>/` folder without asking, and drop its entries from the root `tsconfig.json`. Use it when a package should no longer be synced, built or verified.

- pkg (String): A package path under `pkgs/`, such as `akanjs` or `@akanjs/cli`; leave it out to pick from a list.

- tsconfig.json: Removes `<pkg>` and `<pkg>/*` from `paths`, and its entry from `references`.

- what stays: The old build in `dist/pkgs/<pkg>/` and any imports of the package in other code.

`akan sync-package [pkg]`

Scan one package's imports to find the npm packages and sibling packages it uses. It changes no files and prints only whether the scan passed, so use it as a quick check after editing imports.

- pkg (String): A package path under `pkgs/`, such as `akanjs` or `@akanjs/cli`; leave it out to pick from a list.

- npm packages: An import counts only when the root `package.json` lists it in `dependencies` or `devDependencies`.

- writing them: `build-package` is the step that writes dependencies into `pkgs/<pkg>/package.json`.

`akan build-package [pkg]`

Build one package into `dist/pkgs/<pkg>/`, the folder you publish or other packages use locally. Run it after you change the package, before anything relies on its build output.

- pkg (String): A package path under `pkgs/`, such as `akanjs` or `@akanjs/cli`; leave it out to pick from a list.

- clean start: Deletes `dist/pkgs/<pkg>/` first, so nothing from an older build is left behind.

- dependencies: Writes each imported package into `pkgs/<pkg>/package.json` at the version the root pins.

- devDependencies: Type-only imports and imports inside `build.ts` go to `devDependencies` instead.

- sibling packages: An import of a `pkgs/` package the root does not list takes that package's own `version`.

- missing version: Stops if an import has no version in the root `package.json`; add it there, then rebuild.

- optional peers: Packages marked optional in `peerDependenciesMeta` stay out of the dependency list.

- build.ts: If `pkgs/<pkg>/build.ts` exists, Bun runs it and it writes the dist folder.

- no build.ts: Copies the source into dist and writes a `package.json` and `tsconfig.json` there.

- generated manifest: Adds `type: module`, an `index.ts` root export and `engines.bun`, and is copied back to the source.

- README: Copies `README.md` and `README.ko.md` into dist when they exist.

`akan verify-dist-package [pkg]`

Check a package's build output in `dist/pkgs/<pkg>/`, then measure it with an `npm pack` dry run. Run it after `build-package` and before publishing, so a broken export map is caught here and not by the first person to install it.

- pkg (String): A package path under `pkgs/`, such as `akanjs` or `@akanjs/cli`; leave it out to pick from a list.

- build first: Fails at once if `dist/pkgs/<pkg>/package.json` is missing; run `build-package`.

- name and version: The dist `package.json` names this package and carries a `version`.

- public access: `publishConfig.access` is `public`.

- README: Both `README.md` and `README.ko.md` are in dist.

- bin: No `bin` entry points at a `.ts` source.

- exports: Every subpath the package imports from itself must open a real file through `exports`.

- fixing exports: Targets match exactly: a file needs `"./*": "./*.ts"`, a folder `"./name": "./name/index.ts"`.

- suffixed imports: Add `"./*.ts": "./*.ts"` so a specifier already ending in `.ts` does not get a second extension.

- akanjs: For `akanjs` only, the root export's `types` must point into `./types/`.

- result: Prints the file count and the packed size in bytes, and writes or publishes nothing.

- npm: The size comes from `npm pack --dry-run`, so `npm` must be on your `PATH`.

- published four: `akan verify-akan-publish-packages`, hidden from help, checks the four that Akan.js publishes.

- which four: `akanjs`, `@akanjs/cli`, `@akanjs/devkit` and `create-akan-workspace`.

- cross-imports: Run together, an import of a sibling's subpath is checked against that sibling's `exports`.

## Code Examples

### version

```bash
akan version
akan --version
```

### create-package

```bash
akan create-package --name renderer
akan create-package
```

### remove-package

```bash
akan remove-package renderer
akan remove-package
```

### sync-package

```bash
akan sync-package renderer
akan sync-package
```

### build-package

```bash
akan build-package renderer
akan build-package akanjs
```

### verify-dist-package

```bash
akan verify-dist-package renderer
akan verify-dist-package @akanjs/devkit
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

