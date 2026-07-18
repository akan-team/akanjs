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
- Template Usage Patterns (#template-usage)
- Practical Rules (#practical-rules)

## Content

Model.Template.tsx

Stores the hydrated full model when editing an existing record.

Marks the model data as ready after the edit object is applied.

Stores the editable form copy made from the full model. Template fields read and update this state.

Marks the form as ready so the edit form can render and submit.

Stores the current form mode. Load.Edit normally sets it to edit unless a custom modal key is provided.

Stores the timestamp from the edit object for consistency with view/edit state.

model.Template.tsx

A Template file contains client UI pieces for a module. Most Templates render model forms, but they can also export smaller interaction fragments such as submit buttons, onboarding steps, or preview blocks.

Templates should bind UI to store state and actions. Business rules should stay in constants, documents, services, signals, or store actions.

File Convention

Template files live beside the module they render. They usually need client hooks and event handlers, so they start with the use client directive.

Standard Form Template

A standard form Template reads form state from st.use, gets labels from usePage, and writes changes through generated st.do setters.

Field Patterns

Field components are predefined elements for fast development and standardized form UI. Pick the smallest Field component that matches the input shape, then connect value and onChange to store state.

You can also build custom UI with plain input, button, or any app-specific component when Field does not match the interaction you need.

Split Components

A Template file can export several small components. Split large forms by business step or UI responsibility instead of forcing everything into General.

Template Usage Patterns

Wrappers such as Load.Edit, Model.Edit, and Model.NewWrapper prepare store form state and submit behavior. Templates stay focused on rendering fields and small interactions.

Server Page With Load.Edit

Use Load.Edit in server-rendered pages when the page already knows the edit object. The server page can fetch data or build a partial form, then pass it to Load.Edit. The child Template is still a client component.

Internally, Load.Edit delegates to Model.EditModal. It hydrates the model and form state before the Template fields read st.use.<model>Form().

Modal Edit With Model.Edit

Use Model.Edit when a list, dropdown, or unit component needs an edit trigger. It renders the clickable edit control and the matching edit modal around the Template.

New Form Trigger With Model.NewWrapper

Use Model.NewWrapper when a button or empty-list CTA should open a new form. partial supplies default form values, and the wrapper calls the generated new<Model> action for the slice.

Practical Rules

Use Layout.Template for form layouts that need consistent spacing.

Use dictionary keys for label and desc instead of hard-coded field text.

Bind Field onChange directly to generated st.do setters when possible.

Use plain input, button, or custom components when predefined Field components do not fit the UI.

Keep business decisions out of Templates. Move them to constants, stores, services, or signals.

Split large forms into named components such as General, Phone, SubmitPhone, or Preview.

Use Load.Edit for server pages with prepared edit data, Model.Edit for modal edit triggers, and Model.NewWrapper for new-form buttons.

## Code Examples

### Ticket.Template.tsx

```ts
"use client";
import { st, usePage } from "@apps/akan/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface TicketEditProps {
  className?: string;
}

export const General = ({ className }: TicketEditProps) => {
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

### Field.Parent

```ts
<Field.Parent
  slice={fetch.slice.projectInSelf}
  label={l("ticket.project")}
  value={ticketForm.project}
  onChange={st.do.setProjectOnTicket}
  renderOption={(project) => project.name}
/>
```

### Field.ToggleSelect

```ts
<Field.ToggleSelect
  label={l("ticket.type")}
  items={cnst.TicketType}
  value={ticketForm.type}
  onChange={st.do.setTypeOnTicket}
/>
```

### Field.Img

```ts
<Field.Img
  slice={fetch.slice.bizCard}
  label={l("bizCard.frontImage")}
  value={bizCardForm.frontImage}
  onChange={st.do.setFrontImageOnBizCard}
  nullable
/>
```

### Field.Yoopta

```ts
<Field.Yoopta
  label={l("ticket.content")}
  slice={fetch.slice.ticket}
  valuePath="content"
  value={ticketForm.content}
  onChange={st.do.setContentOnTicket}
  addFile={st.do.addContentFilesOnTicket}
/>
```

### User.Template.tsx

```ts
export const Phone = ({ userId, redirect }: PhoneProps) => {
  const phone = st.use.phone();
  return (
    <Input
      value={phone}
      onChange={(value) => st.do.setPhone(formatPhone(value))}
      onPressEnter={() => {
        if (!userId || !isPhoneNumber(phone)) return;
        void st.do.setPhoneInPrepareUser(userId, phone, { redirect });
      }}
    />
  );
};
```

### Submit component

```ts
export const SubmitPhone = ({ userId, redirect }: SubmitPhoneProps) => {
  const phone = st.use.phone();
  return (
    <button disabled={!isPhoneNumber(phone)} onClick={() => st.do.setPhoneInPrepareUser(userId, phone, { redirect })}>
      Send Code
    </button>
  );
};
```

### new.tsx

```ts
export default async function Page() {
  const pickupInPhoneForm: Partial<cnst.Pickup> = {};
  return (
    <Load.Edit
      slice={fetch.slice.pickupInPhone}
      edit={pickupInPhoneForm}
      type="form"
      onCancel="back"
      onSubmit="/pickup/success?pickupId=[pickupId]"
    >
      <Pickup.Template.General />
    </Load.Edit>
  );
}
```

### edit.tsx

```ts
const { story, storyEdit } = await fetch.editStory(storyId);

<Load.Edit slice={fetch.slice.storyInRoot} edit={storyEdit} type="form" onSubmit="back">
  <Story.Template.General storyId={story.id} />
</Load.Edit>
```

### Ticket.Util.tsx

```ts
<Model.Edit renderTitle="title" slice={fetch.slice.ticket} modelId={ticketId}>
  <Ticket.Template.General />
</Model.Edit>
```

### Release.Zone.tsx

```ts
<Model.NewWrapper partial={{ devApp }} slice={fetch.slice.releaseInDevApp}>
  <button className="btn btn-secondary">+ New</button>
</Model.NewWrapper>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

