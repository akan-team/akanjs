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

The one button primitive. A synchronous handler renders a plain button; returning a promise is what opts the same button into loading, success, and error state and blocks duplicate clicks while processing. There is no separate async button to choose.

Optional. Returning a promise enables the async states; returning nothing keeps it a plain button.

Called after the success state is shown briefly.

Both modes keep the box fixed — CSS cannot animate an auto width, so a resizing button can only snap. hold (default) fades a bare indicator over the children, sizing the box to the label. replace cross-fades to a labelled indicator, keeping both labels stacked so the box is the wider of the two from the start.

Whether a failure renders its message under the button. Off leaves it to the framework toast, keeping the layout fixed.

Inherited native button prop; also disabled while loading/success.

Forms UI

Form components range from high-level `Field.*` controls used in module templates to lower-level `Input`, `Select`, and `Button` primitives.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

