# Scalar

- Source: /references/cli/scalar
- Mirror: /llms/pages/references/cli/scalar.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Scalar CLI (#scalar-cli)

## Content

Scalar

scalar

A named group of fields saved inside other models, like `Price`. It has no table of its own.

The app or library that holds the scalar: `shop` in `akan create-scalar price shop`.

scaffold

The starter code a command writes, meant to be edited.

report

What `create-scalar` prints at the end: the files it wrote and the commands to run next.

Scaffolded into `lib/__scalar/<scalar>/`

What the value means and its reuse rules, as headings to fill in.

The class with the fields, starting with one placeholder `field: field(String)`.

English and Korean labels, written with `scalarDictionary`.

The server-side class, one line: `by(cnst.<Scalar>)`.

Written by hand, in the same folder

The editor for the value inside a parent form.

The display of the value inside a parent card or detail page.

Outside the folder

code that uses it

Fields such as `field(Price)` and imports in other modules. Neither command touches them.

`markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

The app or library, such as `shop`. Leave it out to pick one from a list.

`akan create-scalar <scalar-name> [sys] [--format <markdown|json>]`

Create a scalar: a reusable value object or data shape that needs no table of its own. It writes four files into `lib/__scalar/<scalar>/` and prints what it wrote.

Scalar name. Spaces are removed and the first letter is lowercased; asked for if left out.

files

Four files: abstract, constant, dictionary and document. Template and Unit are written by hand.

names

`AccessToken` becomes the folder `accessToken` and the class `AccessToken`.

placeholder

Replace the placeholder `field` in the constant and its label in the dictionary.

existing file

A file already at the path keeps its content; only the formatter may tidy it.

`akan remove-scalar <scalar-name> [sys]`

Remove a scalar from an app or library. It deletes the whole `lib/__scalar/<scalar>/` folder at once, without asking.

The folder name under `lib/__scalar/`, used exactly as typed; asked for if left out.

check first

Modules, dictionaries, templates and service payload types often import a scalar.

exact name

Type the folder name, such as `accessToken`. A name with no folder deletes nothing, silently.

what stays

Fields and imports in other modules that use the scalar stay; remove them yourself.

afterwards

Run `akan sync <sys>` so the generated files drop the scalar.

Scalar CLI

Words Used on This Page

Term

Files Each Command Touches

File

Written or deleted

Not touched

Rules to Know

Related Pages

Scalar Overview

When a scalar fits better than a module, and how to embed one.

Module CLI

`create-module` for a model with its own table.

Workflow CLI

The `create-scalar` workflow runs this command, then sync and lint.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

