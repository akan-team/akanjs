# scalar.abstract.md

- Source: /conventions/scalar/abstract
- Mirror: /llms/pages/conventions/scalar/abstract.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.abstract.md (#scalar-abstract)

## Content

scalar.abstract.md

A scalar abstract explains the meaning and reuse rules of a small embedded value object. Use it when validation intent, normalization behavior, or usage boundaries are not obvious from the scalar constant file.

## Code Examples

### lib/__scalar/money/money.abstract.md

```markdown
# Money Scalar Abstract

## Purpose

Describe the reusable value concept this scalar owns.

## Domain Rules

- Keep validation and meaning rules here.

## Data Meaning

Explain field meaning and when this scalar should be reused.

## Workflows

Describe normalization or lifecycle behavior when relevant.

## Agent Notes

- Read this abstract before changing validation meaning or public behavior.
- Do not duplicate field types from the constant file.

## Related Modules

- None documented yet.
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

