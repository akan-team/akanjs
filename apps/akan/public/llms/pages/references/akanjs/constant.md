# akanjs/constant

- Source: /references/akanjs/constant
- Mirror: /llms/pages/references/akanjs/constant.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/constant (#akanjs-constant)

## Content

akanjs/constant

Runtime registry for scalar/database constant metadata. Framework internals use it to resolve ref names, model classes, scalar metadata, enum metadata, and generated document model contracts.

Builds a default object from a field object, respecting primitive defaults, nullable fields, arrays, maps, and field-level default callbacks. Model classes expose the same result through `Model.getDefault()`.

`crystalize` converts raw values into model-friendly values such as dayjs and nested constants. `purify` converts class instances back into plain serializable objects for API and persistence boundaries.

Serialization helpers for document and transport boundaries. They convert constant model values, dates, enums, maps, arrays, and nested models between runtime values and persisted payloads.

Public type helpers used by documents, stores, and tests. `DocumentModel` maps relations to ids, `DefaultOf` describes default state, and `QueryOf` is used for query-shaped inputs.

`akanjs/constant` defines Akan's schema layer. Import it when declaring scalar/module constants, deriving document/default/query types, inspecting model metadata, or converting constant instances across persistence boundaries.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

