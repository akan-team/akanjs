# Forms

- Source: /references/ui/forms
- Mirror: /llms/pages/references/ui/forms.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Forms UI (#forms-ui)

## Content

Forms

High-level form field namespace. It combines labels, descriptions, optional markers, validation-friendly inputs, and many typed controls used inside module templates.

Shown above the control, with desc rendered as help text.

Marks the label as optional and relaxes validation in many field variants.

Common scalar field controls.

Relation-oriented controls used by generated model templates.

`libs/shared/ui/Field` wraps and extends `akanjs/ui` Field for project-specific controls such as rich text, maps, and postcode.

Controlled primitive input namespace. Use it when you need lower-level input control than `Field`, such as custom search boxes or lightweight inline forms.

Controlled input value.

Receives the next string value.

Returns true for valid input or an error message.

Persists text to sessionStorage.

Specialized input variants.

Controlled selector that accepts primitive arrays, label/value options, or Akan enum instances. It supports single, multiple, and searchable selection modes.

Selected value, or selected values when multiple is true.

Option source.

Enable multiple selected values.

Show search input and optionally call onSearch.

Custom display renderers.

Async-aware button with built-in loading, success, and error state. It is useful for actions that return promises and should prevent duplicate clicks while processing.

Async-aware click handler.

Called after the success state is shown briefly.

Inherited native button prop; also disabled while loading/success.

Forms UI

Form components range from high-level `Field.*` controls used in module templates to lower-level `Input`, `Select`, and async `Button` primitives.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

