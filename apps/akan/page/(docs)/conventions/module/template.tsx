import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const loadEditStateItems: IntroItem[] = [
    {
      name: "<model>",
      desc: l.trans({
        en: "Stores the hydrated full model when editing an existing record.",
        ko: "기존 record를 edit할 때 hydrated full model을 저장합니다.",
      }),
      example: "article: new cnst.Article()",
    },
    {
      name: "<model>Loading",
      desc: l.trans({
        en: "Marks the model data as ready after the edit object is applied.",
        ko: "edit object가 적용된 뒤 model data가 준비되었음을 표시합니다.",
      }),
      example: "articleLoading: false",
    },
    {
      name: "<model>Form",
      desc: l.trans({
        en: "Stores the editable form copy made from the full model. Template fields read and update this state.",
        ko: "full model에서 만든 editable form copy를 저장합니다. Template field는 이 state를 읽고 수정합니다.",
      }),
      example: "articleForm: new cnst.Article()",
    },
    {
      name: "<model>FormLoading",
      desc: l.trans({
        en: "Marks the form as ready so the edit form can render and submit.",
        ko: "edit form이 렌더링되고 submit될 수 있도록 form 준비 상태를 표시합니다.",
      }),
      example: "articleFormLoading: false",
    },
    {
      name: "<model>Modal",
      desc: l.trans({
        en: "Stores the current form mode. Load.Edit normally sets it to edit unless a custom modal key is provided.",
        ko: "현재 form mode를 저장합니다. custom modal key가 없다면 Load.Edit은 보통 edit으로 설정합니다.",
      }),
      example: 'articleModal: "edit"',
    },
    {
      name: "<model>ViewAt",
      desc: l.trans({
        en: "Stores the timestamp from the edit object for consistency with view/edit state.",
        ko: "view/edit state 일관성을 위해 edit object의 timestamp를 저장합니다.",
      }),
      example: "articleViewAt: dayjs()",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="template-overview" title="model.Template.tsx">
        <Docs.Title>model.Template.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Template file contains client UI pieces for a module. Most Templates render model forms, but they can also export smaller interaction fragments such as submit buttons, onboarding steps, or preview blocks.",
              ko: "Template 파일은 module의 client UI 조각을 담습니다. 대부분 model form을 렌더링하지만 submit button, onboarding step, preview block 같은 작은 interaction fragment도 export할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Templates should bind UI to store state and actions. Business rules should stay in constants, documents, services, signals, or store actions.",
              ko: "Template은 UI를 store state와 action에 연결하는 데 집중합니다. business rule은 constant, document, service, signal, store action에 둡니다.",
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
              en: "Template files live beside the module they render. They usually need client hooks and event handlers, so they start with the use client directive.",
              ko: "Template 파일은 렌더링할 module 옆에 둡니다. 보통 client hook과 event handler를 사용하므로 use client directive로 시작합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "Path",
              desc: "lib/[model]/[Model].Template.tsx",
            },
            {
              title: "Directive",
              desc: '"use client"',
            },
            {
              title: "Exports",
              desc: "General, Phone, SubmitPhone, Preview",
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
        id="standard-form-template"
        title={l.trans({ en: "Standard Form Template", ko: "표준 form Template" })}
      >
        <Docs.Title>{l.trans({ en: "Standard Form Template", ko: "표준 form Template" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A standard form Template reads form state from st.use, gets labels from usePage, and writes changes through generated st.do setters.",
              ko: "표준 form Template은 st.use로 form state를 읽고, usePage로 label을 가져오며, generated st.do setter로 변경사항을 저장합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Ticket.Template.tsx"
          code={`"use client";
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
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="field-patterns" title={l.trans({ en: "Field Patterns", ko: "Field 패턴" })}>
        <Docs.Title>{l.trans({ en: "Field Patterns", ko: "Field 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Field components are predefined elements for fast development and standardized form UI. Pick the smallest Field component that matches the input shape, then connect value and onChange to store state.",
              ko: "Field component는 빠른 개발과 규격화된 form UI를 지원하는 predefined element입니다. input shape에 맞는 가장 작은 Field component를 선택하고 value와 onChange를 store state에 연결합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can also build custom UI with plain input, button, or any app-specific component when Field does not match the interaction you need.",
              ko: "필요한 interaction에 Field가 맞지 않는다면 일반 input, button 또는 app 전용 component로 custom UI를 구성해도 괜찮습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Field.Parent"
            code={`<Field.Parent
  slice={fetch.slice.projectInSelf}
  label={l("ticket.project")}
  value={ticketForm.project}
  onChange={st.do.setProjectOnTicket}
  renderOption={(project) => project.name}
/>`}
          />
          <Code.Snippet
            title="Field.ToggleSelect"
            code={`<Field.ToggleSelect
  label={l("ticket.type")}
  items={cnst.TicketType}
  value={ticketForm.type}
  onChange={st.do.setTypeOnTicket}
/>`}
          />
          <Code.Snippet
            title="Field.Img"
            code={`<Field.Img
  slice={fetch.slice.bizCard}
  label={l("bizCard.frontImage")}
  value={bizCardForm.frontImage}
  onChange={st.do.setFrontImageOnBizCard}
  nullable
/>`}
          />
          <Code.Snippet
            title="Field.Yoopta"
            code={`<Field.Yoopta
  label={l("ticket.content")}
  slice={fetch.slice.ticket}
  valuePath="content"
  value={ticketForm.content}
  onChange={st.do.setContentOnTicket}
  addFile={st.do.addContentFilesOnTicket}
/>`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="split-components" title={l.trans({ en: "Split Components", ko: "Component 분리" })}>
        <Docs.Title>{l.trans({ en: "Split Components", ko: "Component 분리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Template file can export several small components. Split large forms by business step or UI responsibility instead of forcing everything into General.",
              ko: "Template 파일은 여러 작은 component를 export할 수 있습니다. 모든 것을 General에 넣기보다 business step이나 UI 책임 단위로 큰 form을 나눕니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="User.Template.tsx"
            code={`export const Phone = ({ userId, redirect }: PhoneProps) => {
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
};`}
          />
          <Code.Snippet
            title="Submit component"
            code={`export const SubmitPhone = ({ userId, redirect }: SubmitPhoneProps) => {
  const phone = st.use.phone();
  return (
    <button disabled={!isPhoneNumber(phone)} onClick={() => st.do.setPhoneInPrepareUser(userId, phone, { redirect })}>
      Send Code
    </button>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="template-usage" title={l.trans({ en: "Template Usage Patterns", ko: "Template 사용 패턴" })}>
        <Docs.Title>{l.trans({ en: "Template Usage Patterns", ko: "Template 사용 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Wrappers such as Load.Edit, Model.Edit, and Model.NewWrapper prepare store form state and submit behavior. Templates stay focused on rendering fields and small interactions.",
              ko: "Load.Edit, Model.Edit, Model.NewWrapper 같은 wrapper는 store form state와 submit behavior를 준비합니다. Template은 field와 작은 interaction 렌더링에 집중합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.SubTitle>{l.trans({ en: "Server Page With Load.Edit", ko: "Server page와 Load.Edit" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Load.Edit in server-rendered pages when the page already knows the edit object. The server page can fetch data or build a partial form, then pass it to Load.Edit. The child Template is still a client component.",
              ko: "server-rendered page에서 page가 edit 객체를 이미 알고 있다면 Load.Edit을 사용합니다. server page가 data를 fetch하거나 partial form을 만든 뒤 Load.Edit에 전달하고, child Template은 client component로 유지됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Internally, Load.Edit delegates to Model.EditModal. It hydrates the model and form state before the Template fields read st.use.<model>Form().",
              ko: "내부적으로 Load.Edit은 Model.EditModal에 위임합니다. Template field가 st.use.<model>Form()을 읽기 전에 model과 form state를 hydrate합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="field" items={loadEditStateItems} />
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="new.tsx"
            code={`export default async function Page() {
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
}`}
          />
          <Code.Snippet
            title="edit.tsx"
            code={`const { story, storyEdit } = await fetch.editStory(storyId);

<Load.Edit slice={fetch.slice.storyInRoot} edit={storyEdit} type="form" onSubmit="back">
  <Story.Template.General storyId={story.id} />
</Load.Edit>`}
          />
        </div>
        <Docs.SubTitle>{l.trans({ en: "Modal Edit With Model.Edit", ko: "Model.Edit으로 modal edit" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Model.Edit when a list, dropdown, or unit component needs an edit trigger. It renders the clickable edit control and the matching edit modal around the Template.",
              ko: "list, dropdown, unit component에서 edit trigger가 필요하면 Model.Edit을 사용합니다. clickable edit control과 해당 edit modal을 Template 주변에 함께 렌더링합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Ticket.Util.tsx"
          code={`<Model.Edit renderTitle="title" slice={fetch.slice.ticket} modelId={ticketId}>
  <Ticket.Template.General />
</Model.Edit>`}
        />
        <Docs.SubTitle>
          {l.trans({ en: "New Form Trigger With Model.NewWrapper", ko: "Model.NewWrapper로 new form 열기" })}
        </Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Model.NewWrapper when a button or empty-list CTA should open a new form. partial supplies default form values, and the wrapper calls the generated new<Model> action for the slice.",
              ko: "button이나 empty-list CTA가 new form을 열어야 할 때 Model.NewWrapper를 사용합니다. partial은 default form 값을 제공하고, wrapper는 해당 slice의 generated new<Model> action을 호출합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Release.Zone.tsx"
          code={`<Model.NewWrapper partial={{ devApp }} slice={fetch.slice.releaseInDevApp}>
  <button className="btn btn-secondary">+ New</button>
</Model.NewWrapper>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use Layout.Template for form layouts that need consistent spacing.",
                ko: "일관된 간격이 필요한 form layout에는 Layout.Template을 사용합니다.",
              }),
              l.trans({
                en: "Use dictionary keys for label and desc instead of hard-coded field text.",
                ko: "field text를 hard-code하지 말고 label과 desc에 dictionary key를 사용합니다.",
              }),
              l.trans({
                en: "Bind Field onChange directly to generated st.do setters when possible.",
                ko: "가능하면 Field onChange는 generated st.do setter에 직접 연결합니다.",
              }),
              l.trans({
                en: "Use plain input, button, or custom components when predefined Field components do not fit the UI.",
                ko: "predefined Field component가 UI에 맞지 않으면 일반 input, button 또는 custom component를 사용합니다.",
              }),
              l.trans({
                en: "Keep business decisions out of Templates. Move them to constants, stores, services, or signals.",
                ko: "business decision은 Template에 두지 말고 constant, store, service, signal로 옮깁니다.",
              }),
              l.trans({
                en: "Split large forms into named components such as General, Phone, SubmitPhone, or Preview.",
                ko: "큰 form은 General, Phone, SubmitPhone, Preview 같은 named component로 나눕니다.",
              }),
              l.trans({
                en: "Use Load.Edit for server pages with prepared edit data, Model.Edit for modal edit triggers, and Model.NewWrapper for new-form buttons.",
                ko: "준비된 edit data가 있는 server page에는 Load.Edit, modal edit trigger에는 Model.Edit, new-form button에는 Model.NewWrapper를 사용합니다.",
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
