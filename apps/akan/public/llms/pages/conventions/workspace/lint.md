# Format & Lint

- Source: /conventions/workspace/lint
- Mirror: /llms/pages/conventions/workspace/lint.md
- Section: conventions
- Category: Workspace
- Priority: P1

## Headings

- Format And Lint (#format-lint)
- Akan Lint Errors And Fixes (#fix-errors)
- Commands (#commands)

## Content

Format & Lint

Format And Lint

Akan lint is mostly here to keep the workspace easy to read and hard to break. In day-to-day work, you only need to remember a few habits: let the formatter handle style, keep client-only code out of server files, avoid random external imports in convention files, and run lint before sharing work.

Let format decide

Use 2-space indentation, double quotes, organized imports, and the formatter's class ordering.

Keep server files server-safe

Do not add useState, useEffect, st, or top-level use client to files that should render on the server.

Keep imports intentional

Convention files should import from relative paths, Akan packages, or workspace aliases before reaching for external packages.

Run it before sharing

Use lint on the app or library you touched, and use lintAll before broad checks.

Akan Lint Errors And Fixes

Some lint errors are not about style. They happen when server UI, client UI, service code, or shared utilities are mixed in the wrong place. Use the examples below as the default shape: keep server pages simple, move browser interaction into client components, and wrap external tools behind internal modules.

Client hooks in a server file

This happens when a server page or server-oriented component imports useState, useEffect, useMemo, useRef, or another React client hook.

Adding use client to a server file

Do not turn a whole page into a client component just because one small part needs browser interaction.

Passing function props from server UI

Server components should pass data, not event behavior. Move callbacks such as onClick into a client component.

Importing external packages directly

Convention files should not depend on random external packages directly. Put the dependency behind an internal util or library file first.

Using JavaScript private methods

In service classes, use TypeScript private methods with an underscore name instead of JavaScript #private methods. Other classes can use #private methods.

Allowed exceptions exist for some framework patterns, but when you are writing ordinary app code, prefer the After shape first.

If console output is intentional, use console.info, console.warn, or console.error instead of console.log.

Commands

Use workspace lint commands for normal development. Use direct Biome checks when you want to verify one file or debug a formatting issue.

## Code Examples

### Lint commands

```bash
akan lint apps/myapp
akan lintAll
bunx biome check "apps/myapp/page/akanjs/(docs)/conventions/workspace/lint.tsx"
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

