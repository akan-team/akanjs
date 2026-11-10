# Contributing to Akan.js

Thank you for your interest in contributing to Akan.js. This guide is a starting point for opening issues,
submitting pull requests, and keeping changes reviewable.

## Project Shape

Akan.js is a Bun-first TypeScript monorepo.

- `pkgs/akanjs`: framework package, runtime surfaces, CLI, devkit, and tooling.
- `apps`: application examples and product surfaces built with Akan.
- `libs`: shared domain and utility libraries.
- `infra`: deployment, Helm, edge, and CI/CD assets.

When changing framework code, prefer existing package subpaths and keep the root `akanjs` entrypoint small.
Runtime boundaries are part of the package design.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Keep changes focused on one concern at a time.
- Prefer existing patterns over new abstractions.
- Avoid broad formatting-only changes unless the pull request is explicitly about formatting.
- Do not commit secrets, generated credentials, local `.env` files, or private deployment values.

## Development

Install dependencies with Bun:

```bash
bun install
```

Useful commands:

```bash
bun run akan lint-all --fix=false
bun run akan build <appName>
bun run akan start <appName>
```

After changing application source code, verify the affected app when practical:

```bash
bun run akan start <appName>
bun run akan build <appName>
```

## Pull Request Guidelines

A good pull request should include:

- A short explanation of the problem and the approach.
- Screenshots or recordings for visible UI changes.
- Tests, examples, or manual verification notes for behavior changes.
- Notes about breaking changes, migration steps, or follow-up work.

Reviewers should be able to understand the change from the pull request description and the diff without
reverse-engineering unrelated context.

## Public API

`api-report/akanjs/` at the repository root records the public API of `akanjs`, one report per entry point, as its
declaration emit states it. Each report also lists, under "Referenced, not exported", the declarations its exports
name that no entry point exports, such as the `X_base` const of a mixin class. After changing an export or anything
it names, rewrite the reports and commit them with the change:

```bash
bun run api:report
```

CI fails when the reports no longer match the source, and on a pull request it compares them with the base branch:

- Adding an export or an entry point needs nothing more.
- Removing an export, or changing its declaration or a referenced one, needs a changeset that bumps `akanjs` by
  `minor` (or `major`) and says how to upgrade. CI prints the old and the new text of each change.
- A change that only adds to a declaration, such as a new optional property or union member, counts too: the check
  cannot tell it is compatible. Add the `minor` changeset anyway and say that no upgrade step is needed.
- Mark an export `/** @deprecated <what instead> */` and release that before removing it. The report shows the tag,
  and adding or removing it is not a change.
- The wildcard subpaths (`akanjs/server/*` and the others in `akanjs.wildcards.api.md`) are listed, but the files
  under them are not reported one by one.

## Coding Style

- Use TypeScript and Bun-first workflows.
- Follow the existing file layout, naming conventions, and module boundaries.
- Use Biome formatting conventions used by the repository.
- Keep code readable six months from now: clear declarations beat clever shortcuts.
- Add comments only when they explain non-obvious behavior or decisions.

## Reporting Issues

When reporting a bug, include:

- The Akan.js version or commit.
- The Bun version and operating system.
- A minimal reproduction or the smallest code sample that shows the problem.
- Expected behavior and actual behavior.
- Relevant logs, stack traces, or screenshots.

For feature requests, describe the business problem first, then the API or behavior you would like to see.

## License

By contributing to this repository, you agree that your contributions will be licensed under the MIT License.
