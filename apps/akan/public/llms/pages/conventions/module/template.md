# Model.Template.tsx

- Source: /conventions/module/template
- Mirror: /llms/pages/conventions/module/template.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.Template.tsx (#template-overview)
- File Convention (#file-convention)
- Standard Form Template (#standard-form-template)
- Field Patterns (#field-patterns)
- Split Components (#split-components)
- Opening A Template (#template-usage)
- Rules At A Glance (#practical-rules)

## Content

Model.Template.tsx

Left as it was.

model.Template.tsx

`<Model>.Template.tsx` is a module's form: the fields a person fills in to create or edit one record. Most exports are whole forms, but a Template may also export a small piece of one, such as a submit button, an onboarding step or a preview block.

A Template only connects the screen to the store. Anything that needs a decision lives somewhere else:

The work

Template — *.Template.tsx

Elsewhere

- Drawing the form

  - Field.*: Labelled controls, each bound to one field of the form draft.

  - submit button · step · preview: Small interaction pieces that belong to one form.

  - l("<model>.<field>"): Labels and help text from the module dictionary.

- Deciding and saving

  - business rule: Validation and state transitions go in constant, document and service.

  - access check: Who may save is decided by the guards in the signal.

  - fetch.*: A server call and its toasts go in a store action.

  - open · load · submit: An edit shell does this around the Template.

Belongs here

Not here

Words used on this page

Term

- <model>Form: The store's draft of the record being edited, such as `ticketForm`.

- st.do.set<Field>On<Model>: The setter the store generates for each field, such as `setTitleOnTicket`.

- fetch.slice.<name>: Tells a Field or a shell which model and which list it works with.

- edit shell: A wrapper such as `Load.Edit` or `Model.Edit` that loads, opens and submits the form.

File Convention

A Template sits in the module folder, beside the model it edits. Every field reads and writes the store, which exists only in the browser, so its first line is always `"use client"`.

- Path — `apps/<app>/lib/<model>/<Model>.Template.tsx` — Database and scalar modules may have one. Service modules may not.

- First Line — `"use client";` — Always, on line 1 above the imports.

- Exports — `General · Phone · SubmitPhone · PhoneCode` — Named arrow components. General is the model's main form.

- Used As — `<Ticket.Template.General />` — Pages and shells reach it through the model namespace from @apps/<app>/client.

**Name the main form `General`.** `Model.AdminPanel` uses `Template.General` as its form, and falls back to the first export.

**No `useState` in a Template.** Form values live in the store. `akan quality ssr` flags any `useState` in a Template as `akan.ssr.template-client-state`.

Standard Form Template

A standard form reads the draft from the store, takes its labels from the dictionary, and writes each field through a generated setter:

**`st.use.ticketForm()` reads the draft.** The form re-renders whenever the draft changes.

**`label` and `desc` are dictionary keys.** `desc` shows as a help tooltip beside the label.

**`st.do.setTitleOnTicket` is generated.** The store makes one setter per field, and you hand it over as it is.

**`Layout.Template` spaces the fields evenly.** The caller can still adjust it through `className`.

**Pass the setter by reference, never inside an arrow.** `onChange={(v) => st.do.setTitleOnTicket(v)}` works the same for a person, but the field is no longer published to the in-page agent, and lint rejects it (`no-unpublished-form-setter`). To clean up a value, use the Field's `transform` prop; to write another field too, add a `_postSet<Field>` method to the store.

Field Patterns

`Field.*` components are ready-made form controls with a label row. Pick the one that matches the model field, then connect `value` and `onChange` to the store.

Model field

Field

Note

- String — Field.Text — `TextArea`, `Email`, `Phone` and `Password` are variants for special text.

- Int · Float — Field.Number — `DoubleNumber` holds two numbers in one row, such as a range.

- Boolean — Field.Switch — A labelled on/off toggle.

- Date — Field.Date — `showTime` adds the time of day, and `DateRange` takes a from/to pair.

- enumOf(...) — Field.ToggleSelect — Each value gets a translated label, and `MultiToggleSelect` takes an array.

- [String] — Field.Tags — `TextList` keeps the order and lets the user drag rows.

- relation to a model — Field.Parent — `Children` takes an array, and `ParentId` / `ChildrenId` take `ID` fields.

- File — Field.Img — `Imgs` takes `[File]` and `File` / `Files` take other files, all from `@libs/shared/ui`.

- rich text — Field.Rich — A rich-text editor with attachments, from `@libs/shared/ui`.

- embedded objects — Field.List — You render one row; the field draws the add and remove buttons.

The basic members come from `akanjs/ui`. `Field` from `@libs/shared/ui` holds them all and adds `Rich`, `Img`, `Imgs`, `File`, `Files`, `Coordinate` and `Postcode`, so import it from there. Here are four fields that need more than `value` and `onChange`, added to the same form:

**`Field.Parent` picks a related model.** The options come from the `slice` list, and `renderOption` draws each one.

**`Field.ToggleSelect` takes an `enumOf` class as `items`.** Each value becomes a translated button.

**`Field.Img` uploads through `slice`.** It stores the uploaded `File` in the form, and `nullable` marks the label as optional.

**`Field.Rich` needs `valuePath`, the field's key in the form.** `addFile` receives each file uploaded in the editor, here the generated `add<Field>On<Model>` of a `[File]` field.

When no Field fits the interaction, `Input` from `akanjs/ui`, a button or your own app component is fine, but never a bare `<input>` for a model field. The full prop list of every member is in Form Controls, linked at the end of this page.

Split Components

A Template can export several small components. Split a large form by business step or by UI job, instead of putting everything into `General`.

The `user` module in `libs/shared` splits phone sign-up into an input and the button that sends the code. Here it is, trimmed:

**One export per piece.** A page places `<User.Template.Phone />` and `<User.Template.SubmitPhone />` wherever its layout needs them.

**The pieces share state through the store.** Both read `st.use.phone()`, so no props pass between them.

**The setter still goes by reference.** The store's `setPhone` formats the number itself, so the input needs no wrapper.

**A call with arguments goes in an arrow.** `onPressEnter` and `onClick` hand `userId` and `phone` to a store action, called with `void`.

Opening A Template

A Template only draws fields. An edit shell around it fills the form state, opens the form and submits it. Pick the shell by where the form opens:

Shell

Use it when

What it draws

- Load.Edit — A page already holds the record to edit, or a partial new form. — The form in the page, in a modal, or as bare fields, chosen by `type`.

- Model.Edit — A list row, a dropdown or a Unit needs an edit button. — An Edit button, or your `trigger`, plus the edit modal.

- Model.New — A screen needs a button that creates a record. — A New button, or your `trigger`, plus the form modal.

- Model.NewWrapper — Any element, such as an empty-list call to action, should open a new form. — Only the trigger, so pair it with a `Model.EditModal`.

**The shell keeps a draft, so never save form values yourself.** It stores the form as the user types and offers it back on the next open. `draft={false}` turns this off, and `draft="<scope>"` names the scope when neither the id nor the seed identifies it.

Load.Edit in a page

Use `Load.Edit` when the page already knows what to edit. The Template inside stays a client component. For a new record, pass a partial model as `edit`:

To edit an existing record, fetch its edit object with `fetch.edit<Model>` and pass that instead:

**`type` picks where the form appears.** `"form"` draws it in the page with a submit button, and `"empty"` draws the fields alone. The default `"modal"` draws it in a modal.

**`onSubmit` and `onCancel` take `"back"`, `"reset"` or a path.** In a path, `[ticketId]` becomes the id of the saved record.

**`edit` may be an unawaited promise.** `const { ticketEdit } = fetch.editTicket(ticketId)` streams it in; a skeleton, or your `loading`, shows until it lands.

Before the Template renders, Load.Edit writes these keys into the store:

State key

Given an edit object

Given a partial form

- <model> — The full model, built from the edit object. — `null`

- <model>Loading — `false` — Left as it was.

- <model>Form — An editable copy of the model. — The default values merged with `edit`.

- <model>FormLoading — `false` — `false`

- <model>Modal — The `modal` prop, or `"edit"`. — The `modal` prop, or `"edit"`.

- <model>ViewAt — When the server read the record, used to re-read a stale one. — Left as it was.

Model.Edit for an edit modal

Use `Model.Edit` when a list row, a dropdown or a Unit needs an edit button. It draws the button and the modal that holds the Template:

**A click loads the record.** The button calls `st.do.editTicket(ticketId)`, which fetches it into the form and opens the modal.

**`renderTitle="title"` titles the modal** with the model name and the form's `title`. `trigger` replaces the default Edit button.

Model.NewWrapper to open a new form

`Model.NewWrapper` turns any element into a button that opens a new form. It draws only the trigger, so a `Model.EditModal` for the same slice draws the Template:

**`partial` seeds the form.** A click calls the generated `st.do.newTicket()` with it as the starting values.

**`Model.New` is this pair in one component.** Reach for `Model.NewWrapper` when the trigger and the modal sit in different places.

Rules At A Glance

Everything above, as a checklist to run before you finish a Template:

**`"use client"` on line 1, always.** A Template reads the store, which only the browser has.

**Wrap the fields in `Layout.Template`** so every form keeps the same spacing.

**Take every label from the dictionary.** Write `label={l("ticket.title")}` and `desc={l("ticket.title.desc")}`, never hard-coded text.

**Pass generated setters by reference.** Clean a value with the Field's `transform`, not with an arrow around the setter.

**Keep form values in the store, not in `useState`.** Read the form with `st.use.<model>Form()`.

**Use a plain control when no Field fits.** `Input`, a button or your own component is fine, but a model field never gets a bare `<input>`.

**Keep business decisions out.** They belong in constant, document, service, signal or a store action, and a Template calls no `fetch.*`.

**Split large forms into named components** such as `General`, `Phone` and `SubmitPhone`.

**Let a shell open the form.** `Load.Edit` for a page that has the data, `Model.Edit` for an edit modal, `Model.New` or `Model.NewWrapper` for a new-form button.

Read next

- Form Controls — Every Field member with its props and defaults.

- model.store.ts — Where the form draft and the generated setters come from.

- Model.Zone.tsx — The page section that hosts buttons which open a Template.

- In-Page Agent — Why a setter passed by reference becomes a tool the agent can call.

## Code Examples

### apps/koyo/lib/ticket/Ticket.Template.tsx

```ts
"use client";
import { st, usePage } from "@apps/koyo/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const ticketForm = st.use.ticketForm();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("ticket.title")}
        desc={l("ticket.title.desc")}
        value={ticketForm.title}
        onChange={st.do.setTitleOnTicket}
      />
    </Layout.Template>
  );
};
```

### apps/koyo/lib/ticket/Ticket.Template.tsx

```ts
"use client";
import { cnst, fetch, st, usePage } from "@apps/koyo/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const ticketForm = st.use.ticketForm();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("ticket.title")}
        value={ticketForm.title}
        onChange={st.do.setTitleOnTicket}
      />
      <Field.Parent // [!code ++:7]
        label={l("ticket.project")}
        slice={fetch.slice.projectInSelf}
        value={ticketForm.project}
        onChange={st.do.setProjectOnTicket}
        renderOption={(project) => project.name}
      />
      <Field.ToggleSelect // [!code ++:6]
        label={l("ticket.type")}
        items={cnst.TicketType}
        value={ticketForm.type}
        onChange={st.do.setTypeOnTicket}
      />
      <Field.Img // [!code ++:7]
        label={l("ticket.image")}
        slice={fetch.slice.ticket}
        value={ticketForm.image}
        onChange={st.do.setImageOnTicket}
        nullable
      />
      <Field.Rich // [!code ++:8]
        label={l("ticket.content")}
        slice={fetch.slice.ticket}
        valuePath="content"
        value={ticketForm.content}
        onChange={st.do.setContentOnTicket}
        addFile={st.do.addContentFilesOnTicket}
      />
    </Layout.Template>
  );
};
```

### libs/shared/lib/user/User.Template.tsx

```ts
"use client";
import { st, usePage } from "@libs/shared/client";
import { isPhoneNumber } from "akanjs/common";
import { buttonRecipe, Input } from "akanjs/ui";

interface PhoneProps {
  userId?: string;
  redirect?: string;
}
export const Phone = ({ userId, redirect }: PhoneProps) => {
  const phone = st.use.phone();
  return (
    <Input
      type="tel"
      value={phone}
      onChange={st.do.setPhone}
      onPressEnter={() => {
        if (!userId || !isPhoneNumber(phone)) return;
        void st.do.setPhoneInPrepareUser(userId, phone, { redirect });
      }}
    />
  );
};

interface SubmitPhoneProps {
  userId: string;
  redirect: string;
}
export const SubmitPhone = ({ userId, redirect }: SubmitPhoneProps) => {
  const { l } = usePage();
  const phone = st.use.phone();
  return (
    <button
      className={buttonRecipe({ variant: "primary" })}
      disabled={!isPhoneNumber(phone)}
      onClick={() => {
        void st.do.setPhoneInPrepareUser(userId, phone, { redirect });
      }}
    >
      {l("user.sendPhoneCode")}
    </button>
  );
};
```

### apps/koyo/page/ticket/new.tsx

```ts
import { cnst, fetch, Ticket } from "@apps/koyo/client";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page().render(() => {
  const ticketForm: Partial<cnst.Ticket> = {};
  return (
    <Load.Edit
      slice={fetch.slice.ticket}
      edit={ticketForm}
      type="form"
      onCancel="back"
      onSubmit="/ticket/[ticketId]"
    >
      <Ticket.Template.General />
    </Load.Edit>
  );
});
```

### apps/koyo/page/ticket/[ticketId]/edit.tsx

```ts
import { fetch, Ticket } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("ticketId", ID)
  .render(async ({ ticketId }) => {
    const [{ ticketEdit }] = await Promise.all([fetch.editTicket(ticketId)]);
    return (
      <Load.Edit
        slice={fetch.slice.ticket}
        edit={ticketEdit}
        type="form"
        onSubmit="back"
      >
        <Ticket.Template.General />
      </Load.Edit>
    );
  });
```

### apps/koyo/lib/ticket/Ticket.Util.tsx

```ts
"use client";
import { fetch, Ticket } from "@apps/koyo/client";
import { Model } from "akanjs/ui";

interface EditProps {
  ticketId: string;
}
export const Edit = ({ ticketId }: EditProps) => {
  return (
    <Model.Edit
      renderTitle="title"
      slice={fetch.slice.ticket}
      modelId={ticketId}
    >
      <Ticket.Template.General />
    </Model.Edit>
  );
};
```

### apps/koyo/lib/ticket/Ticket.Zone.tsx

```ts
<>
  <Model.NewWrapper
    partial={{ project }}
    slice={fetch.slice.ticketInProject}
  >
    <button className={buttonRecipe({ variant: "secondary" })}>
      {l("ticket.newTicket")}
    </button>
  </Model.NewWrapper>
  <Model.EditModal
    renderTitle="title"
    slice={fetch.slice.ticketInProject}
  >
    <Ticket.Template.General />
  </Model.EditModal>
</>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

