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

Forms UI

The form controls in `akanjs/ui`. A model form keeps its state in the store's `<model>Form`, a generated setter writes one field, and a control only shows the current value and hands back the next one.

Words used on this page

Term

- <model>Form: The store's draft of the record being edited, such as `icecreamOrderForm`.

- st.do.set<Field>On<Model>: The generated form setter. It writes one field of that draft.

- Shows the `value` you pass and hands the next one to `onChange`. Only `Switch` can also run alone.

- An action the in-page agent may call. A form setter passed by reference becomes one.

- A name in `_overrides.tsx` that swaps a component for one route subtree.

Pick a control

Work down the groups: `Field.*` for a model field, a bare control when there is no label row, and `Button` for the action at the end.

Component

- Label row — label

- Agent tool — st.do.setXOnY

- Override slot — _overrides.tsx

- Model field — inside a Template

- Bare control — search box, filter bar, inline cell

- Action — ends the form

Has it

Does not

**Pass every setter by reference.** `onChange={st.do.setSizeOnTicket}` publishes the field as an agent tool and adds `data-akan-action` / `data-akan-state` to the control. `onChange={(size) => st.do.setSizeOnTicket(size)}` runs the same and publishes nothing.

Related pages

- Writing a Template — Where the model-field controls live and how a module form is laid out.

- Override Slots — Re-skin the controls on this page for one route subtree.

- In-Page Agent — How a setter passed by reference becomes a tool the agent can call.

- Field: The form-field namespace a module Template is written in. `<Field>` itself is a section wrapper with a label row; every member is one labelled control. The members differ mainly in the shape of `value`.

- Input: Controlled inputs without the label row, for a search box, a filter bar or an inline cell editor. Each member is its own override slot: `Input`, `InputTextArea`, `InputPassword`, `InputEmail`, `InputNumber` and `InputCheckbox` can be re-skinned separately.

- Select: A controlled dropdown for plain values, `{ label, value }` pairs or an `enumOf(...)` class, with single, multiple and searchable modes. The option list portals to `document.body` at the field's width, so a scrolling modal or a table never clips it.

- Switch: A boolean drawn as `<button role="switch">`, so focus and Space/Enter toggling come from the browser. Pass `checked` to control it, or `defaultChecked` to let it keep its own state. For a model field with a label row, use `Field.Switch`.

- Radio: One choice from a `role="radiogroup"` of `role="radio"` buttons; arrow keys move the focus and the choice together. Each child carries its own `value`, and the group matches on it. A numeric `value` counts as an index only when no child owns it.

- ToggleSelect: A choice as a row of pressed buttons instead of a dropdown, for a few short options. `ToggleSelect` picks one and `ToggleSelect.Multi` picks many. `nullable` and `validate` are required: a button row has no empty state to fall back on, so the call site decides both.

- DatePicker: A date on the browser's own `<input type="date">`, so the calendar, locale and touch keyboard are the platform's. The browser enforces `min` and `max`. A native field cannot grey out single days, so a pick that `disabledDate` rejects is refused with a warning toast.

- Button: The one button primitive. A synchronous `onClick` renders a plain button; returning a promise puts the same button through loading, success or error, and blocks repeat clicks meanwhile. There is no separate async button to choose.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

