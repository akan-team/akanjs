import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: "<model>Form",
      desc: l.trans({
        en: "The store's draft of the record being edited, such as `icecreamOrderForm`.",
        ko: "스토어가 들고 있는, 편집 중인 레코드의 초안입니다. 예를 들면 `icecreamOrderForm`입니다.",
      }),
    },
    {
      name: "st.do.set<Field>On<Model>",
      desc: l.trans({
        en: "The generated form setter. It writes one field of that draft.",
        ko: "자동으로 생성되는 폼 setter입니다. 초안의 필드 하나에 값을 넣습니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "controlled", ko: "controlled (제어형)" })}</span>,
      desc: l.trans({
        en: "Shows the `value` you pass and hands the next one to `onChange`. Only `Switch` can also run alone.",
        ko: "받은 `value`를 보여주고 바뀐 값은 `onChange`로 돌려주는 방식입니다. `Switch`만 자체 상태로도 동작합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "agent tool", ko: "에이전트 툴" })}</span>,
      desc: l.trans({
        en: "An action the in-page agent may call. A form setter passed by reference becomes one.",
        ko: "인페이지 에이전트가 호출할 수 있는 동작입니다. 참조로 넘긴 폼 setter가 툴이 됩니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "override slot", ko: "오버라이드 슬롯" })}</span>,
      desc: l.trans({
        en: "A name in `_overrides.tsx` that swaps a component for one route subtree.",
        ko: "`_overrides.tsx`에서 컴포넌트를 라우트 하위 트리 단위로 바꿔 끼울 때 쓰는 이름입니다.",
      }),
    },
  ];

  const controlColumns = [
    { key: "label", label: l.trans({ en: "Label row", ko: "라벨 행" }), caption: "label" },
    { key: "tool", label: l.trans({ en: "Agent tool", ko: "에이전트 툴" }), caption: "st.do.setXOnY" },
    { key: "slot", label: l.trans({ en: "Override slot", ko: "오버라이드 슬롯" }), caption: "_overrides.tsx" },
  ];

  const controlGroups = [
    {
      label: l.trans({ en: "Model field — inside a Template", ko: "모델 필드 — Template 안에서" }),
      rows: [
        {
          name: "Field.*",
          desc: l.trans({
            en: "One labelled control per model field, written inside a Template.",
            ko: "모델 필드 하나에 라벨이 붙은 컨트롤 하나입니다. Template 안에서 씁니다.",
          }),
          marks: { label: true, tool: true, slot: false },
        },
      ],
    },
    {
      label: l.trans({
        en: "Bare control — search box, filter bar, inline cell",
        ko: "단독 컨트롤 — 검색창, 필터 바, 인라인 셀",
      }),
      rows: [
        {
          name: "Input",
          desc: l.trans({
            en: "Text, number, password, email and checkbox inputs without a label row.",
            ko: "라벨 행이 없는 텍스트·숫자·비밀번호·이메일·체크박스 입력입니다.",
          }),
          marks: { label: false, tool: true, slot: true },
        },
        {
          name: "Select",
          desc: l.trans({
            en: "A dropdown for single, multiple or searchable choice. `label` is optional.",
            ko: "단일·다중·검색 선택을 하는 드롭다운입니다. `label`은 넣어도 되고 빼도 됩니다.",
          }),
          marks: { label: true, tool: true, slot: true },
        },
        {
          name: "Switch",
          desc: l.trans({
            en: "A boolean toggle. `Field.Switch` adds the label row.",
            ko: "켜고 끄는 boolean 토글입니다. 라벨 행은 `Field.Switch`가 붙여 줍니다.",
          }),
          marks: { label: false, tool: true, slot: false },
        },
        {
          name: "Radio",
          desc: l.trans({
            en: "One choice from a short list of radio buttons.",
            ko: "짧은 목록에서 하나를 고르는 라디오 버튼입니다.",
          }),
          marks: { label: false, tool: false, slot: true },
        },
        {
          name: "ToggleSelect",
          desc: l.trans({
            en: "One or many choices as a row of buttons. `Field.ToggleSelect` publishes the tool.",
            ko: "버튼 줄에서 하나 또는 여러 개를 고릅니다. 툴 공개는 `Field.ToggleSelect`가 합니다.",
          }),
          marks: { label: false, tool: false, slot: true },
        },
        {
          name: "DatePicker",
          desc: l.trans({
            en: "A date, date-time, range or time on the native input. `Field.Date` publishes the tool.",
            ko: "네이티브 입력으로 날짜·일시·기간·시각을 받습니다. 툴 공개는 `Field.Date`가 합니다.",
          }),
          marks: { label: false, tool: false, slot: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Action — ends the form", ko: "동작 — 폼을 마무리" }),
      rows: [
        {
          name: "Button",
          desc: l.trans({
            en: "Publishes nothing itself. An `st.tool(...)` handler given to `onClick` is the agent's tool.",
            ko: "스스로는 아무것도 공개하지 않습니다. `onClick`에 넘긴 `st.tool(...)` 핸들러가 에이전트의 툴입니다.",
          }),
          marks: { label: false, tool: false, slot: true },
        },
      ],
    },
  ];

  const relatedLinks = [
    {
      href: "/conventions/module/template",
      title: l.trans({ en: "Writing a Template", ko: "Template 작성법" }),
      desc: l.trans({
        en: "Where the model-field controls live and how a module form is laid out.",
        ko: "모델 필드 컨트롤이 놓이는 파일과 모듈 폼을 짜는 방식입니다.",
      }),
    },
    {
      href: "/references/ui/customize#slots",
      title: l.trans({ en: "Override Slots", ko: "오버라이드 슬롯" }),
      desc: l.trans({
        en: "Re-skin the controls on this page for one route subtree.",
        ko: "이 페이지의 컨트롤을 라우트 하위 트리 단위로 다시 입힙니다.",
      }),
    },
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "How a setter passed by reference becomes a tool the agent can call.",
        ko: "참조로 넘긴 setter가 어떻게 에이전트의 툴이 되는지 설명합니다.",
      }),
    },
  ];

  const components: UiComponentReference[] = [
    {
      name: "Field",
      desc: l.trans({
        en: "The form-field namespace a module Template is written in. `<Field>` itself is a section wrapper with a label row; every member is one labelled control. The members differ mainly in the shape of `value`.",
        ko: "모듈 Template을 쓸 때 사용하는 폼 필드 네임스페이스입니다. `<Field>` 자체는 라벨 행이 달린 섹션 래퍼이고, 각 멤버는 라벨이 붙은 컨트롤 하나입니다. 멤버끼리는 주로 `value`의 형태가 다릅니다.",
      }),
      props: [
        {
          name: "Field",
          type: "{ label?, desc?, nullable?, className?, containerClassName?, labelClassName?, children? }",
          desc: l.trans({
            en: "Section wrapper: draws the label row, then stacks its children in a `gap-4` column.",
            ko: "섹션 래퍼입니다. 라벨 행을 그리고, 그 아래에 자식을 `gap-4` 간격의 세로 열로 쌓습니다.",
          }),
        },
        {
          name: "Field.Label",
          type: "{ label, desc?, unit?, nullable?, mode? }",
          desc: l.trans({
            en: "The label row: capitalizes a string label, tooltips `desc`, adds `(optional)` when `nullable`.",
            ko: "라벨 행입니다. 문자열 라벨의 첫 글자를 대문자로 바꾸고, `desc`를 툴팁으로 달고, `nullable`이면 `(optional)`을 붙입니다.",
          }),
        },
        {
          name: "Field.Text",
          type: "{ value: string | null, minlength? = 2, maxlength? = 200, inputStyleType? }",
          desc: l.trans({
            en: "One line of text. `inputStyleType` is `bordered` (default), `borderless` or `underline`.",
            ko: "한 줄 텍스트입니다. `inputStyleType`은 `bordered`(기본), `borderless`, `underline` 중 하나입니다.",
          }),
        },
        {
          name: "Field.TextArea",
          type: "{ value: string | null, rows? = 3, minlength? = 2, maxlength? = 1000 }",
          desc: l.trans({
            en: "Multi-line text, three rows tall by default.",
            ko: "여러 줄 텍스트이며, 기본 높이는 세 줄입니다.",
          }),
        },
        {
          name: "Field.Email",
          type: "{ value: string | null, maxlength? = 80, inputStyleType? }",
          desc: l.trans({
            en: "Text that must be a valid email address.",
            ko: "올바른 이메일 주소여야 하는 텍스트입니다.",
          }),
        },
        {
          name: "Field.Phone",
          type: "{ value: string | null, maxlength? = 13 }",
          desc: l.trans({
            en: "Text that must be a phone number. The default `transform` formats it with dashes.",
            ko: "전화번호여야 하는 텍스트입니다. 기본 `transform`이 하이픈을 넣어 형식을 맞춥니다.",
          }),
        },
        {
          name: "Field.Password",
          type: "{ value, confirmValue?, onChangeConfirm?, showConfirm?, minlength? = 8, maxlength? = 20 }",
          desc: l.trans({
            en: "Masked text with a show/hide eye. `showConfirm` adds a second box that must match.",
            ko: "가려진 텍스트이며, 눈 아이콘으로 보이기를 켜고 끕니다. `showConfirm`을 켜면 값이 같아야 하는 확인 칸이 붙습니다.",
          }),
        },
        {
          name: "Field.Number",
          type: "{ value: number | null, min?, max?, unit?, formatter?, parser? }",
          desc: l.trans({
            en: "One number. `unit` shows in the label; `formatter` / `parser` convert the digits shown.",
            ko: "숫자 하나입니다. `unit`은 라벨에 표시되고, `formatter` / `parser`가 화면에 보이는 숫자를 변환합니다.",
          }),
        },
        {
          name: "Field.DoubleNumber",
          type: "{ value: [number, number] | null, min?, max?, separator? }",
          desc: l.trans({
            en: "Two numbers in one row, such as a range, a ratio or a coordinate. `min` / `max` are pairs too.",
            ko: "한 줄에 놓인 숫자 두 개이며, 범위·비율·좌표 같은 값에 씁니다. `min` / `max`도 두 값 쌍으로 넘깁니다.",
          }),
        },
        {
          name: "Field.Date",
          type: "{ value: Dayjs | null, min?, max?, showTime? }",
          desc: l.trans({
            en: "One date on the browser's native input. `showTime` adds the time of day.",
            ko: "브라우저 네이티브 입력으로 받는 날짜 하나입니다. `showTime`을 켜면 시각까지 받습니다.",
          }),
        },
        {
          name: "Field.DateRange",
          type: "{ from, to, onChangeFrom, onChangeTo, onChange?, min?, max?, showTime? }",
          desc: l.trans({
            en: "Two ends of a range. `onChange(from, to)` fires only once both ends are set.",
            ko: "기간의 양 끝입니다. `onChange(from, to)`는 양 끝이 모두 정해진 뒤에만 호출됩니다.",
          }),
        },
        {
          name: "Field.Switch",
          type: "{ value: boolean | null, onDesc?, offDesc? }",
          desc: l.trans({
            en: "A labelled boolean. `onDesc` / `offDesc` describe the current position beside the toggle.",
            ko: "라벨이 붙은 boolean입니다. `onDesc` / `offDesc`가 토글 옆에서 현재 상태를 설명합니다.",
          }),
        },
        {
          name: "Field.ToggleSelect",
          type: "{ items, value: I | null, nullable?, validate?, btnClassName? }",
          desc: l.trans({
            en: "One choice as a row of buttons. An `enumOf(...)` in `items` gets each value translated.",
            ko: "버튼 줄에서 하나를 고릅니다. `items`에 `enumOf(...)`를 넘기면 값마다 번역된 라벨이 붙습니다.",
          }),
        },
        {
          name: "Field.MultiToggleSelect",
          type: "{ items, value: I[] | null, minlength?, maxlength? }",
          desc: l.trans({
            en: "Many choices in the same row. `minlength` / `maxlength` show translated messages.",
            ko: "같은 버튼 줄에서 여러 개를 고릅니다. `minlength` / `maxlength`를 어기면 번역된 안내가 뜹니다.",
          }),
        },
        {
          name: "Field.TextList",
          type: "{ value: string[] | null, minlength?, maxlength?, minTextlength?, maxTextlength? }",
          desc: l.trans({
            en: "Ordered strings, one input each. Drag to reorder; remove any row.",
            ko: "순서가 있는 문자열 목록이며, 항목마다 입력칸이 있습니다. 드래그로 순서를 바꾸고 행마다 지울 수 있습니다.",
          }),
        },
        {
          name: "Field.Tags",
          type: "{ value: string[] | null, minTextlength? = 2, maxTextlength? = 10 }",
          desc: l.trans({
            en: "Unordered short strings drawn as badges, with an inline add box.",
            ko: "순서 없는 짧은 문자열을 배지로 그리고, 그 자리에서 추가하는 입력칸이 붙습니다.",
          }),
        },
        {
          name: "Field.List",
          type: "{ value: Item[] | null, onAdd, renderItem: (item, idx) => ReactNode }",
          desc: l.trans({
            en: "Embedded objects. You render one row; the field draws the frame and add/remove buttons.",
            ko: "내장 객체 목록입니다. 행 하나만 그리면 테두리와 추가·삭제 버튼은 필드가 그립니다.",
          }),
        },
        {
          name: "Field.Parent",
          type: "{ value: Light | null, slice, renderOption, onSearch? }",
          desc: l.trans({
            en: "One related model as its Light instance. Options load from `slice`, e.g. `fetch.slice.user`.",
            ko: "관련 모델 하나를 Light 인스턴스로 담습니다. 선택지는 `fetch.slice.user` 같은 `slice`에서 불러옵니다.",
          }),
        },
        {
          name: "Field.ParentId",
          type: "{ value: string | null, slice, onChange: (id, model) => void }",
          desc: l.trans({
            en: "The same picker for an `ID` field: holds the id and passes the model as a second argument.",
            ko: "`ID` 필드용 같은 선택기입니다. id만 담고, 고른 모델은 두 번째 인자로 넘겨 줍니다.",
          }),
        },
        {
          name: "Field.Children",
          type: "{ value: Light[] | null, slice, renderOption }",
          desc: l.trans({
            en: "Many related models as Light instances.",
            ko: "관련 모델 여러 개를 Light 인스턴스로 담습니다.",
          }),
        },
        {
          name: "Field.ChildrenId",
          type: "{ value: string[] | null, slice, renderOption }",
          desc: l.trans({ en: "Many related models as ids.", ko: "관련 모델 여러 개를 id로 담습니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Shared props.</strong> Most members take <code>value</code> / <code>onChange</code>,{" "}
              <code>label</code> / <code>desc</code>, <code>nullable</code>, <code>disabled</code>,{" "}
              <code>placeholder</code>, <code>transform</code>, <code>validate</code> and <code>className</code> /{" "}
              <code>labelClassName</code> / <code>inputClassName</code>.
            </>
          ),
          ko: (
            <>
              <strong>공통 prop.</strong> 대부분의 멤버가 <code>value</code> / <code>onChange</code>, <code>label</code>{" "}
              / <code>desc</code>, <code>nullable</code>, <code>disabled</code>, <code>placeholder</code>,{" "}
              <code>transform</code>, <code>validate</code>, <code>className</code> / <code>labelClassName</code> /{" "}
              <code>inputClassName</code>을 받습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Minimum length.</strong> <code>Text</code>, <code>TextArea</code>, <code>Email</code> and{" "}
              <code>Password</code> flag input shorter than <code>minlength</code>: 2 by default, 8 for{" "}
              <code>Password</code>, 0 when <code>nullable</code>. Lower it for short values such as initials.
            </>
          ),
          ko: (
            <>
              <strong>최소 길이.</strong> <code>Text</code>, <code>TextArea</code>, <code>Email</code>,{" "}
              <code>Password</code>는 <code>minlength</code>보다 짧은 입력에 오류를 띄웁니다. 기본값은 2이고,{" "}
              <code>Password</code>는 8, <code>nullable</code>이면 0입니다. 이니셜처럼 짧은 값이면 낮춰 주세요.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Setter by reference.</strong> <code>{"onChange={st.do.setNameOnUser}"}</code> publishes the field
              as an agent tool. An inline arrow runs the same and publishes nothing.
            </>
          ),
          ko: (
            <>
              <strong>setter는 참조로.</strong> <code>{"onChange={st.do.setNameOnUser}"}</code>처럼 넘겨야 필드가
              에이전트 툴로 공개됩니다. 인라인 화살표 함수는 똑같이 동작하지만 아무것도 공개하지 않습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Wrappers stay legal.</strong> Transforming the value, adding a statement or writing a nested path
              with <code>writeOnX</code> is fine. Normalize with the control's <code>transform</code> prop where you
              can, and publish the rest with <code>st.tool</code>.
            </>
          ),
          ko: (
            <>
              <strong>래퍼도 괜찮습니다.</strong> 값을 변형하거나, 코드를 한 줄 더 실행하거나, <code>writeOnX</code>로
              중첩 경로에 쓰는 래퍼는 써도 됩니다. 가능하면 컨트롤의 <code>transform</code> prop으로 정규화하고,
              나머지는 <code>st.tool</code>로 직접 공개하세요.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>More members in a lib.</strong> <code>@libs/shared/ui</code> re-exports <code>Field</code> with{" "}
              <code>Rich</code>, <code>Coordinate</code>, <code>Postcode</code>, <code>Img</code> / <code>Imgs</code>{" "}
              and <code>File</code> / <code>Files</code> added.
            </>
          ),
          ko: (
            <>
              <strong>lib에 멤버가 더 있습니다.</strong> <code>@libs/shared/ui</code>의 <code>Field</code>는 여기에{" "}
              <code>Rich</code>, <code>Coordinate</code>, <code>Postcode</code>, <code>Img</code> / <code>Imgs</code>,{" "}
              <code>File</code> / <code>Files</code>를 더한 것입니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "Input",
      desc: l.trans({
        en: "Controlled inputs without the label row, for a search box, a filter bar or an inline cell editor. Each member is its own override slot: `Input`, `InputTextArea`, `InputPassword`, `InputEmail`, `InputNumber` and `InputCheckbox` can be re-skinned separately.",
        ko: "라벨 행 없이 입력칸만 필요한 자리(검색창, 필터 바, 인라인 셀 편집)에 쓰는 제어형(controlled) 입력입니다. 멤버마다 오버라이드 슬롯이 따로 있어 `Input`, `InputTextArea`, `InputPassword`, `InputEmail`, `InputNumber`, `InputCheckbox`를 하나씩 따로 바꿔 입힐 수 있습니다.",
      }),
      props: [
        {
          name: "value",
          type: "string",
          desc: l.trans({
            en: "The current text. The input keeps no copy of its own.",
            ko: "현재 값입니다. 입력칸은 값을 따로 복사해 두지 않습니다.",
          }),
        },
        {
          name: "onChange",
          type: "(value, event?) => void",
          desc: l.trans({ en: "Receives the next string.", ko: "바뀐 문자열을 받습니다." }),
        },
        {
          name: "validate",
          type: "(value) => boolean | string",
          desc: l.trans({
            en: "`true` when valid; `false` or a message shows an error under the input.",
            ko: "유효하면 `true`를 반환합니다. `false`나 메시지를 반환하면 입력칸 아래에 오류가 뜹니다.",
          }),
        },
        {
          name: "nullable",
          type: "boolean",
          desc: l.trans({
            en: "Lets an empty value pass without a warning.",
            ko: "값이 비어 있어도 경고를 띄우지 않습니다.",
          }),
        },
        {
          name: "inputStyleType",
          type: `"bordered" | "borderless" | "underline"`,
          default: `"bordered"`,
          desc: l.trans({
            en: "The surface the input is drawn on.",
            ko: "입력칸을 그리는 표면 모양입니다.",
          }),
        },
        {
          name: "icon",
          type: "ReactNode",
          desc: l.trans({ en: "A leading icon.", ko: "입력칸 앞에 붙는 아이콘입니다." }),
        },
        {
          name: "onPressEnter",
          type: "(value, event) => void",
          desc: l.trans({
            en: "Called on Enter: a search box without a form element.",
            ko: "Enter를 누르면 호출됩니다. form 요소 없이 검색창을 만들 때 씁니다.",
          }),
        },
        {
          name: "onPressEscape",
          type: "(event) => void",
          desc: l.trans({
            en: "Called on Escape, after the input loses focus.",
            ko: "Escape를 누르면 입력칸의 포커스를 뺀 뒤 호출됩니다.",
          }),
        },
        {
          name: "Input.TextArea / Password / Email",
          type: "{ value: string, validate, onChange? }",
          desc: l.trans({
            en: "The same contract, with `validate` required. `Email` also rejects a malformed address.",
            ko: "쓰는 법은 같지만 `validate`가 필수입니다. `Email`은 형식이 틀린 주소도 거절합니다.",
          }),
        },
        {
          name: "Input.Number",
          type: "{ value: number | null, onChange, formatter?, parser? }",
          desc: l.trans({
            en: "A number or `null`. `formatter` / `parser` convert the text shown.",
            ko: "숫자 또는 `null`을 받습니다. `formatter` / `parser`가 화면에 보이는 글자를 변환합니다.",
          }),
        },
        {
          name: "Input.Checkbox",
          type: "{ checked, onChange: (checked, event) => void }",
          desc: l.trans({
            en: "A native checkbox tinted with the primary color.",
            ko: "primary 색을 입힌 네이티브 체크박스입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Native attributes pass through.</strong> <code>placeholder</code>, <code>maxLength</code>,{" "}
              <code>autoFocus</code> and the rest reach the <code>{"<input>"}</code> unchanged.
            </>
          ),
          ko: (
            <>
              <strong>네이티브 속성은 그대로 전달됩니다.</strong> <code>placeholder</code>, <code>maxLength</code>,{" "}
              <code>autoFocus</code> 같은 속성은 <code>{"<input>"}</code>에 그대로 붙습니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/Search.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "Select",
      desc: l.trans({
        en: "A controlled dropdown for plain values, `{ label, value }` pairs or an `enumOf(...)` class, with single, multiple and searchable modes. The option list portals to `document.body` at the field's width, so a scrolling modal or a table never clips it.",
        ko: "일반 값, `{ label, value }` 쌍, `enumOf(...)` 클래스를 받는 제어형 드롭다운이며 단일·다중·검색 선택을 지원합니다. 옵션 목록은 `document.body`에 portal로 따로 그려져 필드 너비에 맞춰 뜨므로, 스크롤되는 모달이나 테이블 안에서도 잘리지 않습니다.",
      }),
      props: [
        {
          name: "value",
          type: "T | T[]",
          desc: l.trans({
            en: "The selected value; an array when `multiple` is on.",
            ko: "선택된 값입니다. `multiple`을 켜면 배열입니다.",
          }),
        },
        {
          name: "onChange",
          type: "(value, prev) => void",
          desc: l.trans({
            en: "Receives the next value and the previous one.",
            ko: "새 값과 직전 값을 받습니다.",
          }),
        },
        {
          name: "options",
          type: "T[] | { label, value }[] | enumOf class",
          desc: l.trans({
            en: "The choices. An enum is listed under its dictionary's names; a value the dictionary does not name shows as is.",
            ko: "선택지입니다. enum은 dictionary에 적은 이름으로 표시되고, dictionary에 없는 값은 그대로 보입니다.",
          }),
        },
        {
          name: "label / desc",
          type: "ReactNode",
          desc: l.trans({
            en: "An optional label row above the field, with `desc` as a help tooltip.",
            ko: "필드 위에 붙는 선택적 라벨 행입니다. `desc`는 도움말 툴팁이 됩니다.",
          }),
        },
        {
          name: "multiple",
          type: "boolean",
          desc: l.trans({ en: "Allows several values.", ko: "여러 값을 고를 수 있게 합니다." }),
        },
        {
          name: "searchable",
          type: "boolean",
          desc: l.trans({
            en: "Adds a text box that filters the options by label. Non-string values then need pairs.",
            ko: "라벨로 선택지를 거르는 검색칸을 붙입니다. 이때 문자열이 아닌 값은 쌍으로 넘겨야 합니다.",
          }),
        },
        {
          name: "onSearch",
          type: "(text) => void",
          desc: l.trans({
            en: "Called 300 ms after typing stops, in place of the local filter.",
            ko: "입력이 멈추고 300ms 뒤에 호출되며, 로컬 필터 대신 동작합니다.",
          }),
        },
        {
          name: "nullable",
          type: "boolean",
          desc: l.trans({
            en: "Adds a clear row to the list and a clear button to the field.",
            ko: "목록에 비우기 행을, 필드에 지우기 버튼을 붙입니다.",
          }),
        },
        {
          name: "loading",
          type: "boolean",
          desc: l.trans({
            en: "Shows a spinner instead of the empty placeholder while options load.",
            ko: "선택지를 불러오는 동안 빈 목록 안내 대신 스피너를 보여줍니다.",
          }),
        },
        {
          name: "onOpen",
          type: "() => void",
          desc: l.trans({
            en: "Called when the list opens: the place to load options lazily.",
            ko: "목록이 열릴 때 호출됩니다. 선택지를 늦게 불러올 때 씁니다.",
          }),
        },
        {
          name: "renderOption / renderSelected",
          type: "(value) => ReactNode",
          desc: l.trans({
            en: "Custom drawing for a list row and for the chosen value.",
            ko: "목록의 행과 고른 값을 직접 그립니다.",
          }),
        },
        {
          name: "placeholder / empty",
          type: "string / ReactNode",
          desc: l.trans({
            en: "The text shown with nothing selected, and what an empty option list shows.",
            ko: "아무것도 고르지 않았을 때의 안내 문구와, 선택지가 없을 때 목록에 보일 내용입니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Blocks opening and picking; the published tool is withdrawn too.",
            ko: "목록 열기와 고르기를 막습니다. 공개된 툴도 함께 내려갑니다.",
          }),
        },
      ],
      codeTitle: "apps/koyo/ui/StatusFilter.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "Switch",
      desc: l.trans({
        en: 'A boolean drawn as `<button role="switch">`, so focus and Space/Enter toggling come from the browser. Pass `checked` to control it, or `defaultChecked` to let it keep its own state. For a model field with a label row, use `Field.Switch`.',
        ko: '`<button role="switch">`로 그린 boolean이라 포커스와 Space/Enter 토글을 브라우저가 처리합니다. `checked`를 넘기면 제어형으로, `defaultChecked`를 넘기면 자체 상태로 동작합니다. 라벨 행이 필요한 모델 필드라면 `Field.Switch`를 쓰세요.',
      }),
      props: [
        {
          name: "checked",
          type: "boolean",
          desc: l.trans({
            en: "Controlled state. Leave it out and the switch keeps its own.",
            ko: "제어형으로 쓸 때의 상태입니다. 빼면 스위치가 자체 상태를 가집니다.",
          }),
        },
        {
          name: "defaultChecked",
          type: "boolean",
          default: "false",
          desc: l.trans({
            en: "The starting position when uncontrolled.",
            ko: "자체 상태로 동작할 때의 시작 위치입니다.",
          }),
        },
        {
          name: "onChange",
          type: "(checked: boolean) => void",
          desc: l.trans({
            en: "Receives the next position. A form setter passed by reference is published to the agent.",
            ko: "바뀐 위치를 받습니다. 폼 setter를 참조로 넘기면 에이전트에 공개됩니다.",
          }),
        },
        {
          name: "variant",
          type: `"primary" | "accent" | "success"`,
          default: `"primary"`,
          desc: l.trans({
            en: "The color of the on position. The off position is always `bg-muted`.",
            ko: "켜졌을 때의 색입니다. 꺼졌을 때는 항상 `bg-muted`입니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Blocks the toggle and dims it; the published tool is withdrawn too.",
            ko: "토글을 막고 흐리게 표시합니다. 공개된 툴도 함께 내려갑니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Only a form setter becomes a tool.</strong> <code>{"set<Field>On<Model>"}</code> is published; a
              plain store setter such as <code>setNotify</code> below only marks the control with{" "}
              <code>data-akan-action</code> / <code>data-akan-state</code>.
            </>
          ),
          ko: (
            <>
              <strong>툴이 되는 것은 폼 setter뿐입니다.</strong> <code>{"set<Field>On<Model>"}</code>는 공개되지만, 아래{" "}
              <code>setNotify</code> 같은 일반 스토어 setter는 컨트롤에 <code>data-akan-action</code> /{" "}
              <code>data-akan-state</code> 표시만 붙습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>
                Inside a <code>Dropdown</code> menu item,
              </strong>{" "}
              put <code>data-dropdown-keep-open</code> on the <code>{"<li>"}</code> so flipping the switch does not
              close the menu.
            </>
          ),
          ko: (
            <>
              <strong>
                <code>Dropdown</code> 메뉴 항목 안에서는
              </strong>{" "}
              <code>{"<li>"}</code>에 <code>data-dropdown-keep-open</code>을 붙이세요. 그래야 스위치를 눌러도 메뉴가
              닫히지 않습니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/NotifyToggle.tsx",
      code: `"use client";
import { st } from "@apps/koyo/client";
import { Switch } from "akanjs/ui";

export const NotifyToggle = () => {
  const notify = st.use.notify();
  return (
    <Switch checked={notify} onChange={st.do.setNotify} variant="accent" />
  );
};`,
    },
    {
      name: "Radio",
      desc: l.trans({
        en: 'One choice from a `role="radiogroup"` of `role="radio"` buttons; arrow keys move the focus and the choice together. Each child carries its own `value`, and the group matches on it. A numeric `value` counts as an index only when no child owns it.',
        ko: '`role="radiogroup"` 안의 `role="radio"` 버튼으로 하나를 고르며, 화살표 키를 누르면 포커스와 선택이 함께 움직입니다. 자식마다 자기 `value`를 갖고, 그룹은 그 값으로 선택을 맞춥니다. 숫자 `value`는 어떤 자식도 그 값을 갖지 않을 때만 index로 해석됩니다.',
      }),
      props: [
        {
          name: "value",
          type: "string | number | null",
          desc: l.trans({
            en: "The selected child's `value`, or a position when no child declares one.",
            ko: "선택된 자식의 `value`입니다. 그 값을 가진 자식이 없으면 위치로 읽습니다.",
          }),
        },
        {
          name: "onChange",
          type: "(value, idx) => void",
          desc: l.trans({
            en: "Receives the chosen child's `value` and its index. Arrow keys call it too.",
            ko: "고른 자식의 `value`와 index를 받습니다. 화살표 키로 옮길 때도 호출됩니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({ en: "Disables every option.", ko: "모든 선택지를 비활성화합니다." }),
        },
        {
          name: "children",
          type: "ReactNode | ReactElement[]",
          desc: l.trans({
            en: "The options, usually `Radio.Item`s. The group draws the dot and the row around each.",
            ko: "선택지이며 보통 `Radio.Item`입니다. 점과 행은 그룹이 그리고, 자식은 본문만 그립니다.",
          }),
        },
        {
          name: "Radio.Item",
          type: "{ value, children, className?, checked?, onChange? }",
          desc: l.trans({
            en: "One option's body. It has its own override slot, `RadioItem`, apart from the group's.",
            ko: "선택지 하나의 본문입니다. 그룹과 별개인 오버라이드 슬롯 `RadioItem`을 가집니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>No agent tool.</strong> For a model field, use <code>Field.ToggleSelect</code>, which publishes
              one.
            </>
          ),
          ko: (
            <>
              <strong>에이전트 툴은 없습니다.</strong> 모델 필드라면 툴을 공개하는 <code>Field.ToggleSelect</code>를
              쓰세요.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/PlanPicker.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "ToggleSelect",
      desc: l.trans({
        en: "A choice as a row of pressed buttons instead of a dropdown, for a few short options. `ToggleSelect` picks one and `ToggleSelect.Multi` picks many. `nullable` and `validate` are required: a button row has no empty state to fall back on, so the call site decides both.",
        ko: "드롭다운 대신 눌리는 버튼 줄로 고르는 선택이며, 선택지가 적고 짧을 때 맞습니다. `ToggleSelect`는 하나, `ToggleSelect.Multi`는 여러 개를 고릅니다. 버튼 줄에는 돌아갈 빈 상태가 없으므로 `nullable`과 `validate`는 필수이고, 호출하는 쪽에서 둘 다 정합니다.",
      }),
      props: [
        {
          name: "items",
          type: "string[] | number[] | { label, value, disabled? }[]",
          desc: l.trans({
            en: "The cells. `Field.ToggleSelect` also takes an `enumOf(...)` and translates each value.",
            ko: "버튼 목록입니다. `Field.ToggleSelect`는 `enumOf(...)`도 받아 값마다 번역합니다.",
          }),
        },
        {
          name: "value",
          type: "I",
          desc: l.trans({ en: "The selected value.", ko: "선택된 값입니다." }),
        },
        {
          name: "nullable",
          type: "boolean",
          desc: l.trans({
            en: "Required. Whether the choice can be cleared; pressing the selected cell then calls `onClear`.",
            ko: "필수입니다. 선택을 비울 수 있는지 정하며, 켜면 선택된 버튼을 다시 눌렀을 때 `onClear`가 호출됩니다.",
          }),
        },
        {
          name: "validate",
          type: "(value) => boolean | string",
          desc: l.trans({
            en: "Required. Returns `true`, or the message to show under the row.",
            ko: "필수입니다. `true`를 반환하거나, 줄 아래에 띄울 메시지를 반환합니다.",
          }),
        },
        {
          name: "onChange / onClear",
          type: "(value, idx) => void / () => void",
          desc: l.trans({
            en: "The pick and the clear. `onClear` fires only in the `nullable` form.",
            ko: "고르기와 비우기입니다. `onClear`는 `nullable`일 때만 호출됩니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Disables every cell. An item's own `disabled` disables just that cell.",
            ko: "모든 버튼을 비활성화합니다. 항목의 `disabled`는 그 버튼 하나만 막습니다.",
          }),
        },
        {
          name: "renderItem",
          type: "(item, { selected, disabled, onToggle }) => ReactNode",
          desc: l.trans({
            en: "Draws one cell. `onToggle` is the cell's own action; put it on whatever the cell renders.",
            ko: "버튼 하나를 직접 그립니다. `onToggle`이 그 칸의 동작이므로, 그린 요소에 직접 연결하세요.",
          }),
        },
        {
          name: "ToggleSelect.Multi",
          type: "{ items, value: string[] | number[], nullable, validate, onChange }",
          desc: l.trans({
            en: "The many-choice form, with its own override slot, `ToggleSelectMulti`.",
            ko: "여러 개를 고르는 형태이며, 별도의 오버라이드 슬롯 `ToggleSelectMulti`를 가집니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>No agent tool.</strong> For a model field, use <code>Field.ToggleSelect</code> /{" "}
              <code>Field.MultiToggleSelect</code>: they add the label row and publish the setter.
            </>
          ),
          ko: (
            <>
              <strong>에이전트 툴은 없습니다.</strong> 모델 필드라면 <code>Field.ToggleSelect</code> /{" "}
              <code>Field.MultiToggleSelect</code>를 쓰세요. 라벨 행을 붙이고 setter도 공개합니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/SizePicker.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "DatePicker",
      desc: l.trans({
        en: "A date on the browser's own `<input type=\"date\">`, so the calendar, locale and touch keyboard are the platform's. The browser enforces `min` and `max`. A native field cannot grey out single days, so a pick that `disabledDate` rejects is refused with a warning toast.",
        ko: '브라우저 자체의 `<input type="date">`로 받는 날짜라, 달력·로케일·터치 키보드가 모두 플랫폼의 것입니다. `min`과 `max`는 브라우저가 지킵니다. 네이티브 필드는 특정 날짜만 흐리게 만들 수 없으므로, `disabledDate`에 걸린 선택은 경고 토스트와 함께 거절됩니다.',
      }),
      props: [
        {
          name: "value",
          type: "Dayjs | null",
          desc: l.trans({ en: "The current value.", ko: "현재 값입니다." }),
        },
        {
          name: "onChange",
          type: "(value: Dayjs | null) => void",
          desc: l.trans({ en: "Receives the next value.", ko: "바뀐 값을 받습니다." }),
        },
        {
          name: "showTime",
          type: "boolean",
          desc: l.trans({
            en: "Switches the native input to `datetime-local`.",
            ko: "네이티브 입력을 `datetime-local`로 바꿉니다.",
          }),
        },
        {
          name: "min / max",
          type: "Dayjs | null",
          desc: l.trans({
            en: "The earliest and latest values the browser lets you pick.",
            ko: "고를 수 있는 가장 이른 값과 가장 늦은 값이며, 브라우저가 지킵니다.",
          }),
        },
        {
          name: "disabledDate",
          type: "(date: Dayjs) => boolean | null | undefined",
          desc: l.trans({
            en: "Returns `true` for a date to refuse. It is checked on pick, not greyed out.",
            ko: "거절할 날짜에 `true`를 반환합니다. 흐리게 보이지 않고, 고를 때 검사합니다.",
          }),
        },
        {
          name: "defaultValue",
          type: "Dayjs",
          desc: l.trans({
            en: "Sent through `onChange` on mount, and again whenever it changes.",
            ko: "피커가 마운트될 때, 그리고 이 값이 바뀔 때마다 `onChange`로 보내집니다.",
          }),
        },
        {
          name: "DatePicker.RangePicker",
          type: "{ value: [Dayjs | null, Dayjs | null], onChange, showTime?, disabledDate? }",
          desc: l.trans({
            en: "Both ends as one tuple; an empty other end is filled with now. Slot `DatePickerRangePicker`.",
            ko: "양 끝을 튜플 하나로 받습니다. 비어 있는 반대쪽은 현재 시각으로 채웁니다. 슬롯은 `DatePickerRangePicker`입니다.",
          }),
        },
        {
          name: "DatePicker.TimePicker",
          type: "{ value: Dayjs | null, onChange, disabled?, disabledDate? }",
          desc: l.trans({
            en: "The time alone, kept on the day `value` already holds. Slot `DatePickerTimePicker`.",
            ko: "시각만 받으며, 날짜는 `value`가 가진 날을 유지합니다. 슬롯은 `DatePickerTimePicker`입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>No agent tool.</strong> For a model field, use <code>Field.Date</code> /{" "}
              <code>Field.DateRange</code>: they draw their own native input with a label row and publish the setter.
            </>
          ),
          ko: (
            <>
              <strong>에이전트 툴은 없습니다.</strong> 모델 필드라면 <code>Field.Date</code> /{" "}
              <code>Field.DateRange</code>를 쓰세요. 라벨 행이 달린 자체 네이티브 입력을 그리고 setter도 공개합니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/PeriodFilter.tsx",
      code: `"use client";
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
};`,
    },
    {
      name: "Button",
      desc: l.trans({
        en: "The one button primitive. A synchronous `onClick` renders a plain button; returning a promise puts the same button through loading, success or error, and blocks repeat clicks meanwhile. There is no separate async button to choose.",
        ko: "버튼 컴포넌트는 이것 하나뿐입니다. `onClick`이 동기면 평범한 버튼이고, promise를 반환하면 같은 버튼이 로딩·성공·오류 상태를 거치며 그동안 중복 클릭을 막습니다. 비동기용 버튼을 따로 고를 필요가 없습니다.",
      }),
      props: [
        {
          name: "onClick",
          type: "(event, { onError }) => Promise<Result> | Result",
          desc: l.trans({
            en: "Optional. A returned promise turns on the async states; anything else keeps it plain.",
            ko: "선택입니다. promise를 반환하면 비동기 상태가 켜지고, 그 밖의 값이면 평범한 버튼으로 남습니다.",
          }),
        },
        {
          name: "onSuccess",
          type: "(result) => void",
          desc: l.trans({
            en: "Called with the result after the success check has shown for 0.7 s.",
            ko: "성공 체크 표시가 0.7초 동안 보인 뒤 결과와 함께 호출됩니다.",
          }),
        },
        {
          name: "loadingMode",
          type: `"hold" | "replace"`,
          default: `"hold"`,
          desc: l.trans({
            en: "The box never resizes: `hold` overlays a spinner, `replace` cross-fades to a labelled one.",
            ko: "버튼 크기는 변하지 않습니다. `hold`는 스피너를 겹쳐 그리고, `replace`는 문구가 있는 표시로 교차 전환합니다.",
          }),
        },
        {
          name: "showError",
          type: "boolean",
          default: "true",
          desc: l.trans({
            en: "Shows the `onError` message under the button. Off, nothing shows it; toast it yourself.",
            ko: "`onError` 메시지를 버튼 아래에 띄웁니다. 끄면 어디에도 표시되지 않으니 직접 토스트로 알리세요.",
          }),
        },
        {
          name: "variant / size / shape / outline",
          type: "ButtonVariants",
          default: `"primary" / "md" / "default"`,
          desc: l.trans({
            en: "The `buttonRecipe` look: color, size, corner shape and the outline flag.",
            ko: "`buttonRecipe`의 모양입니다. 색, 크기, 모서리 모양, 외곽선 여부를 정합니다.",
          }),
        },
        {
          name: "type",
          type: `"button" | "submit" | "reset"`,
          default: `"button"`,
          desc: l.trans({
            en: "The native type. It defaults to `button`, so a click never submits a surrounding form.",
            ko: "네이티브 type입니다. 기본값이 `button`이라 클릭해도 바깥 form이 제출되지 않습니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Native prop. The button is also disabled while loading and during the success check.",
            ko: "네이티브 prop입니다. 로딩 중과 성공 체크가 보이는 동안에도 비활성화됩니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Fail without throwing.</strong> Call <code>{'onError("<dictionary key>")'}</code>: the success
              check is skipped and the key shows translated under the button.
            </>
          ),
          ko: (
            <>
              <strong>던지지 않고 실패 알리기.</strong> <code>{'onError("<dictionary key>")'}</code>를 호출하세요. 성공
              체크는 건너뛰고, 버튼 아래에 번역된 메시지가 뜹니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>A rejected promise resets quietly.</strong> The button returns to idle without a check; the store
              action or fetch that threw has already shown the error.
            </>
          ),
          ko: (
            <>
              <strong>reject되면 조용히 돌아갑니다.</strong> 버튼은 체크 표시 없이 원래 상태로 돌아가고, 에러는 예외를
              던진 스토어 액션이나 fetch가 이미 보여 줍니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Two ways to re-skin.</strong> The override slot <code>Button</code> replaces the whole component;
              the recipe slot <code>recipes.button</code> swaps only its look.
            </>
          ),
          ko: (
            <>
              <strong>바꿔 입히는 방법은 둘입니다.</strong> 오버라이드 슬롯 <code>Button</code>은 컴포넌트 전체를,
              레시피 슬롯 <code>recipes.button</code>은 모양만 바꿉니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/Actions.tsx",
      code: `"use client";
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
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="forms-ui" title={l.trans({ en: "Forms UI", ko: "폼 UI" })}>
        <Docs.Title>{l.trans({ en: "Forms UI", ko: "폼 UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The form controls in <code>akanjs/ui</code>. A model form keeps its state in the store's{" "}
                  <code>{"<model>Form"}</code>, a generated setter writes one field, and a control only shows the
                  current value and hands back the next one.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code>의 폼 컨트롤입니다. 모델 폼의 상태는 스토어의 <code>{"<model>Form"}</code>에
                  있고, 생성된 setter가 필드 하나씩 값을 바꿉니다. 컨트롤은 현재 값을 보여주고 다음 값을 돌려줄
                  뿐입니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Pick a control", ko: "컨트롤 고르기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Work down the groups: <code>Field.*</code> for a model field, a bare control when there is no label
                  row, and <code>Button</code> for the action at the end.
                </span>
              ),
              ko: (
                <span>
                  위에서부터 고르세요. 모델 필드는 <code>Field.*</code>, 라벨 행이 필요 없으면 단독 컨트롤, 마지막
                  동작은 <code>Button</code>입니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Component", ko: "컴포넌트" })}
            columns={controlColumns}
            groups={controlGroups}
            markLabel={l.trans({ en: "Has it", ko: "있음" })}
            emptyLabel={l.trans({ en: "Does not", ko: "없음" })}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>Pass every setter by reference.</strong> <code>{"onChange={st.do.setSizeOnTicket}"}</code>{" "}
                  publishes the field as an agent tool and adds <code>data-akan-action</code> /{" "}
                  <code>data-akan-state</code> to the control.{" "}
                  <code>{"onChange={(size) => st.do.setSizeOnTicket(size)}"}</code> runs the same and publishes nothing.
                </span>
              ),
              ko: (
                <span>
                  <strong>setter는 반드시 참조로 넘기세요.</strong> <code>{"onChange={st.do.setSizeOnTicket}"}</code>은
                  필드를 에이전트 툴로 공개하고 컨트롤에 <code>data-akan-action</code> / <code>data-akan-state</code>를
                  붙입니다. <code>{"onChange={(size) => st.do.setSizeOnTicket(size)}"}</code>는 똑같이 동작하지만
                  아무것도 공개하지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <DocsToc />
    </Scroll>
  );
});
