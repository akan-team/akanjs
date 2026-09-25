# Model.Util.tsx

- Source: /conventions/module/util
- Mirror: /llms/pages/conventions/module/util.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.Util.tsx (#util-overview)
- File Convention (#file-convention)
- Model Wrapper Actions (#model-wrapper-actions)
- Dialog And Modal Actions (#dialog-modal-actions)
- Query And Context Utilities (#query-context-utils)
- Practical Rules (#practical-rules)

## Content

Model.Util.tsx

model.Util.tsx

A Util file contains small client-side helper components for a module. It is a good home for action buttons, toolboxes, dialog triggers, query controls, and context-aware navigation pieces.

Use Util to keep Page, Zone, Unit, Template, and View files focused. Util components should package interaction UI, not own core business rules.

File Convention

Util files usually use client hooks and event handlers, so they start with the use client directive. Export named components that describe the action or helper clearly.

Model Wrapper Actions

Many Util components are small controls around generated model wrappers. A toolbox can collect edit, remove, and other model actions without making the Unit or Zone file noisy.

Dialog And Modal Actions

Use Util when an action needs its own dialog, confirmation UI, or small local state. Local component state is fine when it only belongs to that interaction.

Query And Context Utilities

Util files are also useful for query panels and route-aware helper UI. They can read store state and route context, then call generated store actions or router helpers.

Practical Rules

Use usePage for labels instead of hard-coded action text.

Call st.do actions or Model wrappers from Util components; keep core business rules elsewhere.

Use local state only for UI-only interaction values such as an opened dialog or selected option.

Keep props explicit so the caller can see which model id, slice, role, or name the action depends on.

Split big toolboxes or workflow modals into named exports instead of hiding too much in one component.

## Code Examples

### Project.Util.tsx

```ts
export const Toolbox = ({ projectId, name, role }: ToolboxProps) => {
  return (
    <ul className="dropdown-content menu">
      <li>
        <Model.Edit renderTitle="name" slice={fetch.slice.projectInOrg} modelId={projectId}>
          <Project.Template.General />
        </Model.Edit>
      </li>
      {role === "owner" ? (
        <li>
          <Model.SureToRemove slice={fetch.slice.project} modelId={projectId} name={name} />
        </li>
      ) : null}
    </ul>
  );
};
```

### __Model__.Util.tsx

```ts
export const Remove = ({ productId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={productId} slice={fetch.slice.product}>
      {l("base.remove")}
    </Model.Remove>
  );
};
```

### BizLicense.Util.tsx

```ts
export const SetOrg = ({ bizLicenseId }: SetOrgProps) => {
  const [orgId, setOrgId] = useState<string | null>(null);
  return (
    <Dialog>
      <Dialog.Trigger>
        <button className="btn">Set Org</button>
      </Dialog.Trigger>
      <Dialog.Modal>
        <Field.ParentId value={orgId} onChange={setOrgId} slice={fetch.slice.orgInSelf} />
        <Dialog.Action>
          <button onClick={() => orgId && st.do.setOrgInBizLicense(bizLicenseId, orgId)}>Save</button>
        </Dialog.Action>
      </Dialog.Modal>
    </Dialog>
  );
};
```

### Report.Util.tsx

```ts
export const Resolve = ({ report }: ResolveProps) => {
  const reportModal = st.use.reportModal();
  return (
    <>
      <button onClick={() => st.do.editReport(report.id, { modal: `resolve-${report.id}` })}>Resolve</button>
      <Modal open={reportModal === `resolve-${report.id}`} onCancel={st.do.resetReport}>
        <button onClick={() => st.do.resolveReport(report.id)}>Confirm</button>
      </Modal>
    </>
  );
};
```

### Ticket.Util.tsx

```ts
export const QueryMakerInSelf = () => {
  const [projectIds, userIds] = st.use.queryArgsOfTicketInSelf();
  return (
    <button
      onClick={() => st.do.setQueryArgsOfTicketInSelf([projectIds ?? [], userIds])}
    >
      Apply Filter
    </button>
  );
};
```

### Board.Util.tsx

```ts
export const BackButton = ({ id }: { id: string }) => {
  const path = st.use.path();
  if (!path.startsWith(`/board/${id}/`)) return null;
  return <Link.Back>Back</Link.Back>;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

