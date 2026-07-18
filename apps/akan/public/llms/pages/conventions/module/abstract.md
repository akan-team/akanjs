# model.abstract.md

- Source: /conventions/module/abstract
- Mirror: /llms/pages/conventions/module/abstract.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.abstract.md (#module-abstract)
- Update Rule (#update-rule)

## Content

model.abstract.md

A module abstract is the business-intent file for a domain module. It explains why the module exists, what rules must stay true, which workflows matter, and what agents should know before editing implementation files.

Do not duplicate the constant or dictionary file in prose. Use this file for information that code alone does not make obvious.

Update Rule

Update it when business invariants, workflows, public behavior, permissions, or state transitions change.

Do not update it for formatting-only, import-only, or style-only changes.

Read it before changing constant, document, service, signal, store, or UI files in the same module.

## Code Examples

### lib/product/product.abstract.md

```markdown
# Product Abstract

## Purpose

Describe the business concept this module owns.

## Domain Rules

- Keep durable business invariants here.

## Data Meaning

Explain important data meanings only when the code does not make the intent obvious.

## Workflows

Describe create, update, approval, deletion, or state transition flows.

## Agent Notes

- Read this abstract before changing module behavior.
- Update it when public behavior, workflows, or invariants change.

## Related Modules

- None documented yet.
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

