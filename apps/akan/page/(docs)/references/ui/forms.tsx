import { usePage } from "@apps/akan/client";
import { Docs, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "Field",
      desc: l.trans({
        en: "High-level form field namespace. It combines labels, descriptions, optional markers, validation-friendly inputs, and many typed controls used inside module templates.",
        ko: "high-level form field namespace입니다. label, description, optional marker, validation-friendly input, module template에서 쓰는 여러 typed control을 조합합니다.",
      }),
      props: [
        {
          name: "label / desc",
          type: "string",
          desc: l.trans({
            en: "Shown above the control, with desc rendered as help text.",
            ko: "control 위에 표시되며 desc는 help text로 렌더링됩니다.",
          }),
        },
        {
          name: "nullable",
          type: "boolean",
          desc: l.trans({
            en: "Marks the label as optional and relaxes validation in many field variants.",
            ko: "label을 optional로 표시하고 여러 field variant에서 validation을 완화합니다.",
          }),
        },
        {
          name: "Field.Text / Number / Date",
          type: "subcomponents",
          desc: l.trans({ en: "Common scalar field controls.", ko: "자주 쓰이는 scalar field control입니다." }),
        },
        {
          name: "Field.Parent / Children",
          type: "subcomponents",
          desc: l.trans({
            en: "Relation-oriented controls used by generated model templates.",
            ko: "generated model template에서 사용하는 relation-oriented control입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: "`libs/shared/ui/Field` wraps and extends `akanjs/ui` Field for project-specific controls such as rich text, maps, and postcode.",
          ko: "`libs/shared/ui/Field`는 rich text, map, postcode 같은 project-specific control을 위해 `akanjs/ui` Field를 감싸고 확장합니다.",
        }),
      ],
      code: `import { Field, Layout } from "akanjs/ui";

export const ProductTemplate = ({ form, setForm }) => (
  <Layout.Template>
    <Field.Text
      label="name"
      value={form.name}
      onChange={(name) => setForm({ name })}
      nullable={false}
    />
    <Field.Number
      label="price"
      value={form.price}
      onChange={(price) => setForm({ price })}
    />
  </Layout.Template>
);`,
    },
    {
      name: "Input",
      desc: l.trans({
        en: "Controlled primitive input namespace. Use it when you need lower-level input control than `Field`, such as custom search boxes or lightweight inline forms.",
        ko: "controlled primitive input namespace입니다. custom search box나 lightweight inline form처럼 `Field`보다 낮은 수준의 input 제어가 필요할 때 사용합니다.",
      }),
      props: [
        {
          name: "value",
          type: "string",
          desc: l.trans({ en: "Controlled input value.", ko: "controlled input value입니다." }),
        },
        {
          name: "onChange",
          type: "(value, event?) => void",
          desc: l.trans({ en: "Receives the next string value.", ko: "다음 string value를 받습니다." }),
        },
        {
          name: "validate",
          type: "(value) => boolean | string",
          desc: l.trans({
            en: "Returns true for valid input or an error message.",
            ko: "valid input이면 true를, 아니면 error message를 반환합니다.",
          }),
        },
        {
          name: "cacheKey",
          type: "string",
          desc: l.trans({ en: "Persists text to sessionStorage.", ko: "text를 sessionStorage에 저장합니다." }),
        },
        {
          name: "Input.TextArea / Password / Email",
          type: "subcomponents",
          desc: l.trans({ en: "Specialized input variants.", ko: "특화된 input variant입니다." }),
        },
      ],
      code: `import { Input } from "akanjs/ui";

export const SearchInput = ({ query, setQuery }) => (
  <Input
    value={query}
    onChange={setQuery}
    placeholder="Search"
    inputStyleType="underline"
    onPressEnter={(value) => console.info(value)}
  />
);`,
    },
    {
      name: "Select",
      desc: l.trans({
        en: "Controlled selector that accepts primitive arrays, label/value options, or Akan enum instances. It supports single, multiple, and searchable selection modes.",
        ko: "primitive array, label/value option, Akan enum instance를 받을 수 있는 controlled selector입니다. single, multiple, searchable selection mode를 지원합니다.",
      }),
      props: [
        {
          name: "value",
          type: "T | T[]",
          desc: l.trans({
            en: "Selected value, or selected values when multiple is true.",
            ko: "선택된 value입니다. multiple이 true이면 selected values입니다.",
          }),
        },
        {
          name: "options",
          type: "T[] | { label, value }[] | enum",
          desc: l.trans({ en: "Option source.", ko: "option source입니다." }),
        },
        {
          name: "multiple",
          type: "boolean",
          desc: l.trans({ en: "Enable multiple selected values.", ko: "여러 값을 선택할 수 있게 합니다." }),
        },
        {
          name: "searchable",
          type: "boolean",
          desc: l.trans({
            en: "Show search input and optionally call onSearch.",
            ko: "search input을 표시하고 필요하면 onSearch를 호출합니다.",
          }),
        },
        {
          name: "renderOption / renderSelected",
          type: "(value) => ReactNode",
          desc: l.trans({ en: "Custom display renderers.", ko: "custom display renderer입니다." }),
        },
      ],
      code: `import { Select } from "akanjs/ui";

export const StatusSelect = ({ status, setStatus }) => (
  <Select
    label="status"
    value={status}
    options={["ready", "running", "done"]}
    onChange={(next) => setStatus(next)}
  />
);`,
    },
    {
      name: "Button",
      desc: l.trans({
        en: "Async-aware button with built-in loading, success, and error state. It is useful for actions that return promises and should prevent duplicate clicks while processing.",
        ko: "loading, success, error state가 내장된 async-aware button입니다. promise를 반환하고 처리 중 중복 클릭을 막아야 하는 action에 유용합니다.",
      }),
      props: [
        {
          name: "onClick",
          type: "(event, { onError }) => Promise<Result> | Result",
          desc: l.trans({ en: "Async-aware click handler.", ko: "async-aware click handler입니다." }),
        },
        {
          name: "onSuccess",
          type: "(result) => void",
          desc: l.trans({
            en: "Called after the success state is shown briefly.",
            ko: "success state가 짧게 표시된 뒤 호출됩니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Inherited native button prop; also disabled while loading/success.",
            ko: "native button에서 상속된 prop입니다. loading/success 중에도 disabled됩니다.",
          }),
        },
      ],
      code: `import { Button } from "akanjs/ui";

export const SaveButton = ({ save }) => (
  <Button
    className="btn-primary"
    onClick={async (_event, { onError }) => {
      const result = await save();
      if (!result.ok) onError("base.error");
      return result;
    }}
  >
    Save
  </Button>
);`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="forms-ui" title={l.trans({ en: "Forms UI", ko: "Forms UI" })}>
        <Docs.Title>{l.trans({ en: "Forms UI", ko: "Forms UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Form components range from high-level `Field.*` controls used in module templates to lower-level `Input`, `Select`, and async `Button` primitives.",
              ko: "Form component는 module template에서 쓰는 high-level `Field.*` control부터 low-level `Input`, `Select`, async `Button` primitive까지 포함합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
