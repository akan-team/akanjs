import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="util-overview" title="model.Util.tsx">
        <Docs.Title>model.Util.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Util file contains small client-side helper components for a module. It is a good home for action buttons, toolboxes, dialog triggers, query controls, and context-aware navigation pieces.",
              ko: "Util 파일은 module의 작은 client-side helper component를 담습니다. action button, toolbox, dialog trigger, query control, context-aware navigation 조각을 두기에 좋습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use Util to keep Page, Zone, Unit, Template, and View files focused. Util components should package interaction UI, not own core business rules.",
              ko: "Util은 Page, Zone, Unit, Template, View 파일이 각자 역할에 집중하도록 돕습니다. Util component는 interaction UI를 묶되 핵심 business rule을 소유하지 않습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 규칙" })}>
        <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Util files usually use client hooks and event handlers, so they start with the use client directive. Export named components that describe the action or helper clearly.",
              ko: "Util 파일은 보통 client hook과 event handler를 사용하므로 use client directive로 시작합니다. action 또는 helper를 명확히 설명하는 named component를 export합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "Path",
              desc: "lib/[model]/[Model].Util.tsx",
            },
            {
              title: "Directive",
              desc: '"use client"',
            },
            {
              title: "Exports",
              desc: "Remove, Toolbox, SetOrg, QueryMaker, BackButton",
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="model-wrapper-actions"
        title={l.trans({ en: "Model Wrapper Actions", ko: "Model wrapper action" })}
      >
        <Docs.Title>{l.trans({ en: "Model Wrapper Actions", ko: "Model wrapper action" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Many Util components are small controls around generated model wrappers. A toolbox can collect edit, remove, and other model actions without making the Unit or Zone file noisy.",
              ko: "많은 Util component는 generated model wrapper 주변의 작은 control입니다. toolbox는 edit, remove 등 model action을 모아서 Unit 또는 Zone 파일이 복잡해지지 않도록 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Project.Util.tsx"
          code={`export const Toolbox = ({ projectId, name, role }: ToolboxProps) => {
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
};`}
        />
        <Code.Snippet
          title="__Model__.Util.tsx"
          code={`export const Remove = ({ productId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={productId} slice={fetch.slice.product}>
      {l("base.remove")}
    </Model.Remove>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="dialog-modal-actions"
        title={l.trans({ en: "Dialog And Modal Actions", ko: "Dialog와 modal action" })}
      >
        <Docs.Title>{l.trans({ en: "Dialog And Modal Actions", ko: "Dialog와 modal action" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Util when an action needs its own dialog, confirmation UI, or small local state. Local component state is fine when it only belongs to that interaction.",
              ko: "action에 dialog, confirmation UI, 작은 local state가 필요하면 Util을 사용합니다. 해당 interaction에만 속하는 값이라면 local component state를 사용해도 괜찮습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="BizLicense.Util.tsx"
          code={`export const SetOrg = ({ bizLicenseId }: SetOrgProps) => {
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
};`}
        />
        <Code.Snippet
          title="Report.Util.tsx"
          code={`export const Resolve = ({ report }: ResolveProps) => {
  const reportModal = st.use.reportModal();
  return (
    <>
      <button onClick={() => st.do.editReport(report.id, { modal: \`resolve-\${report.id}\` })}>Resolve</button>
      <Modal open={reportModal === \`resolve-\${report.id}\`} onCancel={st.do.resetReport}>
        <button onClick={() => st.do.resolveReport(report.id)}>Confirm</button>
      </Modal>
    </>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="query-context-utils"
        title={l.trans({ en: "Query And Context Utilities", ko: "Query와 context utility" })}
      >
        <Docs.Title>{l.trans({ en: "Query And Context Utilities", ko: "Query와 context utility" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Util files are also useful for query panels and route-aware helper UI. They can read store state and route context, then call generated store actions or router helpers.",
              ko: "Util 파일은 query panel이나 route-aware helper UI에도 유용합니다. store state와 route context를 읽고 generated store action 또는 router helper를 호출할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Ticket.Util.tsx"
          code={`export const QueryMakerInSelf = () => {
  const [projectIds, userIds] = st.use.queryArgsOfTicketInSelf();
  return (
    <button
      onClick={() => st.do.setQueryArgsOfTicketInSelf([projectIds ?? [], userIds])}
    >
      Apply Filter
    </button>
  );
};`}
        />
        <Code.Snippet
          title="Board.Util.tsx"
          code={`export const BackButton = ({ id }: { id: string }) => {
  const path = st.use.path();
  if (!path.startsWith(\`/board/\${id}/\`)) return null;
  return <Link.Back>Back</Link.Back>;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use usePage for labels instead of hard-coded action text.",
                ko: "action text를 hard-code하지 말고 usePage로 label을 가져옵니다.",
              }),
              l.trans({
                en: "Call st.do actions or Model wrappers from Util components; keep core business rules elsewhere.",
                ko: "Util component에서는 st.do action 또는 Model wrapper를 호출하고 핵심 business rule은 다른 곳에 둡니다.",
              }),
              l.trans({
                en: "Use local state only for UI-only interaction values such as an opened dialog or selected option.",
                ko: "열린 dialog나 선택 option처럼 UI interaction에만 필요한 값에는 local state를 사용해도 됩니다.",
              }),
              l.trans({
                en: "Keep props explicit so the caller can see which model id, slice, role, or name the action depends on.",
                ko: "action이 의존하는 model id, slice, role, name이 드러나도록 props를 명시적으로 둡니다.",
              }),
              l.trans({
                en: "Split big toolboxes or workflow modals into named exports instead of hiding too much in one component.",
                ko: "큰 toolbox나 workflow modal은 하나의 component에 숨기지 말고 named export로 나눕니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
