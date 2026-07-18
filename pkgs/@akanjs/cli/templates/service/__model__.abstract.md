# Service Abstract

## Purpose

Describe the business workflow or integration this service owns.

## Domain Rules

- Keep durable business invariants here.
- Avoid repeating implementation details already clear in the service or signal files.

## Data Meaning

Explain important input, output, and state meanings only when the code does not make the intent obvious.

## Workflows

Describe the service workflows, background jobs, external calls, or state transitions.

## Agent Notes

- Read this abstract before changing the service module.
- Keep business behavior in service code and expose callable actions through signals.
- Update this file when business invariants, workflows, or public behavior change.

## Related Modules

- None yet.
