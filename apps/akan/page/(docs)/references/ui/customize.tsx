import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "slot", ko: "슬롯" })}</span>,
      desc: l.trans({
        en: "A named place where a framework component can be swapped, such as `Modal` or `InputPassword`.",
        ko: "프레임워크 컴포넌트를 갈아 끼울 수 있는 이름 붙은 자리입니다. `Modal`, `InputPassword` 같은 것입니다.",
      }),
    },
    {
      name: "_overrides.tsx",
      desc: l.trans({
        en: "The manifest in a `page/` folder that binds slots for every route under that folder.",
        ko: "`page/` 폴더에 두는 매니페스트입니다. 그 폴더 아래 모든 라우트의 슬롯을 연결합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "drop-in", ko: "교체 컴포넌트" })}</span>,
      desc: l.trans({
        en: "Your replacement. It takes the same props as the original, so no call site changes.",
        ko: "여러분이 만든 대체품입니다. 원래 컴포넌트와 같은 props를 받으므로 호출부는 그대로입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "headless parts", ko: "headless 부품" })}</span>,
      desc: l.trans({
        en: "Parts with behavior but no look of their own, such as `Dialog.Modal`.",
        ko: "동작은 있고 자기 모양은 없는 부품입니다. `Dialog.Modal`이 그 예입니다.",
      }),
    },
    {
      name: "recipe",
      desc: l.trans({
        en: 'A function that returns the className for a variant, such as `buttonRecipe({ variant: "primary" })`.',
        ko: 'variant에 맞는 className을 돌려주는 함수입니다. `buttonRecipe({ variant: "primary" })`처럼 씁니다.',
      }),
    },
  ];

  const kindCards = [
    {
      title: l.trans({ en: "Component slot", ko: "컴포넌트 슬롯" }),
      meta: l.trans({ en: "46 slots · typed by AkanUiOverrides", ko: "슬롯 46개 · 타입은 AkanUiOverrides" }),
      desc: l.trans({
        en: (
          <span>
            Replaces the whole component (markup, classes, and any behavior you do not reuse) with one you write in{" "}
            <code>{"apps/<app>/ui/"}</code>. Every call site and its props stay.
          </span>
        ),
        ko: (
          <span>
            컴포넌트 전체(마크업, 클래스, 재사용하지 않은 동작)를 <code>{"apps/<app>/ui/"}</code>에 만든 컴포넌트로
            바꿉니다. 모든 호출부와 그 props는 그대로입니다.
          </span>
        ),
      }),
      code: "override({ Modal: BrandModal })",
    },
    {
      title: l.trans({ en: "Recipe slot", ko: "레시피 슬롯" }),
      meta: l.trans({ en: "3 slots · typed by AkanUiRecipes", ko: "슬롯 3개 · 타입은 AkanUiRecipes" }),
      desc: l.trans({
        en: (
          <span>
            Replaces only the classes, with a recipe in <code>{"apps/<app>/ui/Recipe/"}</code>. Call sites, markup,
            async states, focus handling and a11y stay.
          </span>
        ),
        ko: (
          <span>
            클래스만 <code>{"apps/<app>/ui/Recipe/"}</code>의 recipe로 바꿉니다. 호출부, 마크업, async 상태, 포커스
            처리, 접근성은 그대로입니다.
          </span>
        ),
      }),
      code: "override({ recipes: { button: neonButtonRecipe } })",
    },
  ];

  const exportRows = [
    {
      name: "override",
      desc: l.trans({
        en: "Builds the manifest an `_overrides.tsx` exports. It returns the map as is and only checks types.",
        ko: "`_overrides.tsx`가 export하는 매니페스트를 만듭니다. 인자를 그대로 돌려주고 타입만 검사합니다.",
      }),
    },
    {
      name: "AkanUiOverrides",
      desc: l.trans({
        en: 'Maps every slot name to its component type. Type a replacement as `AkanUiOverrides["Table"]`.',
        ko: '슬롯 이름마다 컴포넌트 타입을 매핑합니다. 교체 컴포넌트에 `AkanUiOverrides["Table"]`처럼 붙입니다.',
      }),
    },
    {
      name: "AkanModalComponent",
      desc: l.trans({
        en: 'Shorthand for `AkanUiOverrides["Modal"]`.',
        ko: '`AkanUiOverrides["Modal"]`의 줄임 타입입니다.',
      }),
    },
    {
      name: "AkanUiRecipes",
      desc: l.trans({
        en: "Maps each recipe slot (`button`, `badge`, `input`) to its className factory type.",
        ko: "레시피 슬롯(`button`, `badge`, `input`)마다 className 팩토리 타입을 매핑합니다.",
      }),
    },
    {
      name: ["AkanUiOverrideManifest", "AkanUiOverrideName"],
      desc: l.trans({
        en: "The shape of a whole manifest, and the union of slot names.",
        ko: "매니페스트 전체의 모양, 그리고 슬롯 이름의 union입니다.",
      }),
    },
    {
      name: "Dialog",
      desc: l.trans({
        en: "Headless parts (`.Modal`, `.Title`, `.Content`, `.Action`, `.Trigger`) to build a `Modal` from.",
        ko: "`Modal` 교체본을 조립하는 headless 부품(`.Modal`, `.Title`, `.Content`, `.Action`, `.Trigger`)입니다.",
      }),
    },
    {
      name: [
        "DefaultApproval",
        "DefaultBubble",
        "DefaultCode",
        "DefaultComposer",
        "DefaultLauncher",
        "DefaultMarkdown",
        "DefaultAgentMenu",
        "DefaultQuestion",
        "DefaultQueued",
        "DefaultSteps",
        "DefaultToolCard",
        "DefaultToast",
        "DefaultToastItem",
      ],
      desc: l.trans({
        en: "The shipped defaults of the eleven chat-part slots and both Toast slots, to wrap instead of rewrite.",
        ko: "채팅 부품 슬롯 열한 개와 Toast 슬롯 두 개의 기본 구현입니다. 다시 쓰지 않고 감싸서 쓸 수 있습니다.",
      }),
    },
    {
      name: "agentAttrs",
      desc: l.trans({
        en: "The `data-akan-*` attributes a default control carries for the agent; spread them on a replacement.",
        ko: "기본 컨트롤이 에이전트용으로 다는 `data-akan-*` 속성입니다. 교체 컴포넌트에 펼쳐 넣습니다.",
      }),
    },
    {
      name: "triggerSlot",
      desc: l.trans({
        en: "Puts a `Dropdown`'s click and aria state onto the trigger your replacement draws.",
        ko: "`Dropdown`의 클릭과 aria 상태를 교체 컴포넌트가 그리는 트리거에 직접 붙입니다.",
      }),
    },
    {
      name: "UiOverrideProvider",
      desc: l.trans({
        en: "Mounts an override map by hand around any subtree, merged over the route's manifest.",
        ko: "원하는 하위 트리에 override 맵을 직접 마운트합니다. 라우트 매니페스트 위에 합쳐집니다.",
      }),
    },
    {
      name: ["useUiOverride", "useUiRecipe"],
      desc: l.trans({
        en: "Read the component or recipe bound to a slot in this subtree, or `undefined`.",
        ko: "이 하위 트리에서 슬롯에 연결된 컴포넌트나 recipe를 읽습니다. 없으면 `undefined`입니다.",
      }),
    },
    {
      name: "createOverridable",
      desc: l.trans({
        en: "Wraps a component so it resolves through a named slot and falls back to the default.",
        ko: "컴포넌트를 감싸 이름 붙은 슬롯을 거쳐 결정되게 하고, 연결이 없으면 기본값을 씁니다.",
      }),
    },
  ];

  const placeRows = [
    {
      name: "page/_overrides.tsx",
      desc: l.trans({ en: "Every route in the app.", ko: "앱의 모든 라우트" }),
    },
    {
      name: "page/(admin)/_overrides.tsx",
      desc: l.trans({ en: "Only the routes inside the `(admin)` group.", ko: "`(admin)` 그룹 안의 라우트만" }),
    },
    {
      name: "page/settings/_overrides.tsx",
      desc: l.trans({ en: "`/settings` and every route under it.", ko: "`/settings`와 그 아래 모든 라우트" }),
    },
  ];

  const slotRows = [
    {
      name: [
        "Badge",
        "Modal",
        "Empty",
        "Pagination",
        "Popconfirm",
        "Dropdown",
        "Table",
        "Menu",
        "Tooltip",
        "Unauthorized",
      ],
      desc: l.trans({
        en: "Standalone components. The key is the name you render: `<Modal>` binds `Modal`.",
        ko: "단독 컴포넌트입니다. 렌더하는 이름이 곧 키입니다. `<Modal>`은 `Modal`입니다.",
      }),
    },
    {
      name: ["Button", "Select"],
      desc: l.trans({
        en: "Generic components. Your replacement is written without generics; see Generic Components.",
        ko: "제네릭 컴포넌트입니다. 교체 컴포넌트는 제네릭 없이 씁니다. 아래 제네릭 컴포넌트 절을 보세요.",
      }),
    },
    {
      name: ["Input", "InputTextArea", "InputPassword", "InputEmail", "InputNumber", "InputCheckbox"],
      desc: l.trans({
        en: "`Input` and its five leaves, `Input.TextArea` through `Input.Checkbox`.",
        ko: "`Input`과 leaf 다섯 개(`Input.TextArea`부터 `Input.Checkbox`까지)입니다.",
      }),
    },
    {
      name: ["Radio", "RadioItem"],
      desc: l.trans({ en: "`Radio` and `Radio.Item`.", ko: "`Radio`와 `Radio.Item`입니다." }),
    },
    {
      name: ["DatePicker", "DatePickerRangePicker", "DatePickerTimePicker"],
      desc: l.trans({
        en: "`DatePicker` with `.RangePicker` and `.TimePicker`.",
        ko: "`DatePicker`와 `.RangePicker`, `.TimePicker`입니다.",
      }),
    },
    {
      name: ["ToggleSelect", "ToggleSelectMulti"],
      desc: l.trans({
        en: "The generic `ToggleSelect` and its `.Multi` leaf.",
        ko: "제네릭 `ToggleSelect`와 그 `.Multi` leaf입니다.",
      }),
    },
    {
      name: ["LoadingSpin", "LoadingSkeleton", "LoadingProgressBar", "LoadingButton", "LoadingInput", "LoadingArea"],
      desc: l.trans({
        en: "Each `Loading.*` member. `Loading` itself is a plain namespace with no slot.",
        ko: "`Loading.*` 멤버 하나하나입니다. `Loading` 자체는 슬롯이 없는 단순 네임스페이스입니다.",
      }),
    },
    {
      name: ["Toast", "ToastItem"],
      desc: l.trans({
        en: "The toast stack, and one toast card inside it.",
        ko: "토스트 묶음, 그리고 그 안의 토스트 카드 하나입니다.",
      }),
    },
    {
      name: "DraftBar",
      desc: l.trans({
        en: "The banner an edit shell shows for a recovered form. Restore and discard stay wired.",
        ko: "편집 셸이 복구한 폼에 띄우는 배너입니다. 복원과 버리기 동작은 그대로 연결돼 있습니다.",
      }),
    },
    {
      name: [
        "AgentChat",
        "AgentLauncher",
        "AgentBubble",
        "AgentSteps",
        "AgentComposer",
        "AgentApproval",
        "AgentQuestion",
        "AgentQueued",
        "AgentMenu",
        "AgentMarkdown",
        "AgentToolCard",
        "AgentCode",
      ],
      desc: l.trans({
        en: "The in-page chat. `AgentChat` swaps the whole panel; the other eleven each swap one part.",
        ko: "인페이지 채팅입니다. `AgentChat`은 패널 전체를, 나머지 열한 개는 각자 한 부분을 바꿉니다.",
      }),
    },
  ];

  const notSlotRows = [
    {
      name: ["Portal", "InfiniteScroll", "ClientSide"],
      desc: l.trans({
        en: "Wiring with no look of its own, like every behavior-only component, so there is nothing to swap.",
        ko: "다른 동작 전용 컴포넌트처럼 배선만 맡고 자기 모양이 없어서, 바꿀 것이 없습니다.",
      }),
    },
    {
      name: "Messages",
      desc: l.trans({
        en: "The toast stack inside `System`. To restyle toasts, bind `Toast` and `ToastItem` instead.",
        ko: "`System` 안의 토스트 스택입니다. 토스트 모양을 바꾸려면 대신 `Toast`와 `ToastItem`을 연결합니다.",
      }),
    },
  ];

  const leafRows = [
    { name: "<Input.Password />", desc: "`InputPassword`" },
    { name: "<Input.Checkbox />", desc: "`InputCheckbox`" },
    { name: "<Radio.Item />", desc: "`RadioItem`" },
    { name: "<DatePicker.RangePicker />", desc: "`DatePickerRangePicker`" },
    { name: "<ToggleSelect.Multi />", desc: "`ToggleSelectMulti`" },
    { name: "<Toast.Item />", desc: "`ToastItem`" },
    { name: "<Loading.Spin />", desc: "`LoadingSpin`" },
  ];

  const recipeSlots = [
    {
      key: "button",
      type: "(variants?: ButtonVariants, className?: ClassValue) => string",
      desc: l.trans({
        en: "`Button`, and the buttons inside `Popconfirm`, `Dropdown`, `Menu`, `Pagination` and `ToggleSelect`.",
        ko: "`Button`, 그리고 `Popconfirm`, `Dropdown`, `Menu`, `Pagination`, `ToggleSelect` 안의 버튼입니다.",
      }),
    },
    {
      key: "badge",
      type: "(variants?: BadgeVariants, className?: ClassValue) => string",
      desc: l.trans({
        en: "`Badge`, and the tag chips `Field.Tags` draws.",
        ko: "`Badge`, 그리고 `Field.Tags`가 그리는 태그 칩입니다.",
      }),
    },
    {
      key: "input",
      type: "(variants?: InputSurfaceVariants, className?: ClassValue) => string",
      desc: l.trans({
        en: "The field shell of `Input` and its text leaves, and the chat composer's text box.",
        ko: "`Input`과 그 텍스트 입력 leaf, 그리고 채팅 입력창이 쓰는 필드 껍데기입니다.",
      }),
    },
  ];

  const relatedLinks = [
    {
      href: "/docs/arch/css",
      title: l.trans({ en: "Theme Tokens", ko: "테마 토큰" }),
      desc: l.trans({
        en: "Change colors and corner radius app-wide in styles.css, before replacing anything.",
        ko: "무언가를 교체하기 전에, styles.css에서 앱 전체의 색과 모서리 둥글기를 바꿉니다.",
      }),
    },
    {
      href: "/docs/arch/ui-recipe",
      title: l.trans({ en: "UI Recipes", ko: "UI 레시피" }),
      desc: l.trans({
        en: "Use, write and swap the className factories behind framework looks.",
        ko: "프레임워크 모양 뒤의 className 팩토리를 쓰고, 만들고, 교체합니다.",
      }),
    },
    {
      href: "/references/ui/overlays",
      title: l.trans({ en: "Overlays", ko: "오버레이" }),
      desc: l.trans({
        en: "Modal, and the Dialog parts a Modal replacement is built from.",
        ko: "Modal, 그리고 Modal 교체본을 조립하는 Dialog 부품입니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/agent-chat#slots",
      title: l.trans({ en: "Agent Chat Slots", ko: "Agent Chat 슬롯" }),
      desc: l.trans({
        en: "The twelve chat slots, and what each part of the panel receives.",
        ko: "채팅 슬롯 열두 개와, 패널의 각 부분이 받는 값입니다.",
      }),
    },
  ];

  const brandModalCode = `"use client";
import { cn } from "akanjs/client";
import { type AkanModalComponent, Dialog } from "akanjs/ui";

export const BrandModal: AkanModalComponent = ({
  open,
  trigger,
  title,
  action,
  className,
  children,
  ...rest
}) => (
  <Dialog open={open}>
    {trigger ? <Dialog.Trigger>{trigger}</Dialog.Trigger> : null}
    <Dialog.Modal
      {...rest}
      className={cn("rounded-none border-4 border-primary", className)}
    >
      {title ? <Dialog.Title>{title}</Dialog.Title> : null}
      <Dialog.Content>{children}</Dialog.Content>
      {action ? <Dialog.Action>{action}</Dialog.Action> : null}
    </Dialog.Modal>
  </Dialog>
);`;

  const manifestCode = `import { BrandModal } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({ Modal: BrandModal });`;

  const scopingCode = `// page/_overrides.tsx
export default override({ Modal: BrandModal });

// page/(admin)/_overrides.tsx
export default override({ Modal: AdminModal, Table: AdminTable });`;

  const genericCode = `"use client";
import { type AkanUiOverrides, agentAttrs, buttonRecipe } from "akanjs/ui";

export const BrandButton: AkanUiOverrides["Button"] = ({
  className,
  variant,
  size,
  shape,
  outline,
  loadingMode,
  showError,
  children,
  onClick,
  onSuccess,
  ...rest
}) => (
  <button
    type="button"
    {...rest}
    {...agentAttrs(onClick)}
    className={buttonRecipe(
      { variant, size, shape, outline },
      ["rounded-full uppercase", className],
    )}
    onClick={async (e) => {
      if (!onClick) return;
      onSuccess?.(await onClick(e, { onError: () => {} }));
    }}
  >
    {children}
  </button>
);`;

  const compoundCode = `import { BrandCheckbox } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({ InputCheckbox: BrandCheckbox });`;

  const recipeCode = `import { recipe, tv } from "akanjs/ui";

export const neonButtonRecipe = recipe(
  tv({
    base: "inline-flex items-center rounded-none font-mono uppercase",
    variants: {
      variant: {
        default: "…", primary: "…", secondary: "…", accent: "…",
        neutral: "…", outline: "…", ghost: "…", destructive: "…",
        success: "…", warning: "…", info: "…", link: "…",
      },
      size: { xs: "…", sm: "…", md: "…", lg: "…", icon: "…" },
      shape: { default: "", square: "…", circle: "…" },
      outline: { true: "…" },
    },
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  }),
);`;

  const recipeManifestCode = `import { BrandModal, neonButtonRecipe } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({
  Modal: BrandModal,
  recipes: { button: neonButtonRecipe },
});`;

  return (
    <Scroll>
      <Scroll.Slide id="customization" title={l.trans({ en: "Customization", ko: "커스터마이즈" })}>
        <Docs.Title>{l.trans({ en: "Customization", ko: "커스터마이즈" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Any <code>akanjs/ui</code> component can be re-skinned per route without forking it. Write a
                  replacement in your app's <code>ui/</code> and bind it to a slot in a{" "}
                  <code>{"page/**/_overrides.tsx"}</code> manifest. Every <code>{"<Modal>"}</code>,{" "}
                  <code>{"<Button>"}</code> or <code>{"<Table>"}</code> under that folder then renders yours, with no
                  call site changed.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code> 컴포넌트는 fork하지 않고도 라우트 단위로 모양을 바꿀 수 있습니다. 앱의{" "}
                  <code>ui/</code>에 교체 컴포넌트를 만들고 <code>{"page/**/_overrides.tsx"}</code> 매니페스트에서
                  슬롯에 연결하면 됩니다. 그러면 그 폴더 아래의 모든 <code>{"<Modal>"}</code>, <code>{"<Button>"}</code>
                  , <code>{"<Table>"}</code>이 호출부를 한 줄도 고치지 않고 여러분의 컴포넌트로 그려집니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Manifests cascade down the route tree like layouts, and the closest one wins.",
              ko: "매니페스트는 레이아웃처럼 라우트 트리를 따라 내려가고, 가장 가까운 것이 우선합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Two kinds of slot", ko: "슬롯의 두 종류" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "One manifest takes both kinds. Swap a recipe when only the look is wrong, and a component when the markup is.",
              ko: "한 매니페스트에 두 종류를 함께 적습니다. 모양만 문제라면 recipe를, 마크업이 문제라면 컴포넌트를 바꿉니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {kindCards.map((card) => (
              <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <div className="mb-1 font-mono text-foreground/50 text-xs">{card.meta}</div>
                <div className="text-foreground/70 text-sm">{card.desc}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {card.code}
                </code>
              </div>
            ))}
          </div>
        </Docs.Description>
        <Docs.Alert type="info">
          {l.trans({
            en: (
              <span>
                <strong>
                  Keep <code>_overrides.tsx</code> logic-free.
                </strong>{" "}
                It needs no <code>{'"use client"'}</code>: write imports and a single{" "}
                <code>{"export default override({ … })"}</code>, nothing else.
              </span>
            ),
            ko: (
              <span>
                <strong>
                  <code>_overrides.tsx</code>에는 로직을 넣지 않습니다.
                </strong>{" "}
                <code>{'"use client"'}</code>도 필요 없고, import와 <code>{"export default override({ … })"}</code>{" "}
                하나만 둡니다.
              </span>
            ),
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="how-it-works" title={l.trans({ en: "How It Works", ko: "동작 방식" })}>
        <Docs.Title>{l.trans({ en: "How It Works", ko: "동작 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  It takes two files: a component in <code>ui/</code>, and a manifest in <code>page/</code> that points
                  a slot at it.
                </span>
              ),
              ko: (
                <span>
                  파일 두 개면 됩니다. <code>ui/</code>의 컴포넌트 하나와, 슬롯을 그 컴포넌트에 연결하는{" "}
                  <code>page/</code>의 매니페스트 하나입니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "1. Write the replacement", ko: "1. 교체 컴포넌트 작성" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Build it from the headless <code>Dialog</code> parts, so the focus trap, Escape, scroll lock and
                  portal keep working:
                </span>
              ),
              ko: (
                <span>
                  <code>Dialog</code>의 headless 부품으로 조립하면 포커스 가두기, Escape 닫기, 스크롤 잠금, portal이
                  그대로 동작합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/ui/BrandModal.tsx" code={brandModalCode} />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Type it as the slot.</strong> <code>AkanModalComponent</code> (or{" "}
                    <code>{'AkanUiOverrides["<Slot>"]'}</code> for any other slot) types every prop and checks the
                    component is a real drop-in.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>슬롯 타입을 붙입니다.</strong> <code>AkanModalComponent</code>(다른 슬롯은{" "}
                    <code>{'AkanUiOverrides["<Slot>"]'}</code>)가 모든 prop에 타입을 주고, 그대로 끼울 수 있는
                    컴포넌트인지 검사합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pass every prop through.</strong> <code>Model.New</code>, <code>Model.EditModal</code> and{" "}
                    <code>Model.Remove</code> hand their buttons in as <code>action</code>; a replacement that drops it
                    loses those buttons.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 prop을 넘깁니다.</strong> <code>Model.New</code>, <code>Model.EditModal</code>,{" "}
                    <code>Model.Remove</code>는 버튼을 <code>action</code>으로 넘깁니다. 이것을 버리는 교체본은 그
                    버튼을 잃습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "2. Bind it in the manifest", ko: "2. 매니페스트에 연결" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Point the slot at your component in an <code>_overrides.tsx</code> beside the routes it should cover:
                </span>
              ),
              ko: (
                <span>
                  적용할 라우트가 있는 폴더의 <code>_overrides.tsx</code>에서 슬롯을 여러분의 컴포넌트에 연결합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/page/_overrides.tsx" code={manifestCode} />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>override()</code> only checks types.
                    </strong>{" "}
                    It returns the map unchanged. Keys are PascalCase slot names, and each value is checked against that
                    slot's props.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>override()</code>는 타입만 검사합니다.
                    </strong>{" "}
                    맵을 그대로 돌려줍니다. 키는 PascalCase 슬롯 이름이고, 각 값은 그 슬롯의 props와 맞는지 검사됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A misspelled slot name is a type error,</strong> not a binding that silently does nothing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>슬롯 이름을 잘못 쓰면 타입 오류입니다.</strong> 조용히 아무 일도 안 하는 연결이 되지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Nothing else changes.</strong> Every <code>{"<Modal>"}</code> under <code>page/</code> now
                    renders <code>BrandModal</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>다른 곳은 고칠 것이 없습니다.</strong> 이제 <code>page/</code> 아래의 모든{" "}
                    <code>{"<Modal>"}</code>이 <code>BrandModal</code>로 그려집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Exports from akanjs/ui", ko: "akanjs/ui에서 가져오는 것" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Export", ko: "export" })} items={exportRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="scoping" title={l.trans({ en: "Scoping", ko: "적용 범위" })}>
        <Docs.Title>{l.trans({ en: "Scoping", ko: "적용 범위" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Where you put <code>_overrides.tsx</code> decides which routes it covers. A route group or any segment
                  folder works.
                </span>
              ),
              ko: (
                <span>
                  <code>_overrides.tsx</code>를 어디에 두느냐가 적용되는 라우트를 정합니다. route group 폴더든 일반
                  segment 폴더든 됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "File", ko: "파일" })}
            descLabel={l.trans({ en: "Applies to", ko: "적용 범위" })}
            items={placeRows}
          />
          <div>
            {l.trans({
              en: "Manifests stack. The nested one narrows the app-wide one:",
              ko: "매니페스트는 겹쳐 쌓입니다. 안쪽 매니페스트가 앱 전역 매니페스트를 좁힙니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/<app>/page/_overrides.tsx · apps/<app>/page/(admin)/_overrides.tsx"
          code={scopingCode}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The closest manifest wins.</strong> Inside <code>(admin)</code>, <code>{"<Modal>"}</code>{" "}
                    renders <code>AdminModal</code>, not <code>BrandModal</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>가장 가까운 매니페스트가 우선합니다.</strong> <code>(admin)</code> 안에서는{" "}
                    <code>{"<Modal>"}</code>이 <code>BrandModal</code>이 아니라 <code>AdminModal</code>로 그려집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Unlisted slots inherit.</strong> Merging is slot by slot, so a slot the nested manifest does
                    not name keeps the binding from above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>적지 않은 슬롯은 물려받습니다.</strong> 슬롯 단위로 합쳐지므로, 안쪽 매니페스트가 적지 않은
                    슬롯은 위의 연결을 그대로 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Recipes merge the same way.</strong> A child that swaps only <code>button</code> keeps an
                    ancestor's <code>badge</code> swap.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>recipe도 같은 방식으로 합쳐집니다.</strong> <code>button</code>만 바꾼 하위 매니페스트도
                    상위의 <code>badge</code> 교체는 유지합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Layouts are covered too.</strong> The <code>_layout.tsx</code> beside the manifest and every
                    layout below it render inside it, root layout or not, so a <code>{"<Modal>"}</code> or{" "}
                    <code>{"<Agent.Chat />"}</code> mounted there gets the replacement. A layout above the manifest's
                    folder is shared with routes outside it, so it keeps the bindings from above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>레이아웃도 적용됩니다.</strong> 매니페스트와 같은 폴더의 <code>_layout.tsx</code>와 그
                    아래의 모든 레이아웃은 루트 레이아웃이든 아니든 매니페스트 안에서 그려지므로, 거기에 마운트한{" "}
                    <code>{"<Modal>"}</code>이나 <code>{"<Agent.Chat />"}</code>도 교체본으로 바뀝니다. 매니페스트
                    폴더보다 위의 레이아웃은 바깥 라우트와 함께 쓰이므로 위의 연결을 그대로 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="slots" title={l.trans({ en: "Overridable Slots", ko: "교체할 수 있는 슬롯" })}>
        <Docs.Title>{l.trans({ en: "Overridable Slots", ko: "교체할 수 있는 슬롯" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The framework has the 46 slots below; a component not listed cannot be replaced. A compound leaf joins
                  its names: <code>Input.Password</code> is <code>InputPassword</code>.
                </span>
              ),
              ko: (
                <span>
                  프레임워크의 슬롯은 아래 46개이고, 목록에 없는 컴포넌트는 교체할 수 없습니다. 복합 컴포넌트의 leaf는
                  이름을 이어 붙입니다. <code>Input.Password</code>는 <code>InputPassword</code>입니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Slot", ko: "슬롯" })} items={slotRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Not slots", ko: "슬롯이 아닌 것" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Component", ko: "컴포넌트" })} items={notSlotRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Messages</code> owns the <code>msg.*</code> wiring, the store read, the body-level portal and
                  the dismiss timers. The <code>Toast</code> slots let you change the look without re-implementing when
                  a toast appears and goes away.
                </span>
              ),
              ko: (
                <span>
                  <code>Messages</code>는 <code>msg.*</code> 배선, store 읽기, body 수준 portal, 자동 닫힘 타이머를 직접
                  들고 있습니다. <code>Toast</code> 슬롯을 쓰면 토스트가 언제 뜨고 사라지는지는 다시 만들지 않고 모양만
                  바꿀 수 있습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="generic-components" title={l.trans({ en: "Generic Components", ko: "제네릭 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Generic Components", ko: "제네릭 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Button</code>, <code>Select</code> and <code>ToggleSelect</code> are generic, and their call
                  sites keep full inference. The slot stores the widest type, so your replacement needs no generics.
                </span>
              ),
              ko: (
                <span>
                  <code>Button</code>, <code>Select</code>, <code>ToggleSelect</code>는 제네릭이고, 호출부의 타입 추론은
                  그대로 유지됩니다. 슬롯은 가장 넓은 타입으로 저장되므로 교체 컴포넌트에는 제네릭이 필요 없습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  A <code>Button</code> replacement, typed as the slot:
                </span>
              ),
              ko: (
                <span>
                  슬롯 타입을 붙인 <code>Button</code> 교체 컴포넌트입니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/ui/BrandButton.tsx" code={genericCode} />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call sites keep their types.</strong> <code>{"<Select<MyEnum, true> … />"}</code> and{" "}
                    <code>{"<Button<Todo> onSuccess={…} />"}</code> still infer their value, onChange and result shapes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출부의 타입은 그대로입니다.</strong> <code>{"<Select<MyEnum, true> … />"}</code>와{" "}
                    <code>{"<Button<Todo> onSuccess={…} />"}</code>는 여전히 value, onChange, 결과 타입을 추론합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>You write against the widest props.</strong> The <code>Button</code> slot holds{" "}
                    <code>{"ButtonProps<unknown>"}</code>, so <code>onClick</code> returns <code>unknown</code> and{" "}
                    <code>onSuccess</code> takes it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>가장 넓은 props로 작성합니다.</strong> <code>Button</code> 슬롯의 타입은{" "}
                    <code>{"ButtonProps<unknown>"}</code>이라서, <code>onClick</code>은 <code>unknown</code>을 돌려주고{" "}
                    <code>onSuccess</code>가 그 값을 받습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep variant props off the DOM.</strong> Hand <code>variant</code>, <code>size</code>,{" "}
                    <code>shape</code> and <code>outline</code> to the recipe, and drop <code>loadingMode</code> and{" "}
                    <code>showError</code>, which a <code>{"<button>"}</code> does not know.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>variant props는 DOM에 넘기지 않습니다.</strong> <code>variant</code>, <code>size</code>,{" "}
                    <code>shape</code>, <code>outline</code>은 recipe에 넘기고, <code>{"<button>"}</code>이 모르는{" "}
                    <code>loadingMode</code>, <code>showError</code>는 뺍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Spread <code>agentAttrs(onClick)</code>.
                    </strong>{" "}
                    The default button carries the <code>data-akan-*</code> annotation the in-page agent reads, so a
                    replacement has to put it back.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>agentAttrs(onClick)</code>를 펼쳐 넣습니다.
                    </strong>{" "}
                    기본 버튼에는 인페이지 에이전트가 읽는 <code>data-akan-*</code> 표시가 붙어 있으므로, 교체본도 이를
                    다시 붙여야 합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="compound-components" title={l.trans({ en: "Compound Components", ko: "복합 컴포넌트" })}>
        <Docs.Title>{l.trans({ en: "Compound Components", ko: "복합 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A component with sub-parts has one slot per leaf, named <code>{"<Base><Sub>"}</code>. Replace only the
                  leaf you want; the rest keep their defaults.
                </span>
              ),
              ko: (
                <span>
                  하위 부품이 있는 컴포넌트는 leaf마다 슬롯이 하나씩 있고, 이름은 <code>{"<Base><Sub>"}</code>
                  입니다. 원하는 leaf만 바꾸면 나머지는 기본 그대로입니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "You render", ko: "렌더하는 것" })}
            descLabel={l.trans({ en: "Slot key", ko: "슬롯 키" })}
            items={leafRows}
          />
          <div>
            {l.trans({
              en: "Binding one leaf leaves its siblings alone:",
              ko: "leaf 하나만 연결하면 형제 leaf는 그대로입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/page/_overrides.tsx" code={compoundCode} />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Siblings stay default.</strong> <code>{"<Input.Checkbox />"}</code> now renders{" "}
                    <code>BrandCheckbox</code>, while <code>{"<Input />"}</code> and <code>{"<Input.Password />"}</code>{" "}
                    keep the framework look.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>형제 leaf는 기본 그대로입니다.</strong> 이제 <code>{"<Input.Checkbox />"}</code>는{" "}
                    <code>BrandCheckbox</code>로 그려지고, <code>{"<Input />"}</code>과{" "}
                    <code>{"<Input.Password />"}</code>는 프레임워크 모양을 유지합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Dot access still works.</strong> <code>Input.Password</code> and <code>Loading.Spin</code>{" "}
                    stay where they are; only what they render changes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>점 표기 접근은 그대로입니다.</strong> <code>Input.Password</code>, <code>Loading.Spin</code>
                    은 그 자리에 있고, 그려지는 것만 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Field.*</code> follows its leaf.
                    </strong>{" "}
                    <code>Field.Text</code>, <code>Field.Email</code>, <code>Field.Password</code> and{" "}
                    <code>Field.Number</code> draw <code>Input</code> leaves, so those overrides reach them too.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Field.*</code>도 leaf를 따라갑니다.
                    </strong>{" "}
                    <code>Field.Text</code>, <code>Field.Email</code>, <code>Field.Password</code>,{" "}
                    <code>Field.Number</code>는 <code>Input</code> leaf를 그리므로, 그 leaf의 교체가 여기에도
                    적용됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="recipe-slots" title={l.trans({ en: "Recipe Slots", ko: "레시피 슬롯" })}>
        <Docs.Title>{l.trans({ en: "Recipe Slots", ko: "레시피 슬롯" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  When a component's structure is right and only its look is wrong, swap its recipe instead. The{" "}
                  <code>recipes</code> key, typed by <code>AkanUiRecipes</code>, replaces the className factory and
                  leaves async states, focus handling and a11y alone.
                </span>
              ),
              ko: (
                <span>
                  구조는 맞고 모양만 바꾸고 싶다면 컴포넌트 대신 recipe를 바꿉니다. <code>AkanUiRecipes</code>로 타입이
                  정해진 <code>recipes</code> 키는 className 팩토리만 교체하고, async 상태, 포커스 처리, 접근성은
                  건드리지 않습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Docs.OptionTable items={recipeSlots} />
        <Docs.Description>
          <div>
            {l.trans({
              en: "A replacement takes the framework recipe's whole variant contract, because every existing call site passes it:",
              ko: "교체 recipe는 프레임워크 recipe의 variant 계약을 전부 받아야 합니다. 기존 호출부가 그 값을 그대로 넘기기 때문입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/ui/Recipe/neonButton.ts" code={recipeCode} />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Bind it under <code>recipes</code>, next to any component slots:
                </span>
              ),
              ko: (
                <span>
                  <code>recipes</code> 아래에 연결합니다. 컴포넌트 슬롯과 한 매니페스트에 함께 둘 수 있습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="apps/<app>/page/(brand)/_overrides.tsx" code={recipeManifestCode} />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An extra axis is not new vocabulary.</strong> The type accepts one, but only code that knows
                    your recipe's own type can reach it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>축을 더해도 어휘가 넓어지지 않습니다.</strong> 타입상 허용되지만, 그 축은 교체 recipe의
                    타입을 아는 코드에서만 닿습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>To widen the vocabulary,</strong> add the axis to the framework recipe, or write an app
                    recipe under <code>{"apps/<app>/ui/Recipe/"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>어휘를 넓히려면</strong> 프레임워크 recipe에 축을 더하거나,{" "}
                    <code>{"apps/<app>/ui/Recipe/"}</code> 아래에 앱 recipe를 만듭니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <span>
                <strong>A recipe slot is a client-side, route-scoped restyle.</strong> It reaches framework client
                components, which resolve through <code>useUiRecipe(...)</code>. It does not reach a{" "}
                <code>buttonRecipe(...)</code> call in your own JSX, which is a static import with no context, nor
                server components (<code>Unit</code>, <code>View</code>), which render the framework recipe on purpose.
              </span>
            ),
            ko: (
              <span>
                <strong>recipe 슬롯은 클라이언트에서, 라우트 범위로 다시 칠하는 장치입니다.</strong>{" "}
                <code>useUiRecipe(...)</code>로 recipe를 찾는 프레임워크 클라이언트 컴포넌트에만 닿습니다. 앱 JSX에 직접
                쓴 <code>buttonRecipe(...)</code> 호출은 context 없는 정적 import라 닿지 않고, 서버 컴포넌트(
                <code>Unit</code>, <code>View</code>)도 의도적으로 프레임워크 기본 recipe를 그리므로 닿지 않습니다.
              </span>
            ),
          })}
        </Docs.Alert>
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>

      <DocsToc />
    </Scroll>
  );
});
