# Model.Util.tsx

- Source: /conventions/module/util
- Mirror: /llms/pages/conventions/module/util.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- Model.Util.tsx (#util-overview)
- File Convention (#file-convention)
- Model Wrapper Actions (#model-wrapper-actions)
- Dialog And Modal Actions (#dialog-modal-actions)
- Query And Route Helpers (#query-context-utils)
- Rules And Common Mistakes (#practical-rules)

## Content

Model.Util.tsx

A Util file holds a module's small client components, each doing one action: a remove button, a toolbox, a dialog trigger, a filter control or a back link.

Clicks and store actions gather here, so Unit and View stay server-rendered and Page, Zone and Template keep to their own jobs.

- Always a client file — `"use client";` — "use client" goes on line 1 by file role. A Util exists to handle a click, a hook or the store.

- Named after its action — `Project.Util.Remove` — Name it after the verb without the model, such as Remove, Resolve or SetOrg. The namespace adds the model.

- Takes ids, not models — `projectId: string` — A model prop would cross the server-client boundary as a class instance. Read the rest from the store.

- Calls, never decides — `st.do.resolveReport(reportId)` — It calls a store action or a Model wrapper. Who may act and what changes is decided by the service and document.

Words used on this page

Term

- Model.Edit, Model.Remove: Components from `akanjs/ui` that run a module's generated edit or remove flow for you.

- st.do, st.use: The client store: `st.do.x()` runs an action, and `st.use.x()` reads a key and re-renders on change.

- fetch.slice.<name>: Slice metadata that tells a wrapper which model and list to act on. It sends no request.

- query args: The arguments a slice list was loaded with, such as the project ids that filter a ticket list.

File Convention

Every Util file has the same shape. `akan create-module product` writes the first one for you, with a single `Remove` export:

**`fetch.slice.product` sends no request.** It is slice metadata that tells `Model.Remove` which model to remove.

**`l("base.remove")` is a shared label.** Words every module shares live under `base.*`; a module's own words live under `<model>.*`.

**Only `react*` packages import directly.** `react-icons` is fine; any other third-party package reaches a Util through a lib re-export.

The rules in the file

Part

- lib/<model>/<Model>.Util.tsx: Sits beside the module's other files. A service module may have one; a scalar module may not.

- "use client": Always line 1, above the imports. Template and Zone carry it too; Unit and View never do.

- Remove, Toolbox, SetOrg, QueryMakerInSelf, BackButton: Named exports only. Callers write `Project.Util.Remove`, so no name repeats the model.

- interface RemoveProps: Declared right above its component and named after it. It takes ids and plain values.

- @apps/<app>/client: One flat import for `fetch`, `st` and `usePage`. UI pieces come from `akanjs/ui`.

Model Wrapper Actions

Most Utils are thin controls around the Model wrappers. A toolbox gathers several of them, so the Unit or Zone that shows it stays small.

Wrapper

- Model.Edit: Draws an Edit button that opens its Template child in an edit modal. — Example: `<Model.Edit slice={fetch.slice.project} modelId={projectId} renderTitle="name">`

- Model.Remove: Its children become the trigger. It asks for confirmation, then removes the record. — Example: `<Model.Remove slice={fetch.slice.project} modelId={projectId}>…</Model.Remove>`

- Model.SureToRemove: A stricter remove that shows the record's `name`. `typeNameToRemove` makes the user retype it. — Example: `<Model.SureToRemove slice={fetch.slice.project} modelId={projectId} name={name} />`

A project toolbox in a dropdown menu. Only the owner sees the remove item:

**The wrappers call the generated actions.** `Model.Edit` runs `st.do.editProject` and `Model.SureToRemove` runs `st.do.removeProject`, so the Util writes no handler for them.

**A custom action declares its own `st.tool`.** The archive button calls the tool's callable with the id, so a click and the agent run one handler.

**Owner-only items use `cond ? … : null`.** The `isOwner` prop makes the condition visible to whoever renders the toolbox.

Dialog And Modal Actions

When an action needs a confirmation or a small input first, its dialog lives in the same Util. First decide where the open state lives:

Inside the dialog

`Dialog` opens and closes itself. `useState` holds a draft value that only this dialog uses.

In the store

`edit<Model>(id, { modal })` writes the `<model>Modal` key, so any component or action can open or close it.

Local state: SetOrg

SetOrg picks an organization in a dialog, then saves it to the business license:

**`useState` is fine here.** The picked id is a draft that belongs to this dialog alone. Server data never goes in `useState`.

**`Field.ParentId` picks a related record.** It loads its options from `fetch.slice.orgInSelf` and hands the chosen id to `onChange`.

**`Dialog.Action` fills the footer.** The save button stays disabled until an organization is picked.

Store state: Resolve

Resolve keeps the modal key in the store, so a store action opens the modal:

**`editReport(id, { modal })` loads the record and names the modal.** It fills `reportForm` and sets `reportModal` to the name you pass.

**The key carries the id.** `resolve-${reportId}` keeps each row's modal apart when a list renders many Resolve buttons.

**`resetReport` closes it.** It clears `report`, `reportForm` and `reportModal`; hand it to `onCancel` as is.

Query And Route Helpers

Filter controls and route-aware helpers are Utils too. They read store or route state, then call a generated action or a router helper.

What they use

- st.use.queryArgsOf<Model><Suffix>(): The args the slice list was last loaded with, as an array in the slice's arg order.

- st.do.setQueryArgsOf<Model><Suffix>(...args): Takes one value per slice arg, then reloads the list and insight from page 1.

- st.use.path(): The current path without the locale prefix, such as `/board/abc/post/1`.

- Link.Back: A wrapper from `akanjs/ui` whose click calls `router.back()`.

Changing a filter

QueryMakerInSelf keeps the project filter of the ticketInSelf list and clears its assignee filter:

**Spread the args, one per slice arg.** Wrapping them in one array would put the whole array into the first arg.

**An updater works too.** `setQueryArgsOfTicketInSelf((projectIds, userIds) => [projectIds, []])` derives the next args from the current ones.

Reading the route

BackButton shows a back link only on pages under one board:

**`{ agent: false }` keeps the key off the agent's surface.** The path only decides what to draw, so the in-page agent has no reason to read it.

**An early `return null` is a guard clause.** Use it only to bail out like this; elsewhere write `cond ? <X /> : null`.

Rules And Common Mistakes

What belongs in a Util, and which file takes everything else:

The work

Util

View — Unit · View

Form — Template

Logic — store · service

- The Util's job

  - onClick → st.do.*: A button that runs one store action.

  - Model.Edit · Model.Remove: Wrappers that open the generated edit and remove flows.

  - Dialog · Modal: A dialog trigger, and the draft value only that dialog uses.

  - setQueryArgsOf…: Filter controls that change a slice list's query args.

  - st.use.path · Link.Back: Helpers that read the route to decide what to show.

- Another file's job

  - fields and markup: A Unit draws one row, and a View draws one record in full.

  - Field.* · <model>Form: A form whose fields are bound to the store.

  - who may act, what changes: Business rules run on the server, in the service and document.

  - multi-step async flow: A store action that the Util calls in one line.

Belongs here

Not here

Writing a Util

**Labels go through `l`.** Take it from `usePage()` and write `l("model.key")` or `l.trans({ en, ko })`, never hard-coded action text.

**Call, do not decide.** Call `st.do` actions or Model wrappers, and keep business rules in the service and document.

**`useState` is for UI-only values.** An open dialog, a selected option or a draft input qualifies; server data does not.

**Keep props explicit.** The caller should see which id, slice, role or name the action depends on.

**Split big toolboxes.** Break a large toolbox or workflow modal into named exports instead of hiding too much in one component.

**Publish custom buttons to the agent.** Model wrappers declare their own agent tools; a plain button publishes nothing until you declare `st.tool(…)` beside it and hand its callable to `onClick`.

Common mistakes

Mistake

Instead

- {isOwner && <Remove />} — Write `isOwner ? <Remove /> : null`, the house form for conditional render.

- onChange={(v) => st.do.setNameOnX(v)} — Pass the setter by reference; the arrow hides the field from the agent and fails lint.

- useEffect(() => { … }, []) — Load data in the page and pass it down; `akan quality ssr` flags a mount-time load.

- fetch.initTicketInSelf() — Lint rejects `fetch.init*` in a client file. Reload with `st.do.initTicketInSelf()`.

- <div>…markup only…</div> — A Util with no click, hook or store is server work. Move it to a Unit or View.

**A Util prop cannot be a `cnst` model.** A prop such as `report: cnst.Report` fails `akan lint`. Take `reportId: string` and read the model from the store; an enum value such as `cnst.ProjectRole["value"]` is still fine.

Related pages

- Model.Unit.tsx — How a Unit places a Util button beside its link.

- Model.store.ts — Every generated slice action, including setQueryArgsOf.

- Model — Every prop of Model.Edit, Model.Remove and the other wrappers.

- In-Page Agent — How st.tool publishes a button to the agent.

## Code Examples

### apps/koyo/lib/product/Product.Util.tsx

```ts
"use client";
import { fetch, usePage } from "@apps/koyo/client";
import { Model } from "akanjs/ui";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  productId: string;
}
export const Remove = ({ productId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={productId} slice={fetch.slice.product}>
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};
```

### apps/koyo/lib/project/Project.Util.tsx

```ts
interface ToolboxProps {
  projectId: string;
  name: string;
  isOwner: boolean;
}
export const Toolbox = ({ projectId, name, isOwner }: ToolboxProps) => {
  const { l } = usePage();
  const archive = st
    .tool("archiveProject")
    .desc("Archive one project.")
    .arg("projectId", ID)
    .exec((id) => st.do.archiveProject(id));
  return (
    <Dropdown
      value={<AiOutlineMore />}
      content={
        <>
          <li>
            <Model.Edit renderTitle="name" slice={fetch.slice.projectInOrg} modelId={projectId}>
              <Project.Template.General />
            </Model.Edit>
          </li>
          <li>
            <button onClick={() => void archive(projectId)}>{l("project.archiveProject")}</button>
          </li>
          {isOwner ? (
            <li>
              <Model.SureToRemove slice={fetch.slice.project} modelId={projectId} name={name} />
            </li>
          ) : null}
        </>
      }
    />
  );
};
```

### apps/koyo/lib/bizLicense/BizLicense.Util.tsx

```ts
interface SetOrgProps {
  bizLicenseId: string;
}
export const SetOrg = ({ bizLicenseId }: SetOrgProps) => {
  const { l } = usePage();
  const [orgId, setOrgId] = useState<string | null>(null);
  return (
    <Dialog>
      <Dialog.Trigger>
        <button className={buttonRecipe()}>{l("bizLicense.setOrg")}</button>
      </Dialog.Trigger>
      <Dialog.Modal>
        <Field.ParentId value={orgId} onChange={setOrgId} slice={fetch.slice.orgInSelf} />
        <Dialog.Action>
          <button
            className={buttonRecipe({ variant: "primary" })}
            disabled={!orgId}
            onClick={() => {
              if (orgId) void st.do.setOrgInBizLicense(bizLicenseId, orgId);
            }}
          >
            {l.trans({ en: "Save", ko: "저장" })}
          </button>
        </Dialog.Action>
      </Dialog.Modal>
    </Dialog>
  );
};
```

### apps/koyo/lib/report/Report.Util.tsx

```ts
interface ResolveProps {
  reportId: string;
}
export const Resolve = ({ reportId }: ResolveProps) => {
  const { l } = usePage();
  const reportModal = st.use.reportModal();
  return (
    <>
      <button onClick={() => void st.do.editReport(reportId, { modal: `resolve-${reportId}` })}>
        {l("report.resolveReport")}
      </button>
      <Modal open={reportModal === `resolve-${reportId}`} onCancel={st.do.resetReport}>
        <button onClick={() => void st.do.resolveReport(reportId)}>{l.trans({ en: "Confirm", ko: "확인" })}</button>
      </Modal>
    </>
  );
};
```

### apps/koyo/lib/ticket/Ticket.Util.tsx

```ts
export const QueryMakerInSelf = () => {
  const { l } = usePage();
  const [projectIds] = st.use.queryArgsOfTicketInSelf();
  return (
    <button onClick={() => void st.do.setQueryArgsOfTicketInSelf(projectIds, [])}>
      {l.trans({ en: "All Assignees", ko: "모든 담당자" })}
    </button>
  );
};
```

### apps/koyo/lib/board/Board.Util.tsx

```ts
interface BackButtonProps {
  id: string;
}
export const BackButton = ({ id }: BackButtonProps) => {
  const { l } = usePage();
  const path = st.use.path({ agent: false });
  if (!path.startsWith(`/board/${id}/`)) return null;
  return <Link.Back>{l.trans({ en: "Back", ko: "뒤로" })}</Link.Back>;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

