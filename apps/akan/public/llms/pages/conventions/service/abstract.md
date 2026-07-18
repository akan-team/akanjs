# service.abstract.md

- Source: /conventions/service/abstract
- Mirror: /llms/pages/conventions/service/abstract.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- service.abstract.md (#service-abstract)

## Content

service.abstract.md

A service abstract explains the intent and boundaries of a workflow or integration module. Service folders keep the underscore, but the abstract filename drops it: `lib/_payment/payment.abstract.md`.

Use it for rules that should guide service, signal, store, and UI changes, especially when a workflow touches external systems or background work.

## Code Examples

### lib/_payment/payment.abstract.md

```markdown
# Payment Service Abstract

## Purpose

Describe the workflow or integration this service owns.

## Domain Rules

- Keep durable workflow and integration invariants here.

## Data Meaning

Explain important inputs, outputs, and state meanings.

## Workflows

Describe external calls, jobs, state transitions, or service orchestration.

## Agent Notes

- Keep business behavior in service code.
- Expose callable actions through signal files.
- Update this abstract when public behavior or workflow rules change.

## Related Modules

- None documented yet.
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

