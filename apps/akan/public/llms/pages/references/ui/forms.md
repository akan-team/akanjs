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

- controlled: Shows the `value` you pass and hands the next one to `onChange`. Only `Switch` can also run alone.

- agent tool: An action the in-page agent may call. A form setter passed by reference becomes one.

- override slot: A name in `_overrides.tsx` that swaps a component for one route subtree.

Pick a control

Work down the groups: `Field.*` for a model field, a bare control when there is no label row, and `Button` for the action at the end.

Component

Label row — label

Agent tool — st.do.setXOnY

Override slot — _overrides.tsx

- Model field — inside a Template

  - Field.*: One labelled control per model field, written inside a Template.

- Bare control — search box, filter bar, inline cell

  - Input: Text, number, password, email and checkbox inputs without a label row.

  - Select: A dropdown for single, multiple or searchable choice. `label` is optional.

  - Switch: A boolean toggle. `Field.Switch` adds the label row.

  - Radio: One choice from a short list of radio buttons.

  - ToggleSelect: One or many choices as a row of buttons. `Field.ToggleSelect` publishes the tool.

  - DatePicker: A date, date-time, range or time on the native input. `Field.Date` publishes the tool.

- Action — ends the form

  - Button: Publishes nothing itself. An `st.tool(...)` handler given to `onClick` is the agent's tool.

Has it

Does not

**Pass every setter by reference.** `onChange={st.do.setSizeOnTicket}` publishes the field as an agent tool and adds `data-akan-action` / `data-akan-state` to the control. `onChange={(size) => st.do.setSizeOnTicket(size)}` runs the same and publishes nothing.

Related pages

- Writing a Template — Where the model-field controls live and how a module form is laid out.

- Override Slots — Re-skin the controls on this page for one route subtree.

- In-Page Agent — How a setter passed by reference becomes a tool the agent can call.

- Field: The form-field namespace a module Template is written in. `<Field>` itself is a section wrapper with a label row; every member is one labelled control. The members differ mainly in the shape of `value`.

  - Field ({ label?, desc?, nullable?, className?, containerClassName?, labelClassName?, children? }): Section wrapper: draws the label row, then stacks its children in a `gap-4` column.

  - Field.Label ({ label, desc?, unit?, nullable?, mode? }): The label row: capitalizes a string label, tooltips `desc`, adds `(optional)` when `nullable`.

  - Field.Text ({ value: string | null, minlength? = 2, maxlength? = 200, inputStyleType? }): One line of text. `inputStyleType` is `bordered` (default), `borderless` or `underline`.

  - Field.TextArea ({ value: string | null, rows? = 3, minlength? = 2, maxlength? = 1000 }): Multi-line text, three rows tall by default.

  - Field.Email ({ value: string | null, maxlength? = 80, inputStyleType? }): Text that must be a valid email address.

  - Field.Phone ({ value: string | null, maxlength? = 13 }): Text that must be a phone number. The default `transform` formats it with dashes.

  - Field.Password ({ value, confirmValue?, onChangeConfirm?, showConfirm?, minlength? = 8, maxlength? = 20 }): Masked text with a show/hide eye. `showConfirm` adds a second box that must match.

  - Field.Number ({ value: number | null, min?, max?, unit?, formatter?, parser? }): One number. `unit` shows in the label; `formatter` / `parser` convert the digits shown.

  - Field.DoubleNumber ({ value: [number, number] | null, min?, max?, separator? }): Two numbers in one row, such as a range, a ratio or a coordinate. `min` / `max` are pairs too.

  - Field.Date ({ value: Dayjs | null, min?, max?, showTime? }): One date on the browser's native input. `showTime` adds the time of day.

  - Field.DateRange ({ from, to, onChangeFrom, onChangeTo, onChange?, min?, max?, showTime? }): Two ends of a range. `onChange(from, to)` fires only once both ends are set.

  - Field.Switch ({ value: boolean | null, onDesc?, offDesc? }): A labelled boolean. `onDesc` / `offDesc` describe the current position beside the toggle.

  - Field.ToggleSelect ({ items, value: I | null, nullable?, validate?, btnClassName? }): One choice as a row of buttons. An `enumOf(...)` in `items` gets each value translated.

  - Field.MultiToggleSelect ({ items, value: I[] | null, minlength?, maxlength? }): Many choices in the same row. `minlength` / `maxlength` show translated messages.

  - Field.TextList ({ value: string[] | null, minlength?, maxlength?, minTextlength?, maxTextlength? }): Ordered strings, one input each. Drag to reorder; remove any row.

  - Field.Tags ({ value: string[] | null, minTextlength? = 2, maxTextlength? = 10 }): Unordered short strings drawn as badges, with an inline add box.

  - Field.List ({ value: Item[] | null, onAdd, renderItem: (item, idx) => ReactNode }): Embedded objects. You render one row; the field draws the frame and add/remove buttons.

  - Field.Parent ({ value: Light | null, slice, renderOption, onSearch? }): One related model as its Light instance. Options load from `slice`, e.g. `fetch.slice.user`.

  - Field.ParentId ({ value: string | null, slice, onChange: (id, model) => void }): The same picker for an `ID` field: holds the id and passes the model as a second argument.

  - Field.Children ({ value: Light[] | null, slice, renderOption }): Many related models as Light instances.

  - Field.ChildrenId ({ value: string[] | null, slice, renderOption }): Many related models as ids.

  - **Shared props.** Most members take `value` / `onChange`, `label` / `desc`, `nullable`, `disabled`, `placeholder`, `transform`, `validate` and `className` / `labelClassName` / `inputClassName`.

  - **Minimum length.** `Text`, `TextArea`, `Email` and `Password` flag input shorter than `minlength`: 2 by default, 8 for `Password`, 0 when `nullable`. Lower it for short values such as initials.

  - **Setter by reference.** `onChange={st.do.setNameOnUser}` publishes the field as an agent tool. An inline arrow runs the same and publishes nothing.

  - **Wrappers stay legal.** Transforming the value, adding a statement or writing a nested path with `writeOnX` is fine. Normalize with the control's `transform` prop where you can, and publish the rest with `st.tool`.

  - **More members in a lib.** `@libs/shared/ui` re-exports `Field` with `Rich`, `Coordinate`, `Postcode`, `Img` / `Imgs` and `File` / `Files` added.

- Input: Controlled inputs without the label row, for a search box, a filter bar or an inline cell editor. Each member is its own override slot: `Input`, `InputTextArea`, `InputPassword`, `InputEmail`, `InputNumber` and `InputCheckbox` can be re-skinned separately.

  - value (string): The current text. The input keeps no copy of its own.

  - onChange ((value, event?) => void): Receives the next string.

  - validate ((value) => boolean | string): `true` when valid; `false` or a message shows an error under the input.

  - nullable (boolean): Lets an empty value pass without a warning.

  - inputStyleType ("bordered" | "borderless" | "underline", default "bordered"): The surface the input is drawn on.

  - icon (ReactNode): A leading icon.

  - onPressEnter ((value, event) => void): Called on Enter: a search box without a form element.

  - onPressEscape ((event) => void): Called on Escape, after the input loses focus.

  - Input.TextArea / Password / Email ({ value: string, validate, onChange? }): The same contract, with `validate` required. `Email` also rejects a malformed address.

  - Input.Number ({ value: number | null, onChange, formatter?, parser? }): A number or `null`. `formatter` / `parser` convert the text shown.

  - Input.Checkbox ({ checked, onChange: (checked, event) => void }): A native checkbox tinted with the primary color.

  - **Native attributes pass through.** `placeholder`, `maxLength`, `autoFocus` and the rest reach the `<input>` unchanged.

- Select: A controlled dropdown for plain values, `{ label, value }` pairs or an `enumOf(...)` class, with single, multiple and searchable modes. The option list portals to `document.body` at the field's width, so a scrolling modal or a table never clips it.

  - value (T | T[]): The selected value; an array when `multiple` is on.

  - onChange ((value, prev) => void): Receives the next value and the previous one.

  - options (T[] | { label, value }[] | enumOf class): The choices. An enum shows its raw values; pass pairs for translated labels.

  - label / desc (ReactNode): An optional label row above the field, with `desc` as a help tooltip.

  - multiple (boolean): Allows several values.

  - searchable (boolean): Adds a text box that filters the options by label. Non-string values then need pairs.

  - onSearch ((text) => void): Called 300 ms after typing stops, in place of the local filter.

  - nullable (boolean): Adds a clear row to the list and a clear button to the field.

  - loading (boolean): Shows a spinner instead of the empty placeholder while options load.

  - onOpen (() => void): Called when the list opens: the place to load options lazily.

  - renderOption / renderSelected ((value) => ReactNode): Custom drawing for a list row and for the chosen value.

  - placeholder / empty (string / ReactNode): The text shown with nothing selected, and what an empty option list shows.

  - disabled (boolean): Blocks opening and picking; the published tool is withdrawn too.

- Switch: A boolean drawn as `<button role="switch">`, so focus and Space/Enter toggling come from the browser. Pass `checked` to control it, or `defaultChecked` to let it keep its own state. For a model field with a label row, use `Field.Switch`.

  - checked (boolean): Controlled state. Leave it out and the switch keeps its own.

  - defaultChecked (boolean, default false): The starting position when uncontrolled.

  - onChange ((checked: boolean) => void): Receives the next position. A form setter passed by reference is published to the agent.

  - variant ("primary" | "accent" | "success", default "primary"): The color of the on position. The off position is always `bg-muted`.

  - disabled (boolean): Blocks the toggle and dims it; the published tool is withdrawn too.

  - **Only a form setter becomes a tool.** `set<Field>On<Model>` is published; a plain store setter such as `setNotify` below only marks the control with `data-akan-action` / `data-akan-state`.

  - **Inside a `Dropdown` menu item,** put `data-dropdown-keep-open` on the `<li>` so flipping the switch does not close the menu.

- Radio: One choice from a `role="radiogroup"` of `role="radio"` buttons; arrow keys move the focus and the choice together. Each child carries its own `value`, and the group matches on it. A numeric `value` counts as an index only when no child owns it.

  - value (string | number | null): The selected child's `value`, or a position when no child declares one.

  - onChange ((value, idx) => void): Receives the chosen child's `value` and its index. Arrow keys call it too.

  - disabled (boolean): Disables every option.

  - children (ReactNode | ReactElement[]): The options, usually `Radio.Item`s. The group draws the dot and the row around each.

  - Radio.Item ({ value, children, className?, checked?, onChange? }): One option's body. It has its own override slot, `RadioItem`, apart from the group's.

  - **No agent tool.** For a model field, use `Field.ToggleSelect`, which publishes one.

- ToggleSelect: A choice as a row of pressed buttons instead of a dropdown, for a few short options. `ToggleSelect` picks one and `ToggleSelect.Multi` picks many. `nullable` and `validate` are required: a button row has no empty state to fall back on, so the call site decides both.

  - items (string[] | number[] | { label, value, disabled? }[]): The cells. `Field.ToggleSelect` also takes an `enumOf(...)` and translates each value.

  - value (I): The selected value.

  - nullable (boolean): Required. Whether the choice can be cleared; pressing the selected cell then calls `onClear`.

  - validate ((value) => boolean | string): Required. Returns `true`, or the message to show under the row.

  - onChange / onClear ((value, idx) => void / () => void): The pick and the clear. `onClear` fires only in the `nullable` form.

  - disabled (boolean): Disables every cell. An item's own `disabled` disables just that cell.

  - renderItem ((item, { selected, disabled, onToggle }) => ReactNode): Draws one cell. `onToggle` is the cell's own action; put it on whatever the cell renders.

  - ToggleSelect.Multi ({ items, value: string[] | number[], nullable, validate, onChange }): The many-choice form, with its own override slot, `ToggleSelectMulti`.

  - **No agent tool.** For a model field, use `Field.ToggleSelect` / `Field.MultiToggleSelect`: they add the label row and publish the setter.

- DatePicker: A date on the browser's own `<input type="date">`, so the calendar, locale and touch keyboard are the platform's. The browser enforces `min` and `max`. A native field cannot grey out single days, so a pick that `disabledDate` rejects is refused with a warning toast.

  - value (Dayjs | null): The current value.

  - onChange ((value: Dayjs | null) => void): Receives the next value.

  - showTime (boolean): Switches the native input to `datetime-local`.

  - min / max (Dayjs | null): The earliest and latest values the browser lets you pick.

  - disabledDate ((date: Dayjs) => boolean | null | undefined): Returns `true` for a date to refuse. It is checked on pick, not greyed out.

  - defaultValue (Dayjs): Sent through `onChange` on mount, and again whenever it changes.

  - DatePicker.RangePicker ({ value: [Dayjs | null, Dayjs | null], onChange, showTime?, disabledDate? }): Both ends as one tuple; an empty other end is filled with now. Slot `DatePickerRangePicker`.

  - DatePicker.TimePicker ({ value: Dayjs | null, onChange, disabled?, disabledDate? }): The time alone, kept on the day `value` already holds. Slot `DatePickerTimePicker`.

  - **No agent tool.** For a model field, use `Field.Date` / `Field.DateRange`: they draw their own native input with a label row and publish the setter.

- Button: The one button primitive. A synchronous `onClick` renders a plain button; returning a promise puts the same button through loading, success or error, and blocks repeat clicks meanwhile. There is no separate async button to choose.

  - onClick ((event, { onError }) => Promise<Result> | Result): Optional. A returned promise turns on the async states; anything else keeps it plain.

  - onSuccess ((result) => void): Called with the result after the success check has shown for 0.7 s.

  - loadingMode ("hold" | "replace", default "hold"): The box never resizes: `hold` overlays a spinner, `replace` cross-fades to a labelled one.

  - showError (boolean, default true): Shows the `onError` message under the button. Off, nothing shows it; toast it yourself.

  - variant / size / shape / outline (ButtonVariants, default "primary" / "md" / "default"): The `buttonRecipe` look: color, size, corner shape and the outline flag.

  - type ("button" | "submit" | "reset", default "button"): The native type. It defaults to `button`, so a click never submits a surrounding form.

  - disabled (boolean): Native prop. The button is also disabled while loading and during the success check.

  - **Fail without throwing.** Call `onError("<dictionary key>")`: the success check is skipped and the key shows translated under the button.

  - **A rejected promise resets quietly.** The button returns to idle without a check; the store action or fetch that threw has already shown the error.

  - **Two ways to re-skin.** The override slot `Button` replaces the whole component; the recipe slot `recipes.button` swaps only its look.

## Code Examples

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx

```ts
"use client";
import { cnst, st, usePage } from "@apps/koyo/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("icecreamOrder.name")}
        value={icecreamOrderForm.name}
        onChange={st.do.setNameOnIcecreamOrder}
      />
      <Field.ToggleSelect
        label={l("icecreamOrder.size")}
        items={cnst.IcecreamOrderSize}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />
      <Field.Number
        label={l("icecreamOrder.price")}
        unit="KRW"
        value={icecreamOrderForm.price}
        onChange={st.do.setPriceOnIcecreamOrder}
      />
      <Field.Tags
        label={l("icecreamOrder.toppings")}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
    </Layout.Template>
  );
};
```

### apps/koyo/ui/Search.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Input } from "akanjs/ui";

interface SearchProps {
  query: string;
  onChangeQuery: (query: string) => void;
  onSearch: (query: string) => void;
}
export const Search = ({ query, onChangeQuery, onSearch }: SearchProps) => {
  const { l } = usePage();
  return (
    <Input
      value={query}
      onChange={onChangeQuery}
      onPressEnter={onSearch}
      placeholder={l.trans({ en: "Search", ko: "검색" })}
      inputStyleType="underline"
    />
  );
};
```

### apps/koyo/ui/StatusFilter.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Select } from "akanjs/ui";

interface StatusFilterProps {
  status: string;
  onChange: (status: string) => void;
}
export const StatusFilter = ({ status, onChange }: StatusFilterProps) => {
  const { l } = usePage();
  return (
    <Select
      label={l.trans({ en: "Status", ko: "상태" })}
      value={status}
      options={[
        { label: l.trans({ en: "Ready", ko: "대기" }), value: "ready" },
        { label: l.trans({ en: "Done", ko: "완료" }), value: "done" },
      ]}
      onChange={onChange}
    />
  );
};
```

### apps/koyo/ui/NotifyToggle.tsx

```ts
"use client";
import { st } from "@apps/koyo/client";
import { Switch } from "akanjs/ui";

export const NotifyToggle = () => {
  const notify = st.use.notify();
  return (
    <Switch checked={notify} onChange={st.do.setNotify} variant="accent" />
  );
};
```

### apps/koyo/ui/PlanPicker.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Radio } from "akanjs/ui";

interface PlanPickerProps {
  plan: string;
  onChange: (plan: string | number | null) => void;
}
export const PlanPicker = ({ plan, onChange }: PlanPickerProps) => {
  const { l } = usePage();
  return (
    <Radio value={plan} onChange={onChange}>
      <Radio.Item value="basic">
        {l.trans({ en: "Basic", ko: "베이직" })}
      </Radio.Item>
      <Radio.Item value="pro">
        {l.trans({ en: "Pro", ko: "프로" })}
      </Radio.Item>
    </Radio>
  );
};
```

### apps/koyo/ui/SizePicker.tsx

```ts
"use client";
import { ToggleSelect } from "akanjs/ui";

interface SizePickerProps {
  size: number;
  onChange: (size: number) => void;
}
export const SizePicker = ({ size, onChange }: SizePickerProps) => {
  return (
    <ToggleSelect
      items={[50, 100, 200]}
      value={size}
      nullable={false}
      validate={() => true}
      onChange={onChange}
    />
  );
};
```

### apps/koyo/ui/PeriodFilter.tsx

```ts
"use client";
import type { Dayjs } from "akanjs/base";
import { DatePicker } from "akanjs/ui";

interface PeriodFilterProps {
  period: [Dayjs | null, Dayjs | null];
  onChange: (period: [Dayjs | null, Dayjs | null]) => void;
}
export const PeriodFilter = ({ period, onChange }: PeriodFilterProps) => {
  return (
    <DatePicker.RangePicker value={period} onChange={onChange} showTime />
  );
};
```

### apps/koyo/ui/Actions.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Button } from "akanjs/ui";

interface ActionsProps {
  onClose: () => void;
  onSave: () => Promise<{ ok: boolean }>;
}
export const Actions = ({ onClose, onSave }: ActionsProps) => {
  const { l } = usePage();
  return (
    <div className="flex gap-2">
      <Button variant="ghost" onClick={onClose}>
        {l.trans({ en: "Close", ko: "닫기" })}
      </Button>
      <Button
        onClick={async (_event, { onError }) => {
          const result = await onSave();
          if (!result.ok) onError("base.error");
          return result;
        }}
      >
        {l("base.save")}
      </Button>
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

