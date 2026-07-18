# akanjs/common

- Source: /references/akanjs/common
- Mirror: /llms/pages/references/akanjs/common.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/common (#akanjs-common)

## Content

akanjs/common

Structured logger used by CLI, server, service adaptors, and long-running build/runtime code. It supports static calls, named instances, log-level filtering from `AKAN_PUBLIC_LOG_LEVEL`, and sink hooks for runtime file logging.

Promise-based delay helper used in polling, retry, local server tests, and cloud auth loops. It resolves after the given milliseconds and keeps async flows readable.

Tiny string casing helpers that change only the first character. Generators use them to convert module names into class names, file names, action names, and dictionary keys.

Phone formatting and validation helpers used by form templates and business UI. `formatPhone` normalizes known Korean-style lengths while `isPhoneNumber` checks dashed phone input.

Email format validator for templates, profile forms, and service desk inputs. It returns false for empty values and true only when the string matches the supported email pattern.

HTTP wrapper used by srvkit integrations and platform APIs. Use it to centralize request options, logging, auth, and response handling for external services.

Object path helpers for nested state and form values. They are useful when field paths are dynamic and direct property access is not possible.

Random selection helpers used by generators and test utilities. Use `randomPick` for a single value and `randomPicks` when selecting multiple values from a candidate list.

`akanjs/common` contains framework-agnostic utilities shared by CLI, server, UI, and app code. Import it for logging, formatting, validation, object path helpers, random helpers, and route/version utilities.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

