# Structure

- Source: /conventions/workspace/structure
- Mirror: /llms/pages/conventions/workspace/structure.md
- Section: conventions
- Category: Workspace
- Priority: P1

## Headings

- Workspace Anatomy (#workspace-anatomy)
- Workspace Commands (#workspace-commands)

## Content

Structure

Workspace Anatomy

An Akan workspace is a Bun-first monorepo. At the workspace root, the first-level entries tell you whether something is a runnable app, shared product library, framework package, or root tooling config.

Runnable and deployable products. Put customer sites, admin portals, brand apps, and app-specific business code here.

Shared product libraries used by multiple apps. Put common domains, utilities, UI, auth, upload, billing, or notification features here.

Framework, CLI, devkit, runtime, and package-level tooling. Use this when code belongs to Akan itself or should behave like an installable package.

Repo-wide formatting and linting rules. This keeps TypeScript, JSX, imports, and style decisions consistent across apps, libs, and pkgs.

Bun runtime and package manager configuration used by workspace commands and package workflows.

Workspace Commands

Workspace commands operate at the monorepo level. They help you create a workspace, lint one target, lint the whole workspace, or sync dependencies and configuration across apps and libraries.

## Code Examples

### Workspace root

```bash
.
├── apps/
├── libs/
├── pkgs/
├── biome.json
└── bunfig.toml
```

### Workspace command examples

```bash
akan create-application
akan create-library
akan create-package
akan lint <app/lib/pkg-name>
akan lintAll
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

