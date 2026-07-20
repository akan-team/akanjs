import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const slotGroups = [
    {
      title: l.trans({ en: "Leaf primitives", ko: "Leaf primitive" }),
      slots: ["Modal", "Empty", "Pagination", "Popconfirm", "Dropdown", "Table", "Menu", "Unauthorized"],
    },
    { title: l.trans({ en: "Generic", ko: "Generic" }), slots: ["Button", "Select"] },
    {
      title: l.trans({ en: "Input (compound)", ko: "Input (compound)" }),
      slots: ["Input", "InputTextArea", "InputPassword", "InputEmail", "InputNumber", "InputCheckbox"],
    },
    { title: l.trans({ en: "Radio (compound)", ko: "Radio (compound)" }), slots: ["Radio", "RadioItem"] },
    {
      title: l.trans({ en: "DatePicker (compound)", ko: "DatePicker (compound)" }),
      slots: ["DatePicker", "DatePickerRangePicker", "DatePickerTimePicker"],
    },
    {
      title: l.trans({ en: "ToggleSelect (compound)", ko: "ToggleSelect (compound)" }),
      slots: ["ToggleSelect", "ToggleSelectMulti"],
    },
    {
      title: l.trans({ en: "Loading (namespace)", ko: "Loading (namespace)" }),
      slots: ["LoadingSpin", "LoadingSkeleton", "LoadingProgressBar", "LoadingButton", "LoadingInput", "LoadingArea"],
    },
  ];

  const brandComponentCode = `"use client";
// apps/<app>/ui/BrandModal.tsx
import { Dialog, type AkanModalComponent } from "akanjs/ui";

// Compose the framework's headless parts so you re-skin the surface without re-owning
// focus-trap, escape handling, scroll-lock, or portal behavior. Typed as the slot contract,
// so it is checked as a drop-in replacement for the framework <Modal>.
export const BrandModal: AkanModalComponent = ({ open, onCancel, title, children }) => (
  <Dialog open={open}>
    <Dialog.Modal className="border-4 border-primary" onCancel={onCancel}>
      {title ? <Dialog.Title>{title}</Dialog.Title> : null}
      <Dialog.Content>{children}</Dialog.Content>
    </Dialog.Modal>
  </Dialog>
);`;

  const manifestCode = `// apps/<app>/page/_overrides.tsx  — a plain module, NO "use client"
import { BrandModal } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

// override() type-checks each binding against the slot's contract and rejects unknown slots.
export default override({ Modal: BrandModal });`;

  const scopingCode = `// page/_overrides.tsx            → applies to the whole app
export default override({ Modal: BrandModal });

// page/(admin)/_overrides.tsx    → narrows the (admin) subtree; closest ancestor wins,
//                                   and unlisted slots keep inheriting from above.
export default override({ Modal: AdminModal, Table: AdminTable });`;

  const genericCode = `// The public <Button<Todo> … /> keeps full generic inference at every call site.
// Your override is authored against the widest prop type — no generics required of you.
import type { AkanUiOverrides } from "akanjs/ui";

export const BrandButton: AkanUiOverrides["Button"] = ({ children, onClick, ...rest }) => (
  <button className="btn btn-primary" onClick={(e) => onClick(e, { onError: () => {} })} {...rest}>
    {children}
  </button>
);`;

  const compoundCode = `// Each compound leaf is its own slot: InputPassword, InputCheckbox, RadioItem,
// DatePickerRangePicker, LoadingSpin, … so you re-skin exactly one field.
import { BrandCheckbox } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({ InputCheckbox: BrandCheckbox });
// <Input.Checkbox /> now renders BrandCheckbox; <Input />, <Input.Password /> stay default.`;

  return (
    <Scroll>
      <Scroll.Slide id="customization" title={l.trans({ en: "Customization", ko: "커스터마이즈" })}>
        <Docs.Title>{l.trans({ en: "Customization", ko: "커스터마이즈" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Any `akanjs/ui` component can be re-skinned per route without forking it. You write a drop-in replacement in your app's `ui/` folder and bind it to a framework slot in a `page/**/_overrides.tsx` manifest. Every existing `<Modal>`, `<Button>`, `<Table>` call site in that route subtree then renders your version instead — no call-site changes.",
              ko: "모든 `akanjs/ui` 컴포넌트는 fork 없이 route 단위로 re-skin할 수 있습니다. app의 `ui/` 폴더에 drop-in 교체 컴포넌트를 작성하고 `page/**/_overrides.tsx` manifest에서 framework slot에 bind하면 됩니다. 해당 route subtree의 기존 `<Modal>`, `<Button>`, `<Table>` 호출부는 call-site 변경 없이 여러분의 버전으로 렌더링됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Overrides cascade down the route tree exactly like layouts: an override declared higher up applies to everything below it, and a nested manifest narrows or replaces it for its own subtree (closest ancestor wins).",
              ko: "override는 layout과 똑같이 route tree를 따라 cascade됩니다. 상위에 선언한 override는 그 아래 전체에 적용되고, 하위 manifest는 자신의 subtree에 대해 이를 좁히거나 교체합니다(가장 가까운 조상이 우선).",
            })}
          </div>
        </Docs.Description>
        <Docs.Alert type="info">
          {l.trans({
            en: 'The `_overrides.tsx` manifest is logic-free and needs no `"use client"` directive. `override()` returns a plain, server-safe map; the framework generates the client boundary that mounts the provider. Keep the file to imports plus a single `export default override({ … })`.',
            ko: '`_overrides.tsx` manifest는 logic-free이고 `"use client"` directive가 필요 없습니다. `override()`는 server-safe한 순수 map을 반환하고, provider를 mount하는 client boundary는 framework가 생성합니다. 파일은 import와 단 하나의 `export default override({ … })`로만 유지하세요.',
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="how-it-works" title={l.trans({ en: "How it works", ko: "동작 방식" })}>
        <Docs.Title>{l.trans({ en: "How it works", ko: "동작 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: '1. Write a drop-in component in `apps/<app>/ui/`. Type it against the slot contract (`AkanModalComponent`, or `AkanUiOverrides["<Slot>"]` for any other slot) so it is verified as a real replacement. Compose the framework\'s headless parts (e.g. `Dialog`) instead of re-implementing behavior.',
              ko: '1. `apps/<app>/ui/`에 drop-in 컴포넌트를 작성합니다. slot contract(`AkanModalComponent`, 그 외 slot은 `AkanUiOverrides["<Slot>"]`)로 타입을 지정해 실제 교체 가능 여부를 검증받으세요. 동작을 재구현하지 말고 framework의 headless 부품(예: `Dialog`)을 조합하세요.',
            })}
          </div>
        </Docs.Description>
        <Docs.CodeSnippet
          title={l.trans({ en: "1. App component", ko: "1. App 컴포넌트" })}
          code={brandComponentCode}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "2. Declare it in `page/**/_overrides.tsx`. `override(map)` is a typed identity helper: keys are the PascalCase framework slot names, each value is checked against that slot's props, and unknown slot names are rejected at compile time.",
              ko: "2. `page/**/_overrides.tsx`에 선언합니다. `override(map)`은 typed identity helper입니다. key는 PascalCase framework slot 이름이고, 각 value는 해당 slot의 props로 검사되며, 알 수 없는 slot 이름은 compile 시점에 거부됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.CodeSnippet title={l.trans({ en: "2. Manifest", ko: "2. Manifest" })} code={manifestCode} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="scoping" title={l.trans({ en: "Scoping", ko: "적용 범위" })}>
        <Docs.Title>{l.trans({ en: "Scoping", ko: "적용 범위" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Place `_overrides.tsx` at `page/` for an app-wide skin, or inside any route group / segment to scope it to that subtree. Nested manifests merge over ancestors slot-by-slot, so a child manifest only overrides the slots it lists and inherits the rest.",
              ko: "app 전체 skin은 `page/`에, 특정 subtree에만 적용하려면 route group/segment 안에 `_overrides.tsx`를 두세요. 중첩된 manifest는 slot 단위로 조상 위에 merge되므로, 자식 manifest는 나열한 slot만 override하고 나머지는 상속합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.CodeSnippet title={l.trans({ en: "Nested scoping", ko: "중첩 적용" })} code={scopingCode} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="slots" title={l.trans({ en: "Overridable slots", ko: "Override 가능한 slot" })}>
        <Docs.Title>{l.trans({ en: "Overridable slots", ko: "Override 가능한 slot" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The framework exposes these slots. Behavioral/infrastructure components (Portal, InfiniteScroll, ClientSide, …) are intentionally not overridable — they are wiring, not skins.",
              ko: "framework가 제공하는 slot 목록입니다. 동작/인프라 성격의 컴포넌트(Portal, InfiniteScroll, ClientSide, …)는 skin이 아니라 wiring이므로 의도적으로 override 대상에서 제외했습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          {slotGroups.map(({ title, slots }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="mb-2 font-bold text-base-content">{title}</div>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <span key={slot} className="rounded-md bg-base-200 px-2 py-1 font-mono text-base-content/80 text-sm">
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="generic-components" title={l.trans({ en: "Generic components", ko: "Generic 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Generic components", ko: "Generic 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Button` and `Select` are generic. The public component keeps its full generic signature, so call sites like `<Select<MyEnum, true> … />` still infer their value and onChange shapes. The override slot stores the widest instantiation, so you author a plain, non-generic replacement.",
              ko: "`Button`과 `Select`는 generic입니다. 공개 컴포넌트는 generic signature를 그대로 유지하므로 `<Select<MyEnum, true> … />` 같은 call-site는 value/onChange 형태를 그대로 추론합니다. override slot은 가장 넓은 instantiation을 저장하므로, 여러분은 generic 없는 평범한 교체 컴포넌트를 작성하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.CodeSnippet title={l.trans({ en: "Generic override", ko: "Generic override" })} code={genericCode} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="compound-components" title={l.trans({ en: "Compound components", ko: "Compound 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Compound components", ko: "Compound 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Components with sub-parts — `Input.Password`, `Radio.Item`, `DatePicker.RangePicker`, `ToggleSelect.Multi`, and every `Loading.*` member — expose one slot per leaf, named `<Base><Sub>` (e.g. `InputPassword`, `LoadingSpin`). Override just the leaves you want; the rest keep their defaults, and `Input.Password` / `Loading.Spin` access stays intact.",
              ko: "하위 부품을 가진 컴포넌트(`Input.Password`, `Radio.Item`, `DatePicker.RangePicker`, `ToggleSelect.Multi`, 그리고 모든 `Loading.*` member)는 leaf마다 하나의 slot을 노출하며 이름은 `<Base><Sub>`입니다(예: `InputPassword`, `LoadingSpin`). 원하는 leaf만 override하면 나머지는 기본값을 유지하고, `Input.Password` / `Loading.Spin` 접근도 그대로 동작합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.CodeSnippet
          title={l.trans({ en: "Compound leaf override", ko: "Compound leaf override" })}
          code={compoundCode}
        />
      </Scroll.Slide>

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
