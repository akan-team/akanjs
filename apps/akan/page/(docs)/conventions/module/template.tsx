import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, type IntroItem, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows: IntroItem[] = [
    {
      name: "<model>Form",
      desc: l.trans({
        en: "The store's draft of the record being edited, such as `ticketForm`.",
        ko: "store가 들고 있는, 편집 중인 레코드의 초안입니다. 예를 들면 `ticketForm`입니다.",
      }),
    },
    {
      name: "st.do.set<Field>On<Model>",
      desc: l.trans({
        en: "The setter the store generates for each field, such as `setTitleOnTicket`.",
        ko: "store가 필드마다 자동으로 만드는 setter입니다. 예를 들면 `setTitleOnTicket`입니다.",
      }),
    },
    {
      name: "fetch.slice.<name>",
      desc: l.trans({
        en: "Tells a Field or a shell which model and which list it works with.",
        ko: "Field나 셸에게 어떤 모델의 어떤 목록을 다루는지 알려 줍니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "edit shell", ko: "편집 셸" })}</span>,
      desc: l.trans({
        en: "A wrapper such as `Load.Edit` or `Model.Edit` that loads, opens and submits the form.",
        ko: "`Load.Edit`, `Model.Edit`처럼 폼을 불러오고, 열고, 제출하는 래퍼입니다.",
      }),
    },
  ];

  const ownerColumns = [
    { key: "template", label: "Template", caption: "*.Template.tsx" },
    { key: "other", label: l.trans({ en: "Elsewhere", ko: "다른 곳" }) },
  ];
  const inTemplate = { template: true, other: false };
  const elsewhere = { template: false, other: true };

  const ownerGroups = [
    {
      label: l.trans({ en: "Drawing the form", ko: "폼 그리기" }),
      rows: [
        {
          name: "Field.*",
          desc: l.trans({
            en: "Labelled controls, each bound to one field of the form draft.",
            ko: "라벨이 붙은 컨트롤로, 각각 폼 초안의 필드 하나에 묶입니다.",
          }),
          marks: inTemplate,
        },
        {
          name: (
            <span className="font-sans">
              {l.trans({ en: "submit button · step · preview", ko: "제출 버튼 · 단계 · 미리보기" })}
            </span>
          ),
          desc: l.trans({
            en: "Small interaction pieces that belong to one form.",
            ko: "폼 하나에 딸린 작은 인터랙션 조각입니다.",
          }),
          marks: inTemplate,
        },
        {
          name: 'l("<model>.<field>")',
          desc: l.trans({
            en: "Labels and help text from the module dictionary.",
            ko: "모듈 dictionary에서 가져온 라벨과 도움말입니다.",
          }),
          marks: inTemplate,
        },
      ],
    },
    {
      label: l.trans({ en: "Deciding and saving", ko: "판단과 저장" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "business rule", ko: "비즈니스 규칙" })}</span>,
          desc: l.trans({
            en: "Validation and state transitions go in constant, document and service.",
            ko: "검증과 상태 전이는 constant, document, service에 둡니다.",
          }),
          marks: elsewhere,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "access check", ko: "권한 확인" })}</span>,
          desc: l.trans({
            en: "Who may save is decided by the guards in the signal.",
            ko: "누가 저장할 수 있는지는 signal의 guard가 정합니다.",
          }),
          marks: elsewhere,
        },
        {
          name: "fetch.*",
          desc: l.trans({
            en: "A server call and its toasts go in a store action.",
            ko: "서버 호출과 그 전후의 토스트는 store 액션에 둡니다.",
          }),
          marks: elsewhere,
        },
        {
          name: (
            <span className="font-sans">{l.trans({ en: "open · load · submit", ko: "열기 · 불러오기 · 제출" })}</span>
          ),
          desc: l.trans({
            en: "An edit shell does this around the Template.",
            ko: "Template을 감싼 편집 셸이 맡습니다.",
          }),
          marks: elsewhere,
        },
      ],
    },
  ];

  const fileCards = [
    {
      title: l.trans({ en: "Path", ko: "경로" }),
      code: "apps/<app>/lib/<model>/<Model>.Template.tsx",
      desc: l.trans({
        en: "Database and scalar modules may have one. Service modules may not.",
        ko: "데이터베이스 모듈과 스칼라 모듈에 둘 수 있고, 서비스 모듈에는 두지 않습니다.",
      }),
    },
    {
      title: l.trans({ en: "First Line", ko: "첫 줄" }),
      code: '"use client";',
      desc: l.trans({
        en: "Always, on line 1 above the imports.",
        ko: "언제나 import보다 먼저, 파일 첫 줄에 씁니다.",
      }),
    },
    {
      title: l.trans({ en: "Exports", ko: "export" }),
      code: "General · Phone · SubmitPhone · PhoneCode",
      desc: l.trans({
        en: "Named arrow components. General is the model's main form.",
        ko: "이름 있는 화살표 함수 컴포넌트입니다. General이 모델의 기본 폼입니다.",
      }),
    },
    {
      title: l.trans({ en: "Used As", ko: "쓰는 모양" }),
      code: "<Ticket.Template.General />",
      desc: l.trans({
        en: "Pages and shells reach it through the model namespace from @apps/<app>/client.",
        ko: "page와 셸은 @apps/<app>/client의 모델 네임스페이스로 가져다 씁니다.",
      }),
    },
  ];

  const fieldColumns = [
    { key: "type", label: l.trans({ en: "Model field", ko: "모델 필드" }), code: true },
    { key: "field", label: "Field", code: true },
    { key: "note", label: l.trans({ en: "Note", ko: "참고" }) },
  ];
  const fieldRows = [
    {
      type: "String",
      field: "Field.Text",
      note: l.trans({
        en: "`TextArea`, `Email`, `Phone` and `Password` are variants for special text.",
        ko: "특수한 텍스트에는 `TextArea`, `Email`, `Phone`, `Password`를 씁니다.",
      }),
    },
    {
      type: "Int · Float",
      field: "Field.Number",
      note: l.trans({
        en: "`DoubleNumber` holds two numbers in one row, such as a range.",
        ko: "범위처럼 숫자 두 개를 한 줄에 받을 때는 `DoubleNumber`를 씁니다.",
      }),
    },
    {
      type: "Boolean",
      field: "Field.Switch",
      note: l.trans({ en: "A labelled on/off toggle.", ko: "라벨이 붙은 켜고 끄는 토글입니다." }),
    },
    {
      type: "Date",
      field: "Field.Date",
      note: l.trans({
        en: "`showTime` adds the time of day, and `DateRange` takes a from/to pair.",
        ko: "`showTime`을 켜면 시각까지 받고, 기간은 `DateRange`로 받습니다.",
      }),
    },
    {
      type: "enumOf(...)",
      field: "Field.ToggleSelect",
      note: l.trans({
        en: "Each value gets a translated label, and `MultiToggleSelect` takes an array.",
        ko: "값마다 번역된 라벨이 붙고, 배열이면 `MultiToggleSelect`를 씁니다.",
      }),
    },
    {
      type: "[String]",
      field: "Field.Tags",
      note: l.trans({
        en: "`TextList` keeps the order and lets the user drag rows.",
        ko: "순서가 중요하면 행을 드래그할 수 있는 `TextList`를 씁니다.",
      }),
    },
    {
      type: <span className="font-sans">{l.trans({ en: "relation to a model", ko: "다른 모델과의 관계" })}</span>,
      field: "Field.Parent",
      note: l.trans({
        en: "`Children` takes an array, and `ParentId` / `ChildrenId` take `ID` fields.",
        ko: "배열이면 `Children`, `ID` 필드면 `ParentId` / `ChildrenId`를 씁니다.",
      }),
    },
    {
      type: "File",
      field: "Field.Img",
      note: l.trans({
        en: "`Imgs` takes `[File]` and `File` / `Files` take other files, all from `@libs/shared/ui`.",
        ko: "`[File]`이면 `Imgs`, 이미지가 아니면 `File` / `Files`를 쓰며 모두 `@libs/shared/ui`에 있습니다.",
      }),
    },
    {
      type: <span className="font-sans">{l.trans({ en: "rich text", ko: "서식 있는 본문" })}</span>,
      field: "Field.Rich",
      note: l.trans({
        en: "A rich-text editor with attachments, from `@libs/shared/ui`.",
        ko: "첨부 파일을 넣을 수 있는 리치 텍스트 에디터이며, `@libs/shared/ui`에 있습니다.",
      }),
    },
    {
      type: <span className="font-sans">{l.trans({ en: "embedded objects", ko: "내장 객체 목록" })}</span>,
      field: "Field.List",
      note: l.trans({
        en: "You render one row; the field draws the add and remove buttons.",
        ko: "행 하나만 그리면 추가·삭제 버튼은 필드가 그립니다.",
      }),
    },
  ];

  const shellColumns = [
    { key: "shell", label: l.trans({ en: "Shell", ko: "셸" }), code: true },
    { key: "when", label: l.trans({ en: "Use it when", ko: "이럴 때 씁니다" }) },
    { key: "renders", label: l.trans({ en: "What it draws", ko: "그리는 것" }) },
  ];
  const shellRows = [
    {
      shell: "Load.Edit",
      when: l.trans({
        en: "A page already holds the record to edit, or a partial new form.",
        ko: "page가 편집할 레코드나 새 폼의 일부 값을 이미 가지고 있을 때",
      }),
      renders: l.trans({
        en: "The form in the page, in a modal, or as bare fields, chosen by `type`.",
        ko: "`type`에 따라 page 안의 폼이나 모달, 또는 필드만 그립니다.",
      }),
    },
    {
      shell: "Model.Edit",
      when: l.trans({
        en: "A list row, a dropdown or a Unit needs an edit button.",
        ko: "목록의 행, 드롭다운, Unit에 편집 버튼이 필요할 때",
      }),
      renders: l.trans({
        en: "An Edit button, or your `trigger`, plus the edit modal.",
        ko: "편집 버튼(또는 넘긴 `trigger`)과 편집 모달입니다.",
      }),
    },
    {
      shell: "Model.New",
      when: l.trans({
        en: "A screen needs a button that creates a record.",
        ko: "화면에 레코드를 새로 만드는 버튼이 필요할 때",
      }),
      renders: l.trans({
        en: "A New button, or your `trigger`, plus the form modal.",
        ko: "새로 만들기 버튼(또는 넘긴 `trigger`)과 폼 모달입니다.",
      }),
    },
    {
      shell: "Model.NewWrapper",
      when: l.trans({
        en: "Any element, such as an empty-list call to action, should open a new form.",
        ko: "빈 목록 안내 버튼처럼 아무 요소나 새 폼을 열어야 할 때",
      }),
      renders: l.trans({
        en: "Only the trigger, so pair it with a `Model.EditModal`.",
        ko: "트리거만 그리므로 `Model.EditModal`과 짝지어 씁니다.",
      }),
    },
  ];

  const stateColumns = [
    { key: "key", label: l.trans({ en: "State key", ko: "상태 key" }), code: true },
    { key: "edit", label: l.trans({ en: "Given an edit object", ko: "edit 객체를 넘기면" }) },
    { key: "partial", label: l.trans({ en: "Given a partial form", ko: "부분 폼을 넘기면" }) },
  ];
  const unchanged = l.trans({ en: "Left as it was.", ko: "그대로 둡니다." });
  const stateRows = [
    {
      key: "<model>",
      edit: l.trans({ en: "The full model, built from the edit object.", ko: "edit 객체로 만든 full 모델입니다." }),
      partial: "`null`",
    },
    { key: "<model>Loading", edit: "`false`", partial: unchanged },
    {
      key: "<model>Form",
      edit: l.trans({ en: "An editable copy of the model.", ko: "모델을 복사한 편집용 폼입니다." }),
      partial: l.trans({ en: "The default values merged with `edit`.", ko: "기본값에 `edit`을 합친 폼입니다." }),
    },
    { key: "<model>FormLoading", edit: "`false`", partial: "`false`" },
    {
      key: "<model>Modal",
      edit: l.trans({ en: 'The `modal` prop, or `"edit"`.', ko: '`modal` prop, 없으면 `"edit"`입니다.' }),
      partial: l.trans({ en: 'The `modal` prop, or `"edit"`.', ko: '`modal` prop, 없으면 `"edit"`입니다.' }),
    },
    {
      key: "<model>ViewAt",
      edit: l.trans({
        en: "When the server read the record, used to re-read a stale one.",
        ko: "서버가 레코드를 읽은 시각으로, 오래된 값이면 다시 읽는 데 씁니다.",
      }),
      partial: unchanged,
    },
  ];

  const nextLinks = [
    {
      href: "/references/ui/forms",
      title: l.trans({ en: "Form Controls", ko: "폼 컨트롤" }),
      desc: l.trans({
        en: "Every Field member with its props and defaults.",
        ko: "모든 Field 멤버와 그 prop, 기본값을 정리했습니다.",
      }),
    },
    {
      href: "/conventions/module/store",
      title: "model.store.ts",
      desc: l.trans({
        en: "Where the form draft and the generated setters come from.",
        ko: "폼 초안과 자동 생성 setter가 어디서 오는지 다룹니다.",
      }),
    },
    {
      href: "/conventions/module/zone",
      title: "Model.Zone.tsx",
      desc: l.trans({
        en: "The page section that hosts buttons which open a Template.",
        ko: "Template을 여는 버튼이 놓이는 page 섹션을 다룹니다.",
      }),
    },
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "Why a setter passed by reference becomes a tool the agent can call.",
        ko: "참조로 넘긴 setter가 왜 에이전트가 부르는 툴이 되는지 설명합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="template-overview" title="model.Template.tsx">
        <Docs.Title>model.Template.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>{"<Model>.Template.tsx"}</code> is a module's form: the fields a person fills in to create or
                  edit one record. Most exports are whole forms, but a Template may also export a small piece of one,
                  such as a submit button, an onboarding step or a preview block.
                </span>
              ),
              ko: (
                <span>
                  <code>{"<Model>.Template.tsx"}</code>는 모듈의 폼입니다. 레코드 하나를 만들거나 고칠 때 사람이 채우는
                  필드를 그립니다. 대부분 폼 전체를 export하지만, 제출 버튼이나 온보딩 단계, 미리보기 블록 같은 작은
                  조각을 export해도 됩니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "A Template only connects the screen to the store. Anything that needs a decision lives somewhere else:",
              ko: "Template은 화면을 store에 연결하는 일만 합니다. 판단이 필요한 일은 모두 다른 곳에 둡니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "The work", ko: "할 일" })}
            columns={ownerColumns}
            groups={ownerGroups}
            markLabel={l.trans({ en: "Belongs here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기에 두지 않습니다" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 규칙" })}>
        <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A Template sits in the module folder, beside the model it edits. Every field reads and writes the
                  store, which exists only in the browser, so its first line is always <code>{'"use client"'}</code>.
                </span>
              ),
              ko: (
                <span>
                  Template은 편집할 모델과 같은 모듈 폴더에 둡니다. 모든 필드가 브라우저에만 있는 store를 읽고 쓰므로,
                  첫 줄은 언제나 <code>{'"use client"'}</code>입니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {fileCards.map((card) => (
              <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <code className={chip}>{card.code}</code>
                <div className="mt-2 text-foreground/70 text-sm">{card.desc}</div>
              </div>
            ))}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Name the main form <code>General</code>.
                    </strong>{" "}
                    <code>Model.AdminPanel</code> uses <code>Template.General</code> as its form, and falls back to the
                    first export.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      기본 폼의 이름은 <code>General</code>로 합니다.
                    </strong>{" "}
                    <code>Model.AdminPanel</code>은 <code>Template.General</code>을 폼으로 쓰고, 없으면 첫 번째 export를
                    씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      No <code>useState</code> in a Template.
                    </strong>{" "}
                    Form values live in the store. <code>akan quality ssr</code> flags any <code>useState</code> in a
                    Template as <code>akan.ssr.template-client-state</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      Template에는 <code>useState</code>를 쓰지 않습니다.
                    </strong>{" "}
                    폼 값은 store에 둡니다. Template 안의 <code>useState</code>는 <code>akan quality ssr</code>이{" "}
                    <code>akan.ssr.template-client-state</code> 경고로 잡아냅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="standard-form-template"
        title={l.trans({ en: "Standard Form Template", ko: "기본 폼 Template" })}
      >
        <Docs.Title>{l.trans({ en: "Standard Form Template", ko: "기본 폼 Template" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A standard form reads the draft from the store, takes its labels from the dictionary, and writes each field through a generated setter:",
              ko: "기본 폼은 store에서 초안을 읽고, 라벨은 dictionary에서 가져오며, 필드마다 자동 생성된 setter로 값을 씁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/ticket/Ticket.Template.tsx"
            code={`"use client";
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
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>st.use.ticketForm()</code> reads the draft.
                    </strong>{" "}
                    The form re-renders whenever the draft changes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>st.use.ticketForm()</code>이 초안을 읽습니다.
                    </strong>{" "}
                    초안이 바뀔 때마다 폼이 다시 렌더링됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>label</code> and <code>desc</code> are dictionary keys.
                    </strong>{" "}
                    <code>desc</code> shows as a help tooltip beside the label.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>label</code>과 <code>desc</code>는 dictionary key입니다.
                    </strong>{" "}
                    <code>desc</code>는 라벨 옆 도움말 툴팁으로 보입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>st.do.setTitleOnTicket</code> is generated.
                    </strong>{" "}
                    The store makes one setter per field, and you hand it over as it is.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>st.do.setTitleOnTicket</code>은 자동으로 생깁니다.
                    </strong>{" "}
                    store가 필드마다 setter를 하나씩 만들어 두므로 그대로 넘기기만 하면 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Layout.Template</code> spaces the fields evenly.
                    </strong>{" "}
                    The caller can still adjust it through <code>className</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Layout.Template</code>이 필드 간격을 고르게 맞춥니다.
                    </strong>{" "}
                    필요하면 호출하는 쪽에서 <code>className</code>으로 조정합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Pass the setter by reference, never inside an arrow.</strong>{" "}
                  <code>{"onChange={(v) => st.do.setTitleOnTicket(v)}"}</code> works the same for a person, but the
                  field is no longer published to the in-page agent, and lint rejects it (
                  <code>no-unpublished-form-setter</code>). To clean up a value, use the Field's <code>transform</code>{" "}
                  prop; to write another field too, add a <code>{"_postSet<Field>"}</code> method to the store.
                </span>
              ),
              ko: (
                <span>
                  <strong>setter는 화살표 함수로 감싸지 말고 참조로 넘기세요.</strong>{" "}
                  <code>{"onChange={(v) => st.do.setTitleOnTicket(v)}"}</code>도 사람에게는 똑같이 동작하지만, 그 필드가
                  인페이지 에이전트에게 공개되지 않고 lint(<code>no-unpublished-form-setter</code>)에도 걸립니다. 값을
                  다듬으려면 Field의 <code>transform</code> prop을, 다른 필드까지 함께 쓰려면 store에{" "}
                  <code>{"_postSet<Field>"}</code> 메서드를 두세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="field-patterns" title={l.trans({ en: "Field Patterns", ko: "Field 고르기" })}>
        <Docs.Title>{l.trans({ en: "Field Patterns", ko: "Field 고르기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Field.*</code> components are ready-made form controls with a label row. Pick the one that
                  matches the model field, then connect <code>value</code> and <code>onChange</code> to the store.
                </span>
              ),
              ko: (
                <span>
                  <code>Field.*</code> 컴포넌트는 라벨 행까지 갖춰 미리 만들어 둔 폼 컨트롤입니다. 모델 필드에 맞는 것을
                  고르고 <code>value</code>와 <code>onChange</code>를 store에 연결합니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={fieldColumns} rows={fieldRows} stacked />
          <div>
            {l.trans({
              en: (
                <span>
                  The basic members come from <code>akanjs/ui</code>. <code>Field</code> from{" "}
                  <code>@libs/shared/ui</code> holds them all and adds <code>Rich</code>, <code>Img</code>,{" "}
                  <code>Imgs</code>, <code>File</code>, <code>Files</code>, <code>Coordinate</code> and{" "}
                  <code>Postcode</code>, so import it from there. Here are four fields that need more than{" "}
                  <code>value</code> and <code>onChange</code>, added to the same form:
                </span>
              ),
              ko: (
                <span>
                  기본 멤버는 <code>akanjs/ui</code>에 있습니다. <code>@libs/shared/ui</code>의 <code>Field</code>는
                  이를 모두 담고 <code>Rich</code>, <code>Img</code>, <code>Imgs</code>, <code>File</code>,{" "}
                  <code>Files</code>, <code>Coordinate</code>, <code>Postcode</code>를 더하므로 여기서 가져옵니다.
                  아래는 <code>value</code>와 <code>onChange</code> 말고도 prop이 더 필요한 필드 네 개를 같은 폼에
                  추가한 모습입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/ticket/Ticket.Template.tsx"
            code={`"use client";
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
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Field.Parent</code> picks a related model.
                    </strong>{" "}
                    The options come from the <code>slice</code> list, and <code>renderOption</code> draws each one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Field.Parent</code>는 관련 모델 하나를 고릅니다.
                    </strong>{" "}
                    선택지는 <code>slice</code>의 목록에서 오고, <code>renderOption</code>이 각 선택지를 그립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Field.ToggleSelect</code> takes an <code>enumOf</code> class as <code>items</code>.
                    </strong>{" "}
                    Each value becomes a translated button.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Field.ToggleSelect</code>는 <code>items</code>에 <code>enumOf</code> 클래스를 받습니다.
                    </strong>{" "}
                    값마다 번역된 버튼이 하나씩 생깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Field.Img</code> uploads through <code>slice</code>.
                    </strong>{" "}
                    It stores the uploaded <code>File</code> in the form, and <code>nullable</code> marks the label as
                    optional.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Field.Img</code>는 <code>slice</code>를 통해 업로드합니다.
                    </strong>{" "}
                    올라간 <code>File</code>을 폼에 담고, <code>nullable</code>을 주면 라벨에 선택 항목 표시가 붙습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Field.Rich</code> needs <code>valuePath</code>, the field's key in the form.
                    </strong>{" "}
                    <code>addFile</code> receives each file uploaded in the editor, here the generated{" "}
                    <code>add&lt;Field&gt;On&lt;Model&gt;</code> of a <code>[File]</code> field.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Field.Rich</code>에는 폼 안의 필드 key인 <code>valuePath</code>가 꼭 필요합니다.
                    </strong>{" "}
                    <code>addFile</code>은 에디터에서 올린 파일을 받으며, 여기서는 <code>[File]</code> 필드에 자동
                    생성된 <code>add&lt;Field&gt;On&lt;Model&gt;</code>을 넘겼습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  When no Field fits the interaction, <code>Input</code> from <code>akanjs/ui</code>, a button or your
                  own app component is fine, but never a bare <code>{"<input>"}</code> for a model field. The full prop
                  list of every member is in Form Controls, linked at the end of this page.
                </span>
              ),
              ko: (
                <span>
                  맞는 Field가 없으면 <code>akanjs/ui</code>의 <code>Input</code>이나 버튼, 앱 전용 컴포넌트를 써도
                  괜찮습니다. 다만 모델 필드에 맨 <code>{"<input>"}</code>을 쓰지는 않습니다. 모든 멤버의 prop 목록은 이
                  페이지 끝에 연결한 "폼 컨트롤" 문서에 있습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="split-components" title={l.trans({ en: "Split Components", ko: "컴포넌트 나누기" })}>
        <Docs.Title>{l.trans({ en: "Split Components", ko: "컴포넌트 나누기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A Template can export several small components. Split a large form by business step or by UI job,
                  instead of putting everything into <code>General</code>.
                </span>
              ),
              ko: (
                <span>
                  Template 하나가 작은 컴포넌트 여러 개를 export해도 됩니다. 큰 폼은 모든 것을 <code>General</code>에
                  몰아넣지 말고, 업무 단계나 UI 역할에 따라 나눕니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>user</code> module in <code>libs/shared</code> splits phone sign-up into an input and the
                  button that sends the code. Here it is, trimmed:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>의 <code>user</code> 모듈은 휴대폰 가입 단계를 입력칸과 인증번호를 보내는
                  버튼으로 나눕니다. 핵심만 간추리면 다음과 같습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/user/User.Template.tsx"
            code={`"use client";
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
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One export per piece.</strong> A page places <code>{"<User.Template.Phone />"}</code> and{" "}
                    <code>{"<User.Template.SubmitPhone />"}</code> wherever its layout needs them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>조각마다 export를 하나씩 둡니다.</strong> page는 <code>{"<User.Template.Phone />"}</code>과{" "}
                    <code>{"<User.Template.SubmitPhone />"}</code>을 레이아웃에 맞는 자리에 따로 놓습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The pieces share state through the store.</strong> Both read <code>st.use.phone()</code>, so
                    no props pass between them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>조각끼리는 store로 상태를 나눕니다.</strong> 둘 다 <code>st.use.phone()</code>을 읽으므로
                    서로 prop을 주고받지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The setter still goes by reference.</strong> The store's <code>setPhone</code> formats the
                    number itself, so the input needs no wrapper.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>setter는 여기서도 참조로 넘깁니다.</strong> store의 <code>setPhone</code>이 번호 형식을 직접
                    맞추므로 입력칸에 래퍼가 필요 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A call with arguments goes in an arrow.</strong> <code>onPressEnter</code> and{" "}
                    <code>onClick</code> hand <code>userId</code> and <code>phone</code> to a store action, called with{" "}
                    <code>void</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>인자가 필요한 호출은 화살표 함수로 씁니다.</strong> <code>onPressEnter</code>와{" "}
                    <code>onClick</code>은 <code>userId</code>와 <code>phone</code>을 store 액션에 넘기고, 결과를
                    기다리지 않도록 <code>void</code>를 붙입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="template-usage" title={l.trans({ en: "Opening A Template", ko: "Template 여는 법" })}>
        <Docs.Title>{l.trans({ en: "Opening A Template", ko: "Template 여는 법" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Template only draws fields. An edit shell around it fills the form state, opens the form and submits it. Pick the shell by where the form opens:",
              ko: "Template은 필드를 그리기만 합니다. 폼 상태를 채우고, 폼을 열고, 제출하는 일은 Template을 감싼 편집 셸이 합니다. 셸은 폼이 열리는 자리에 따라 고릅니다:",
            })}
          </div>
          <Docs.Table columns={shellColumns} rows={shellRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The shell keeps a draft, so never save form values yourself.</strong> It stores the form as
                    the user types and offers it back on the next open. <code>{"draft={false}"}</code> turns this off,
                    and <code>{'draft="<scope>"'}</code> names the scope when neither the id nor the seed identifies it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>셸이 초안을 보관하므로, 폼 값을 직접 저장하지 마세요.</strong> 사용자가 입력하는 동안 폼을
                    저장해 두었다가 다음에 열 때 되돌려 줍니다. 끄려면 <code>{"draft={false}"}</code>를 넘기고, 레코드
                    id나 시작 값만으로 구분되지 않는 폼이면 <code>{'draft="<scope>"'}</code>로 범위를 직접 정합니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Load.Edit in a page", ko: "page에서 Load.Edit 쓰기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Use <code>Load.Edit</code> when the page already knows what to edit. The Template inside stays a
                  client component. For a new record, pass a partial model as <code>edit</code>:
                </span>
              ),
              ko: (
                <span>
                  page가 무엇을 편집할지 이미 알고 있으면 <code>Load.Edit</code>을 씁니다. 안에 든 Template은 그대로
                  클라이언트 컴포넌트입니다. 새 레코드라면 <code>edit</code>에 일부 값만 채운 모델을 넘깁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/ticket/new.tsx"
            code={`import { cnst, fetch, Ticket } from "@apps/koyo/client";
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
});`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  To edit an existing record, fetch its edit object with <code>{"fetch.edit<Model>"}</code> and pass
                  that instead:
                </span>
              ),
              ko: (
                <span>
                  이미 있는 레코드를 고칠 때는 <code>{"fetch.edit<Model>"}</code>로 edit 객체를 가져와 대신 넘깁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/ticket/[ticketId]/edit.tsx"
            code={`import { fetch, Ticket } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("ticketId", ID)
  .render(({ ticketId }) => {
    const { ticketEdit } = fetch.editTicket(ticketId);
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
  });`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>type</code> picks where the form appears.
                    </strong>{" "}
                    <code>"form"</code> draws it in the page with a submit button, and <code>"empty"</code> draws the
                    fields alone. The default <code>"modal"</code> draws it in a modal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>type</code>이 폼이 나타날 자리를 정합니다.
                    </strong>{" "}
                    <code>"form"</code>이면 page 안에 제출 버튼과 함께, <code>"empty"</code>면 필드만 그립니다. 기본값{" "}
                    <code>"modal"</code>이면 모달로 그립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>onSubmit</code> and <code>onCancel</code> take <code>"back"</code>, <code>"reset"</code> or
                      a path.
                    </strong>{" "}
                    In a path, <code>[ticketId]</code> becomes the id of the saved record.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>onSubmit</code>과 <code>onCancel</code>은 <code>"back"</code>, <code>"reset"</code>, 경로 중
                      하나를 받습니다.
                    </strong>{" "}
                    경로 안의 <code>[ticketId]</code>는 저장된 레코드의 id로 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>ticketEdit</code> goes in unawaited.
                    </strong>{" "}
                    The page is sent at once, and a skeleton, or your <code>loading</code>, holds the form's place until
                    the record lands.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>ticketEdit</code>은 await하지 않고 넘깁니다.
                    </strong>{" "}
                    page는 바로 전송되고, 레코드가 도착할 때까지 skeleton(또는 넘긴 <code>loading</code>)이 폼 자리를
                    지킵니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "Before the Template renders, Load.Edit writes these keys into the store:",
              ko: "Template이 렌더링되기 전에 Load.Edit이 store에 쓰는 key는 다음과 같습니다:",
            })}
          </div>
          <Docs.Table columns={stateColumns} rows={stateRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Model.Edit for an edit modal", ko: "편집 모달은 Model.Edit" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Use <code>Model.Edit</code> when a list row, a dropdown or a Unit needs an edit button. It draws the
                  button and the modal that holds the Template:
                </span>
              ),
              ko: (
                <span>
                  목록의 행, 드롭다운, Unit에 편집 버튼이 필요하면 <code>Model.Edit</code>을 씁니다. 버튼과, Template을
                  담은 모달을 함께 그립니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/ticket/Ticket.Util.tsx"
            code={`"use client";
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
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A click loads the record.</strong> The button calls <code>st.do.editTicket(ticketId)</code>,
                    which fetches it into the form and opens the modal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클릭하면 레코드를 불러옵니다.</strong> 버튼이 <code>st.do.editTicket(ticketId)</code>를
                    호출해 레코드를 폼에 채우고 모달을 엽니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'renderTitle="title"'}</code> titles the modal
                    </strong>{" "}
                    with the model name and the form's <code>title</code>. <code>trigger</code> replaces the default
                    Edit button.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{'renderTitle="title"'}</code>은 모달 제목을 정합니다.
                    </strong>{" "}
                    모델 이름과 폼의 <code>title</code> 값을 씁니다. 기본 편집 버튼 대신 다른 요소를 쓰려면{" "}
                    <code>trigger</code>를 넘깁니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Model.NewWrapper to open a new form", ko: "새 폼 열기는 Model.NewWrapper" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Model.NewWrapper</code> turns any element into a button that opens a new form. It draws only the
                  trigger, so a <code>Model.EditModal</code> for the same slice draws the Template:
                </span>
              ),
              ko: (
                <span>
                  <code>Model.NewWrapper</code>는 아무 요소나 새 폼을 여는 버튼으로 만듭니다. 트리거만 그리므로,
                  Template은 같은 slice의 <code>Model.EditModal</code>이 그립니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/ticket/Ticket.Zone.tsx"
            code={`<>
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
</>`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>partial</code> seeds the form.
                    </strong>{" "}
                    A click calls the generated <code>st.do.newTicket()</code> with it as the starting values.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>partial</code>이 폼의 시작 값이 됩니다.
                    </strong>{" "}
                    클릭하면 자동 생성된 <code>st.do.newTicket()</code>이 이 값으로 폼을 채웁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Model.New</code> is this pair in one component.
                    </strong>{" "}
                    Reach for <code>Model.NewWrapper</code> when the trigger and the modal sit in different places.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Model.New</code>는 이 한 쌍을 컴포넌트 하나로 묶은 것입니다.
                    </strong>{" "}
                    트리거와 모달이 서로 다른 자리에 있을 때 <code>Model.NewWrapper</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Rules At A Glance", ko: "한눈에 보는 규칙" })}>
        <Docs.Title>{l.trans({ en: "Rules At A Glance", ko: "한눈에 보는 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Everything above, as a checklist to run before you finish a Template:",
              ko: "앞에서 다룬 내용을 Template을 마무리하기 전에 확인할 목록으로 모았습니다:",
            })}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'"use client"'}</code> on line 1, always.
                    </strong>{" "}
                    A Template reads the store, which only the browser has.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      첫 줄에는 언제나 <code>{'"use client"'}</code>를 씁니다.
                    </strong>{" "}
                    Template은 브라우저에만 있는 store를 읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Wrap the fields in <code>Layout.Template</code>
                    </strong>{" "}
                    so every form keeps the same spacing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      필드는 <code>Layout.Template</code>으로 감쌉니다.
                    </strong>{" "}
                    그래야 모든 폼의 간격이 같습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Take every label from the dictionary.</strong> Write{" "}
                    <code>{'label={l("ticket.title")}'}</code> and <code>{'desc={l("ticket.title.desc")}'}</code>, never
                    hard-coded text.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라벨은 모두 dictionary에서 가져옵니다.</strong> <code>{'label={l("ticket.title")}'}</code>,{" "}
                    <code>{'desc={l("ticket.title.desc")}'}</code>처럼 쓰고, 문구를 직접 적지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pass generated setters by reference.</strong> Clean a value with the Field's{" "}
                    <code>transform</code>, not with an arrow around the setter.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>자동 생성 setter는 참조로 넘깁니다.</strong> 값을 다듬을 때는 setter를 화살표 함수로 감싸지
                    말고 Field의 <code>transform</code>을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Keep form values in the store, not in <code>useState</code>.
                    </strong>{" "}
                    Read the form with <code>{"st.use.<model>Form()"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      폼 값은 <code>useState</code>가 아니라 store에 둡니다.
                    </strong>{" "}
                    폼은 <code>{"st.use.<model>Form()"}</code>으로 읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Use a plain control when no Field fits.</strong> <code>Input</code>, a button or your own
                    component is fine, but a model field never gets a bare <code>{"<input>"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>맞는 Field가 없으면 일반 컨트롤을 씁니다.</strong> <code>Input</code>, 버튼, 직접 만든
                    컴포넌트 모두 괜찮지만, 모델 필드에 맨 <code>{"<input>"}</code>을 쓰지는 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep business decisions out.</strong> They belong in constant, document, service, signal or
                    a store action, and a Template calls no <code>fetch.*</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>비즈니스 판단은 Template 밖에 둡니다.</strong> constant, document, service, signal, store
                    액션으로 옮기고, Template에서는 <code>fetch.*</code>를 부르지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Split large forms into named components</strong> such as <code>General</code>,{" "}
                    <code>Phone</code> and <code>SubmitPhone</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>큰 폼은 이름 있는 컴포넌트로 나눕니다.</strong> <code>General</code>, <code>Phone</code>,{" "}
                    <code>SubmitPhone</code>처럼 나눕니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Let a shell open the form.</strong> <code>Load.Edit</code> for a page that has the data,{" "}
                    <code>Model.Edit</code> for an edit modal, <code>Model.New</code> or <code>Model.NewWrapper</code>{" "}
                    for a new-form button.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>폼은 셸이 열게 합니다.</strong> 데이터가 있는 page에는 <code>Load.Edit</code>, 편집 모달에는{" "}
                    <code>Model.Edit</code>, 새 폼 버튼에는 <code>Model.New</code>나 <code>Model.NewWrapper</code>를
                    씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={nextLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
