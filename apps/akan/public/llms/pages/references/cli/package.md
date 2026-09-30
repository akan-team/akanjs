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

package

A folder under `pkgs/` with its own `package.json`, such as `akanjs` or `@akanjs/cli`.

The build output in `dist/pkgs/<pkg>/`, which is the folder that gets packed and published.

The export map in `package.json`: which import paths a consumer may use, and the file each opens.

Lists what a publish would upload and its size, without writing a tarball.

Check

Print the `akanjs` version in use.

Scan one package's imports as a quick check.

Add and remove

Start a new folder in `pkgs/` and register its import path.

Delete the folder and its import path.

Build and publish

Write the dist folder and the dependency list.

Check the dist folder before you publish it.

A package path under `pkgs/`, such as `akanjs` or `@akanjs/cli`; leave it out to pick from a list.

`akan version`

Print the `akanjs` version as one line, `akanjs@<version>`. Check it before a package release, an upgrade or framework maintenance work.

default source

The `akanjs` version the running CLI resolves or depends on.

Reads `pkgs/akanjs/package.json` in this workspace instead.

A separate flag that prints the CLI's own version instead.

mismatch

If the CLI and `node_modules/akanjs` differ, every command warns and suggests `akan update`.

`akan create-package --name <name>`

Create a new package folder at `pkgs/<name>/` and register its import path in the root `tsconfig.json`. The folder starts with only a `tsconfig.json`; add `package.json` and `index.ts` yourself.

The package name, lowercased with spaces turned into `-`; asked for if left out.

The new `pkgs/<name>/tsconfig.json` extends the root one through `../../tsconfig.json`.

scoped name

For a name like `@scope/x`, change that `extends` to `../../../tsconfig.json` by hand.

Adds `<name>` → `./pkgs/<name>/index.ts` and `<name>/*` → `./pkgs/<name>/*` to the root.

Also adds `./pkgs/<name>/tsconfig.json` when the root `tsconfig.json` lists `references`.

`akan remove-package [pkg]`

Delete the whole `pkgs/<pkg>/` folder without asking, and drop its entries from the root `tsconfig.json`. Use it when a package should no longer be synced, built or verified.

Removes `<pkg>` and `<pkg>/*` from `paths`, and its entry from `references`.

what stays

The old build in `dist/pkgs/<pkg>/` and any imports of the package in other code.

`akan sync-package [pkg]`

Scan one package's imports to find the npm packages and sibling packages it uses. It changes no files and prints only whether the scan passed, so use it as a quick check after editing imports.

npm packages

An import counts only when the root `package.json` lists it in `dependencies` or `devDependencies`.

writing them

`build-package` is the step that writes dependencies into `pkgs/<pkg>/package.json`.

`akan build-package [pkg]`

Build one package into `dist/pkgs/<pkg>/`, the folder you publish or other packages use locally. Run it after you change the package, before anything relies on its build output.

clean start

Deletes `dist/pkgs/<pkg>/` first, so nothing from an older build is left behind.

dependencies

Writes each imported package into `pkgs/<pkg>/package.json` at the version the root pins.

Type-only imports and imports inside `build.ts` go to `devDependencies` instead.

sibling packages

An import of a `pkgs/` package the root does not list takes that package's own `version`.

missing version

Stops if an import has no version in the root `package.json`; add it there, then rebuild.

optional peers

Packages marked optional in `peerDependenciesMeta` stay out of the dependency list.

If `pkgs/<pkg>/build.ts` exists, Bun runs it and it writes the dist folder.

no build.ts

Copies the source into dist and writes a `package.json` and `tsconfig.json` there.

generated manifest

Adds `type: module`, an `index.ts` root export and `engines.bun`, and is copied back to the source.

Copies `README.md` and `README.ko.md` into dist when they exist.

`akan verify-dist-package [pkg]`

Check a package's build output in `dist/pkgs/<pkg>/`, then measure it with an `npm pack` dry run. Run it after `build-package` and before publishing, so a broken export map is caught here and not by the first person to install it.

build first

Fails at once if `dist/pkgs/<pkg>/package.json` is missing; run `build-package`.

name and version

The dist `package.json` names this package and carries a `version`.

public access

`publishConfig.access` is `public`.

Both `README.md` and `README.ko.md` are in dist.

No `bin` entry points at a `.ts` source.

Every subpath the package imports from itself must open a real file through `exports`.

fixing exports

Targets match exactly: a file needs `"./*": "./*.ts"`, a folder `"./name": "./name/index.ts"`.

suffixed imports

Add `"./*.ts": "./*.ts"` so a specifier already ending in `.ts` does not get a second extension.

For `akanjs` only, the root export's `types` must point into `./types/`.

result

Prints the file count and the packed size in bytes, and writes or publishes nothing.

The size comes from `npm pack --dry-run`, so `npm` must be on your `PATH`.

published four

`akan verify-akan-publish-packages`, hidden from help, checks the four that Akan.js publishes.

which four

`akanjs`, `@akanjs/cli`, `@akanjs/devkit` and `create-akan-workspace`.

cross-imports

Run together, an import of a sibling's subpath is checked against that sibling's `exports`.

Package CLI

Words Used on This Page

Term

Typical Order

What Each Command Changes

Command

Source

Root tsconfig

Build output

Changed

Untouched

Picking a Package

Related Pages

Run a package's tests with `bun test --isolate` before you build it.

Library CLI

Create, sync and remove the shared code apps use in `libs/`.

Upgrade the Akan.js packages and the CLI, then confirm with `akan version`.

Workspace Structure

Where `pkgs/` sits next to `apps/` and `libs/`.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

