import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: "portal",
      desc: l.trans({
        en: "Drawing an element elsewhere in the DOM, here at the end of `document.body`, so no parent clips it.",
        ko: "요소를 DOM의 다른 자리, 여기서는 `document.body` 끝에 그리는 것입니다. 부모 상자가 잘라내지 못합니다.",
      }),
    },
    {
      name: "trigger",
      desc: l.trans({
        en: "The element the user clicks to open the overlay, passed as `trigger` or as `children`.",
        ko: "사용자가 눌러 오버레이를 여는 요소입니다. `trigger`나 `children`으로 넘깁니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "controlled", ko: "controlled (제어형)" })}</span>,
      desc: l.trans({
        en: "You pass `open` and set it back in `onCancel`. Left out, the component keeps its own open state.",
        ko: "`open`을 넘기고 `onCancel`에서 다시 바꿔 주는 방식입니다. 빼면 컴포넌트가 열림 상태를 직접 관리합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "override slot", ko: "오버라이드 슬롯" })}</span>,
      desc: l.trans({
        en: "A name in `_overrides.tsx` that swaps a component for one route subtree.",
        ko: "`_overrides.tsx`에서 컴포넌트를 라우트 하위 트리 단위로 바꿔 끼울 때 쓰는 이름입니다.",
      }),
    },
    {
      name: "scrim",
      desc: l.trans({
        en: "A see-through layer behind a popover that catches the click outside it.",
        ko: "팝오버 뒤에 깔리는 투명한 층입니다. 팝오버 바깥을 누른 클릭을 받아 냅니다.",
      }),
    },
  ];

  const overlayColumns = [
    { key: "portal", label: l.trans({ en: "Portalled", ko: "portal로 그림" }), caption: "document.body" },
    { key: "anchor", label: l.trans({ en: "At trigger", ko: "트리거 기준" }) },
    { key: "slot", label: l.trans({ en: "Override slot", ko: "오버라이드 슬롯" }), caption: "_overrides.tsx" },
  ];

  const overlayGroups = [
    {
      label: l.trans({ en: "Windows over the page", ko: "화면을 덮는 창" }),
      rows: [
        {
          name: "Modal",
          desc: l.trans({
            en: "A centred window with title, body and footer slots. The default for a modal flow.",
            ko: "제목·본문·하단 슬롯이 있는 가운데 창입니다. 모달이 필요하면 먼저 이것을 씁니다.",
          }),
          marks: { portal: true, anchor: false, slot: true },
        },
        {
          name: "Dialog",
          desc: l.trans({
            en: "The headless parts `Modal` is built from, for a custom layout or an agent-named dialog.",
            ko: "`Modal`을 이루는 headless 부품입니다. 배치를 직접 짜거나 에이전트에 이름을 알릴 때 씁니다.",
          }),
          marks: { portal: true, anchor: false, slot: false },
        },
        {
          name: "BottomSheet",
          desc: l.trans({
            en: "A mobile panel that slides up from the bottom edge, over the page's bars.",
            ko: "아래 가장자리에서 올라오는 모바일 패널이며, 페이지의 바 위에 뜹니다.",
          }),
          marks: { portal: true, anchor: false, slot: false },
        },
      ],
    },
    {
      label: l.trans({ en: "Anchored to a trigger", ko: "트리거에 붙는 것" }),
      rows: [
        {
          name: "Popconfirm",
          desc: l.trans({
            en: "A small OK/cancel popover before a destructive action.",
            ko: "되돌릴 수 없는 동작 앞에 뜨는 작은 확인/취소 팝오버입니다.",
          }),
          marks: { portal: true, anchor: true, slot: true },
        },
        {
          name: "Dropdown",
          desc: l.trans({
            en: "A short action menu, such as the actions on a list row.",
            ko: "목록 행의 동작 같은 짧은 동작 메뉴입니다.",
          }),
          marks: { portal: true, anchor: true, slot: true },
        },
        {
          name: "Tooltip",
          desc: l.trans({
            en: "A hover or focus hint. It flips to the opposite side when its own has no room.",
            ko: "마우스를 올리거나 포커스하면 뜨는 힌트입니다. 정한 쪽에 자리가 없으면 반대쪽으로 뒤집힙니다.",
          }),
          marks: { portal: true, anchor: true, slot: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Navigation and helpers", ko: "탐색과 도우미" }),
      rows: [
        {
          name: "Menu",
          desc: l.trans({
            en: "A navigation menu built from an `items` tree, for a sidebar or a top bar.",
            ko: "`items` 트리로 만드는 내비게이션 메뉴입니다. 사이드바나 상단 바에 씁니다.",
          }),
          marks: { portal: false, anchor: false, slot: true },
        },
        {
          name: "Portal",
          desc: l.trans({
            en: "Renders its children into a host element named by `id`.",
            ko: "자식을 `id`로 지정한 호스트 요소 안에 그립니다.",
          }),
          marks: { portal: false, anchor: false, slot: false },
        },
        {
          name: "Copy",
          desc: l.trans({
            en: "Copies text to the clipboard and shows a success toast.",
            ko: "텍스트를 클립보드에 복사하고 성공 토스트를 띄웁니다.",
          }),
          marks: { portal: false, anchor: false, slot: false },
        },
      ],
    },
  ];

  const relatedLinks = [
    {
      href: "/references/ui/forms",
      title: l.trans({ en: "Forms UI", ko: "폼 UI" }),
      desc: l.trans({
        en: (
          <span>
            <code>Select</code>, the fourth control that portals its list and anchors it to the field.
          </span>
        ),
        ko: (
          <span>
            목록을 portal로 그려 필드에 붙이는 네 번째 컴포넌트 <code>Select</code>가 있습니다.
          </span>
        ),
      }),
    },
    {
      href: "/references/ui/customize",
      title: l.trans({ en: "Override Slots", ko: "오버라이드 슬롯" }),
      desc: l.trans({
        en: (
          <span>
            Swap <code>Modal</code>, <code>Popconfirm</code>, <code>Dropdown</code>, <code>Tooltip</code> or{" "}
            <code>Menu</code> for one route subtree.
          </span>
        ),
        ko: (
          <span>
            <code>Modal</code>, <code>Popconfirm</code>, <code>Dropdown</code>, <code>Tooltip</code>, <code>Menu</code>
            를 라우트 하위 트리 단위로 바꿔 끼웁니다.
          </span>
        ),
      }),
    },
    {
      href: "/references/ui/core",
      title: l.trans({ en: "Core UI", ko: "코어 UI" }),
      desc: l.trans({
        en: (
          <span>
            <code>Layout.Navbar</code> and the other frame slots, which <code>Portal</code> fills in a CSR build.
          </span>
        ),
        ko: (
          <span>
            CSR 빌드에서 <code>Portal</code>이 채우는 <code>Layout.Navbar</code>와 나머지 프레임 슬롯이 있습니다.
          </span>
        ),
      }),
    },
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "How the tools a component publishes let the agent drive the screen.",
        ko: "컴포넌트가 공개한 툴로 에이전트가 화면을 다루는 방식을 설명합니다.",
      }),
    },
  ];

  const components: UiComponentReference[] = [
    {
      name: "Modal",
      desc: l.trans({
        en: "A centred window with title, body and footer slots, built on the headless `Dialog`. Reach for it first; compose `Dialog` only when you need a layout of your own.",
        ko: "headless `Dialog` 위에 만든, 제목·본문·하단 슬롯이 있는 가운데 창입니다. 모달이 필요하면 먼저 이것을 쓰고, 배치를 직접 짜야 할 때만 `Dialog`를 조합하세요.",
      }),
      props: [
        {
          name: "open",
          type: "boolean",
          desc: l.trans({
            en: "Controlled open state. May be left out when `trigger` is given.",
            ko: "controlled 열림 상태입니다. `trigger`를 넘기면 빼도 됩니다.",
          }),
        },
        {
          name: "onCancel",
          type: "() => void",
          desc: l.trans({
            en: "Called when the modal closes itself: the close button, a backdrop click or Escape.",
            ko: "모달이 스스로 닫힐 때 호출됩니다. 닫기 버튼, 배경 클릭, Escape가 여기에 해당합니다.",
          }),
        },
        {
          name: "trigger",
          type: "ReactNode",
          desc: l.trans({
            en: "Element that opens the modal. With it, the modal keeps its own open state.",
            ko: "모달을 여는 요소입니다. 넘기면 모달이 열림 상태를 직접 관리합니다.",
          }),
        },
        {
          name: "title",
          type: "string | ReactNode",
          desc: l.trans({
            en: "The header row. Left out, no header is drawn.",
            ko: "맨 위 제목 행입니다. 빼면 제목 행을 그리지 않습니다.",
          }),
        },
        {
          name: "action",
          type: "ReactNode",
          desc: l.trans({
            en: "The footer row, right-aligned. Usually buttons.",
            ko: "오른쪽으로 정렬되는 하단 행입니다. 보통 버튼을 넣습니다.",
          }),
        },
        {
          name: "closeButton",
          type: "ReactNode | false",
          desc: l.trans({
            en: "The corner close control, wired by its slot, so a replacement needs no handler. `false` draws none.",
            ko: "모서리의 닫기 컨트롤입니다. 슬롯이 직접 닫으므로 바꿔 넣은 요소에 핸들러가 필요 없고, `false`면 그리지 않습니다.",
          }),
        },
        {
          name: "confirmClose",
          type: "boolean = false",
          desc: l.trans({
            en: "Asks with the browser's confirm dialog before closing.",
            ko: "닫기 전에 브라우저 확인 창으로 한 번 더 묻습니다.",
          }),
        },
        {
          name: "presentation",
          type: '"dialog" | "sheet" | "auto" = "dialog"',
          desc: l.trans({
            en: "`sheet` fills the screen; `auto` is a full-screen sheet below `md` and a dialog above.",
            ko: "`sheet`는 화면을 꽉 채우고, `auto`는 `md` 미만에서 전체 화면 시트, 그 이상에서 dialog입니다.",
          }),
        },
        {
          name: "placement",
          type: '"center" | "right" = "center"',
          desc: l.trans({
            en: "`right` makes it a full-height side sheet from `md` up. Every modal surface (`Modal`, `Dialog.Modal`, the `Model` modals, `Model.New`) takes it and `presentation` through the exported `ModalSurfaceProps`.",
            ko: "`right`면 `md` 이상에서 높이를 꽉 채운 오른쪽 사이드 시트가 됩니다. 모든 모달 표면(`Modal`, `Dialog.Modal`, `Model`의 모달들, `Model.New`)이 export된 `ModalSurfaceProps`로 이 값과 `presentation`을 받습니다.",
          }),
        },
        {
          name: "className / bodyClassName",
          type: "string",
          desc: l.trans({
            en: "Classes for the window and for its scrolling body.",
            ko: "창 자체와 스크롤되는 본문에 적용할 class입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>A dialog does not move.</strong> It has no transition and no gesture, so content the user is
              reading never animates. <code>LegacyModal</code> keeps the previous spring skin, with <code>open</code>{" "}
              and <code>onCancel</code> required and no <code>trigger</code> or <code>closeButton</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>dialog는 움직이지 않습니다.</strong> 전환 효과도 제스처도 없어서 사용자가 읽는 내용이 흔들리지
              않습니다. 이전의 스프링 애니메이션은 <code>LegacyModal</code>에 남아 있으며, <code>open</code>과{" "}
              <code>onCancel</code>이 필수이고 <code>trigger</code>와 <code>closeButton</code>은 없습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>A sheet fits a phone.</strong> It pads for the safe area, keeps the title and actions in place
              while the body scrolls, and closes on a drag down on its handle or title. Type a wrapper's props with{" "}
              <code>ModalPresentation</code> and <code>ModalPlacement</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>시트는 폰에 맞춰집니다.</strong> safe area만큼 여백을 두고, 본문이 스크롤되어도 제목과 버튼은
              제자리에 있으며, 손잡이나 제목을 아래로 끌면 닫힙니다. 감싸는 컴포넌트의 prop 타입은{" "}
              <code>ModalPresentation</code>과 <code>ModalPlacement</code>로 씁니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Focus and scroll are handled.</strong> Opening moves focus into the window and locks the page
              scroll; closing returns focus to where it was.
            </span>
          ),
          ko: (
            <span>
              <strong>포커스와 스크롤은 알아서 처리합니다.</strong> 열리면 포커스가 창 안으로 옮겨지고 페이지 스크롤이
              잠기며, 닫히면 포커스가 원래 자리로 돌아갑니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>It is the Modal override slot.</strong> A replacement bound in <code>_overrides.tsx</code> reaches
              every <code>{"<Modal>"}</code>, including the ones <code>Model.*</code> draws. <code>LegacyModal</code> is
              not overridable.
            </span>
          ),
          ko: (
            <span>
              <strong>Modal 오버라이드 슬롯입니다.</strong> <code>_overrides.tsx</code>에서 바꿔 넣으면{" "}
              <code>Model.*</code>이 그리는 것까지 모든 <code>{"<Modal>"}</code>이 따라갑니다. <code>LegacyModal</code>
              은 바꿔 넣을 수 없습니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { usePage } from "@apps/koyo/client";
import { Modal } from "akanjs/ui";
import type { ReactNode } from "react";

interface ReceiptProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}
export const Receipt = ({ open, onClose, children }: ReceiptProps) => {
  const { l } = usePage();
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={l.trans({ en: "Receipt", ko: "영수증" })}
    >
      {children}
    </Modal>
  );
};`,
    },
    {
      name: "Dialog",
      desc: l.trans({
        en: "The headless compound parts that `Modal` is built from. Compose them when `Modal`'s fixed layout does not fit, or when the in-page agent should be able to open and close the dialog.",
        ko: "`Modal`을 이루는 headless compound 부품입니다. `Modal`의 정해진 배치가 맞지 않거나, 인페이지 에이전트가 이 창을 열고 닫게 하고 싶을 때 조합합니다.",
      }),
      props: [
        {
          name: "Dialog",
          type: "{ open?, defaultOpen? = false, namespace?, className? }",
          desc: l.trans({
            en: "The root that holds the open state. `open` is followed whenever it changes.",
            ko: "열림 상태를 쥐는 루트입니다. `open`이 바뀌면 그 값을 따라갑니다.",
          }),
        },
        {
          name: "namespace",
          type: "string",
          desc: l.trans({
            en: "Names the dialog for the in-page agent. Without it, the dialog publishes no tool.",
            ko: "인페이지 에이전트에게 이 창의 이름을 알립니다. 없으면 툴을 하나도 공개하지 않습니다.",
          }),
        },
        {
          name: "Dialog.Trigger",
          type: "{ className?, children }",
          desc: l.trans({
            en: "Opens the dialog when anything inside it is clicked.",
            ko: "안에 있는 무엇을 눌러도 창이 열립니다.",
          }),
        },
        {
          name: "Dialog.Modal",
          type: "{ onCancel?, confirmClose?, closeButton?, presentation?, placement?, className?, bodyClassName? }",
          desc: l.trans({
            en: "The window `Modal` draws, dialog or sheet. Escape, a backdrop click and the corner button close it.",
            ko: "`Modal`이 그리는 창이며 dialog나 시트로 그립니다. Escape, 배경 클릭, 모서리 버튼으로 닫힙니다.",
          }),
        },
        {
          name: "Dialog.LegacyModal",
          type: "{ onCancel?, confirmClose?, className?, bodyClassName? }",
          desc: l.trans({
            en: "The previous window: spring open/close and drag-to-dismiss on touch.",
            ko: "이전 창입니다. 스프링 애니메이션으로 열리고 닫히며, 터치로 끌어내려 닫을 수 있습니다.",
          }),
        },
        {
          name: "Dialog.Title / Dialog.Action",
          type: "{ children }",
          desc: l.trans({
            en: "Draw nothing where written; they hand their children to the header and footer rows.",
            ko: "쓴 자리에는 아무것도 그리지 않고, 자식을 제목 행과 하단 행으로 넘깁니다.",
          }),
        },
        {
          name: "Dialog.Content",
          type: "{ className?, children }",
          desc: l.trans({ en: "The body, a full-width block.", ko: "전체 너비를 차지하는 본문입니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>A namespace publishes three names.</strong> <code>namespace="share"</code> gives the agent{" "}
              <code>openDialogInShare</code>, <code>closeDialogInShare</code> and the <code>dialogInShare</code> state.
              Two dialogs on one screen need different names.
            </span>
          ),
          ko: (
            <span>
              <strong>namespace 하나가 이름 셋을 공개합니다.</strong> <code>namespace="share"</code>를 주면 에이전트가{" "}
              <code>openDialogInShare</code>, <code>closeDialogInShare</code> 툴과 <code>dialogInShare</code> 상태를
              봅니다. 한 화면에 창이 둘이면 이름을 다르게 주세요.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>The agent closes it the way a person does.</strong> Its close goes through the window's own
              dismissal, so <code>confirmClose</code> and <code>onCancel</code> still run. <code>Modal</code> takes no{" "}
              <code>namespace</code>, so it publishes nothing.
            </span>
          ),
          ko: (
            <span>
              <strong>에이전트도 사람과 같은 길로 닫습니다.</strong> 창 자체의 닫기 동작을 거치므로{" "}
              <code>confirmClose</code>와 <code>onCancel</code>도 그대로 실행됩니다. <code>Modal</code>은{" "}
              <code>namespace</code>를 받지 않아 아무것도 공개하지 않습니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { usePage } from "@apps/koyo/client";
import { buttonRecipe, Dialog } from "akanjs/ui";

interface ShareDialogProps {
  link: string;
  onSend: () => void;
}
export const ShareDialog = ({ link, onSend }: ShareDialogProps) => {
  const { l } = usePage();
  return (
    <Dialog namespace="share">
      <Dialog.Trigger>
        <button type="button" className={buttonRecipe({ variant: "outline" })}>
          {l.trans({ en: "Share", ko: "공유" })}
        </button>
      </Dialog.Trigger>
      <Dialog.Modal>
        <Dialog.Title>
          {l.trans({ en: "Share this order", ko: "이 주문 공유" })}
        </Dialog.Title>
        <Dialog.Content className="break-all font-mono text-sm">
          {link}
        </Dialog.Content>
        <Dialog.Action>
          <button type="button" className={buttonRecipe()} onClick={onSend}>
            {l.trans({ en: "Send", ko: "보내기" })}
          </button>
        </Dialog.Action>
      </Dialog.Modal>
    </Dialog>
  );
};`,
    },
    {
      name: "Popconfirm",
      desc: l.trans({
        en: "A small OK/cancel popover that stands in front of a destructive or irreversible action. Wrap the trigger in it and pass the action as `onConfirm`.",
        ko: "되돌릴 수 없는 동작 앞에 세우는 작은 확인/취소 팝오버입니다. 트리거를 감싸고, 실행할 동작은 `onConfirm`으로 넘깁니다.",
      }),
      props: [
        {
          name: "title",
          type: "ReactNode",
          desc: l.trans({ en: "The question, in bold.", ko: "굵게 표시되는 질문입니다." }),
        },
        {
          name: "description",
          type: "ReactNode",
          desc: l.trans({ en: "Optional detail under the title.", ko: "제목 아래에 붙는 선택적 설명입니다." }),
        },
        {
          name: "onConfirm",
          type: "() => void",
          desc: l.trans({
            en: "Called when the user presses OK. The popover closes first.",
            ko: "사용자가 확인을 누르면 호출됩니다. 팝오버가 먼저 닫힙니다.",
          }),
        },
        {
          name: "okText / cancelText",
          type: "ReactNode",
          desc: l.trans({
            en: "Button labels. The defaults are the `base.ok` and `base.cancel` dictionary entries.",
            ko: "버튼 라벨입니다. 기본값은 사전의 `base.ok`와 `base.cancel`입니다.",
          }),
        },
        {
          name: "okButtonProps / cancelButtonProps",
          type: "ButtonHTMLAttributes & { loading? }",
          desc: l.trans({
            en: "Attributes spread onto the two default buttons.",
            ko: "기본 버튼 두 개에 그대로 펼쳐 넣는 속성입니다.",
          }),
        },
        {
          name: "icon",
          type: "ReactNode | false",
          desc: l.trans({
            en: "The mark beside the message, a warning icon by default. `false` draws none.",
            ko: "메시지 옆 아이콘이며 기본값은 경고 아이콘입니다. `false`면 그리지 않습니다.",
          }),
        },
        {
          name: "actions",
          type: "ReactNode",
          desc: l.trans({
            en: "Replaces the whole footer. The replacement owns both the confirm and the dismiss.",
            ko: "하단 전체를 바꿉니다. 바꿔 넣으면 확인과 닫기를 모두 직접 처리해야 합니다.",
          }),
        },
        {
          name: "triggerClassName / decoClassName",
          type: "string",
          desc: l.trans({
            en: "Classes for the trigger wrapper and for the pointer. `decoClassName` also takes over its position.",
            ko: "트리거 래퍼와 말풍선 꼭지에 적용할 class입니다. `decoClassName`을 주면 꼭지 위치도 직접 정해야 합니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Never clipped.</strong> The popover portals to <code>document.body</code> and sits under the
              trigger's end edge. With no room below it flips above, and the pointer follows.
            </span>
          ),
          ko: (
            <span>
              <strong>잘리지 않습니다.</strong> 팝오버는 <code>document.body</code>에 portal로 그려지고 트리거의 끝 쪽
              아래에 자리 잡습니다. 아래 공간이 모자라면 위로 뒤집히고, 꼭지도 따라갑니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>The scrim takes the outside click.</strong> Clicking outside, or Escape, only cancels the popover.
              A <code>Dropdown</code> or modal that opened it stays open.
            </span>
          ),
          ko: (
            <span>
              <strong>바깥 클릭은 scrim이 받습니다.</strong> 바깥을 누르거나 Escape를 누르면 팝오버만 취소됩니다. 이것을
              연 <code>Dropdown</code>이나 모달은 열린 채로 남습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Removing a model record?</strong> <code>Model.RemoveWrapper</code> already draws this popover and
              publishes the removal as an agent tool.
            </span>
          ),
          ko: (
            <span>
              <strong>모델 레코드를 지우는 거라면</strong> <code>Model.RemoveWrapper</code>를 쓰세요. 이 팝오버를 그리고
              삭제 동작을 에이전트 툴로 공개하는 일까지 해 줍니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { usePage } from "@apps/koyo/client";
import { buttonRecipe, Popconfirm } from "akanjs/ui";

interface CancelOrderProps {
  onCancelOrder: () => void;
}
export const CancelOrder = ({ onCancelOrder }: CancelOrderProps) => {
  const { l } = usePage();
  return (
    <Popconfirm
      title={l.trans({ en: "Cancel this order?", ko: "주문을 취소할까요?" })}
      onConfirm={onCancelOrder}
    >
      <button
        type="button"
        className={buttonRecipe({ variant: "destructive", size: "sm" })}
      >
        {l.trans({ en: "Cancel order", ko: "주문 취소" })}
      </button>
    </Popconfirm>
  );
};`,
    },
    {
      name: "Dropdown",
      desc: l.trans({
        en: "A compact action menu under a trigger button. It is the usual home for row actions, comment menus and other context actions in a list.",
        ko: "트리거 버튼 아래로 펼쳐지는 작은 동작 메뉴입니다. 목록의 행 동작, 댓글 메뉴 같은 문맥 동작을 주로 담습니다.",
      }),
      props: [
        {
          name: "value",
          type: "ReactNode",
          desc: l.trans({
            en: "Content of the default trigger, a ghost button.",
            ko: "기본 트리거인 ghost 버튼 안에 들어갈 내용입니다.",
          }),
        },
        {
          name: "trigger",
          type: "ReactNode",
          desc: l.trans({
            en: "Your own trigger instead of the button. It is cloned, so it must forward className, onClick, aria-*.",
            ko: "버튼 대신 쓸 트리거입니다. 복제(clone)되므로 className, onClick, aria-*를 그대로 전달해야 합니다.",
          }),
        },
        {
          name: "content",
          type: "ReactNode",
          desc: l.trans({
            en: "The menu rows. They render inside a `<ul>`, so write `<li>` items.",
            ko: "메뉴 행입니다. `<ul>` 안에 그려지므로 `<li>`로 씁니다.",
          }),
        },
        {
          name: "align",
          type: `"start" | "end" = "end"`,
          desc: l.trans({
            en: "The trigger edge the menu lines up with. A `left-0` class cannot change it.",
            ko: "메뉴를 맞출 트리거의 가장자리입니다. `left-0` 같은 class로는 바꿀 수 없습니다.",
          }),
        },
        {
          name: "namespace",
          type: "string",
          desc: l.trans({
            en: "Names the menu for the in-page agent. Without it, the menu publishes no tool.",
            ko: "인페이지 에이전트에게 이 메뉴의 이름을 알립니다. 없으면 툴을 하나도 공개하지 않습니다.",
          }),
        },
        {
          name: "className / buttonClassName / dropdownClassName",
          type: "string",
          desc: l.trans({
            en: "Classes for the wrapper, the trigger button and the menu panel.",
            ko: "래퍼, 트리거 버튼, 메뉴 패널에 각각 적용할 class입니다.",
          }),
        },
        {
          name: "data-dropdown-keep-open",
          type: "attribute",
          desc: l.trans({
            en: "Put on a row with its own interaction, such as a switch, so clicking it keeps the menu open.",
            ko: "스위치처럼 자체 동작이 있는 행에 붙이면, 그 행을 눌러도 메뉴가 닫히지 않습니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Never clipped.</strong> The menu portals to <code>document.body</code> and is placed against its
              trigger, so a modal, a scrolling modal body or a table's scroll container cannot cut it off.
            </span>
          ),
          ko: (
            <span>
              <strong>잘리지 않습니다.</strong> 메뉴는 <code>document.body</code>에 portal로 그려져 트리거 기준으로
              배치되므로, 모달, 스크롤되는 모달 본문, 테이블 스크롤 컨테이너가 잘라내지 못합니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>A row may open a Modal.</strong> A closed menu is hidden, not unmounted, so the modal survives.
              Clicks inside an overlay this menu opened are not outside clicks; any other overlay still closes it.
            </span>
          ),
          ko: (
            <span>
              <strong>행에서 Modal을 열어도 됩니다.</strong> 닫힌 메뉴는 unmount되지 않고 숨겨지므로 모달이 그대로
              남습니다. 이 메뉴가 연 오버레이 안의 클릭은 바깥 클릭으로 치지 않고, 다른 오버레이는 평소처럼 메뉴를
              닫습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Clicking a row closes the menu,</strong> unless the row carries{" "}
              <code>data-dropdown-keep-open</code> (also exported as <code>DROPDOWN_KEEP_OPEN_ATTR</code>). A custom{" "}
              <code>trigger</code>'s own <code>onClick</code> runs first; calling <code>preventDefault()</code> there
              keeps the menu from toggling.
            </span>
          ),
          ko: (
            <span>
              <strong>행을 누르면 메뉴가 닫힙니다.</strong> 행에 <code>data-dropdown-keep-open</code>(상수{" "}
              <code>DROPDOWN_KEEP_OPEN_ATTR</code>)이 있으면 예외입니다. 직접 넣은 <code>trigger</code>의{" "}
              <code>onClick</code>이 먼저 실행되며, 여기서 <code>preventDefault()</code>를 호출하면 메뉴가 열리거나
              닫히지 않습니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { st, usePage } from "@apps/koyo/client";
import { Dropdown, Switch } from "akanjs/ui";

interface OrderActionsProps {
  onEdit: () => void;
}
export const OrderActions = ({ onEdit }: OrderActionsProps) => {
  const { l } = usePage();
  const notify = st.use.notify();
  return (
    <Dropdown
      namespace="orderActions"
      value={l.trans({ en: "Actions", ko: "동작" })}
      content={
        <>
          <li>
            <button type="button" onClick={onEdit}>
              {l.trans({ en: "Edit", ko: "수정" })}
            </button>
          </li>
          <li data-dropdown-keep-open="">
            <Switch checked={notify} onChange={st.do.setNotify} />
          </li>
        </>
      }
    />
  );
};`,
    },
    {
      name: "BottomSheet",
      desc: l.trans({
        en: "The mobile overlay: a panel that slides up from the bottom edge. `type` decides almost everything; like `Modal`, it runs controlled or from its own `trigger`.",
        ko: "모바일용 오버레이로, 아래 가장자리에서 올라오는 패널입니다. 거의 모든 것은 `type`이 정하며, `Modal`처럼 controlled로도, 자기 `trigger`로도 동작합니다.",
      }),
      props: [
        {
          name: "type",
          type: `"full" | "half"`,
          desc: l.trans({
            en: "Required. `half` is 90% tall with a grab handle; `full` covers the screen with a close row.",
            ko: "필수입니다. `half`는 화면 높이의 90%에 손잡이를 그리고, `full`은 화면 전체를 덮고 닫기 행을 그립니다.",
          }),
        },
        {
          name: "open / onCancel",
          type: "boolean / () => void",
          desc: l.trans({
            en: "Controlled state. Left out, the sheet keeps its own and opens from `trigger` or the ref.",
            ko: "controlled 상태입니다. 빼면 시트가 상태를 직접 관리하며, `trigger`나 ref로 엽니다.",
          }),
        },
        {
          name: "trigger",
          type: "ReactNode",
          desc: l.trans({ en: "Element that opens the sheet.", ko: "시트를 여는 요소입니다." }),
        },
        {
          name: "header / handle / close",
          type: "ReactNode",
          desc: l.trans({
            en: "`header` replaces the whole top row; `handle` and `close` replace only the mark inside it.",
            ko: "`header`는 맨 위 행 전체를, `handle`과 `close`는 그 안의 표시만 바꿉니다.",
          }),
        },
        {
          name: "className / bodyClassName",
          type: "string",
          desc: l.trans({
            en: "Classes for the sheet surface and for its scrolling body.",
            ko: "시트 표면과 스크롤되는 본문에 적용할 class입니다.",
          }),
        },
        {
          name: "ref",
          type: "BottomSheetRef",
          desc: l.trans({
            en: "`{ open, close }`, an imperative handle for opening the sheet without a trigger.",
            ko: "`{ open, close }` 명령형 핸들입니다. 트리거 없이 시트를 열 때 씁니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Four ways to close it:</strong> drag a <code>half</code> sheet's handle down past a third of its
              height, tap the backdrop, press Escape, or use a <code>full</code> sheet's close row. Each one calls{" "}
              <code>onCancel</code> once; mounting never does.
            </span>
          ),
          ko: (
            <span>
              <strong>닫는 길은 넷입니다.</strong> <code>half</code> 시트의 손잡이를 높이의 1/3 넘게 끌어내리기, 배경
              누르기, Escape, <code>full</code> 시트의 닫기 행입니다. 어느 쪽이든 <code>onCancel</code>이 한 번
              호출되고, 마운트할 때는 호출되지 않습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>It sits above the page.</strong> The sheet opens over the frame's bars, or inside the modal it was
              opened from, pads for the safe area and stops the page from scrolling while open.
            </span>
          ),
          ko: (
            <span>
              <strong>페이지 위에 뜹니다.</strong> 시트는 프레임의 바 위에, 모달에서 열면 그 모달 안에 열리고, safe
              area만큼 여백을 두며 열려 있는 동안 페이지 스크롤을 막습니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { usePage } from "@apps/koyo/client";
import { BottomSheet, buttonRecipe } from "akanjs/ui";
import type { ReactNode } from "react";

interface FilterSheetProps {
  children: ReactNode;
}
export const FilterSheet = ({ children }: FilterSheetProps) => {
  const { l } = usePage();
  return (
    <BottomSheet
      type="half"
      trigger={
        <button type="button" className={buttonRecipe({ size: "sm" })}>
          {l.trans({ en: "Filter", ko: "필터" })}
        </button>
      }
    >
      {children}
    </BottomSheet>
  );
};`,
    },
    {
      name: "Tooltip",
      desc: l.trans({
        en: "A hint that appears on hover or keyboard focus, drawn on the overlay layer. It is for hints only: content that must be read does not belong in a tooltip.",
        ko: "마우스를 올리거나 키보드로 포커스하면 뜨는 힌트이며, 오버레이 층에 그립니다. 힌트 전용이라, 반드시 읽혀야 하는 내용은 툴팁에 넣지 마세요.",
      }),
      props: [
        {
          name: "content",
          type: "ReactNode",
          desc: l.trans({
            en: "The hint. Empty, `null` or `undefined` renders `children` alone.",
            ko: "힌트 내용입니다. 비어 있거나 `null`·`undefined`면 `children`만 그립니다.",
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "The trigger the bubble is anchored to.", ko: "말풍선이 붙는 트리거입니다." }),
        },
        {
          name: "side",
          type: `"top" | "right" | "bottom" | "left" = "top"`,
          desc: l.trans({
            en: "The side the bubble prefers. It flips to the opposite one when this side has no room.",
            ko: "말풍선이 놓일 방향입니다. 그쪽에 자리가 없으면 반대쪽으로 뒤집힙니다.",
          }),
        },
        {
          name: "variant",
          type: `"default" | "primary" | "info" = "default"`,
          desc: l.trans({
            en: "The bubble's colour. `Field.Label` uses `info` for the help icon beside a field description.",
            ko: "말풍선 색입니다. `Field.Label`은 필드 설명 옆 도움말 아이콘에 `info`를 씁니다.",
          }),
        },
        {
          name: "className",
          type: "string",
          desc: l.trans({ en: "Classes for the bubble.", ko: "말풍선에 적용할 class입니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Not in the page until it opens.</strong> The bubble is drawn on the overlay layer only while
              shown, so a scrolling list neither clips it nor grows wider for it.
            </span>
          ),
          ko: (
            <span>
              <strong>열리기 전에는 페이지에 없습니다.</strong> 말풍선은 보이는 동안에만 오버레이 층에 그려지므로,
              스크롤되는 목록이 잘라내지도, 그만큼 넓어지지도 않습니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>A conditional hint needs no wrapper.</strong> Pass an empty <code>content</code> and only the
              trigger renders. The bubble shows after 300 ms of hover (never on touch) or at once on keyboard focus, and
              closes on leave, blur or Escape.
            </span>
          ),
          ko: (
            <span>
              <strong>조건부 힌트에 래퍼가 필요 없습니다.</strong> <code>content</code>를 비워 두면 트리거만 그립니다.
              말풍선은 마우스를 올리고 300ms 뒤에(터치에서는 뜨지 않음), 키보드 포커스에는 바로 뜨며, 벗어나거나
              포커스를 잃거나 Escape를 누르면 닫힙니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Need one that follows the pointer?</strong> <code>Tooltip</code> is an override slot: bind your
              own in <code>_overrides.tsx</code> and every existing call site follows.
            </span>
          ),
          ko: (
            <span>
              <strong>포인터를 따라가는 툴팁이 필요하다면</strong> <code>_overrides.tsx</code>에서 직접 만든 것을
              연결하세요. <code>Tooltip</code>은 오버라이드 슬롯이라 기존 호출부가 모두 따라옵니다.
            </span>
          ),
        }),
      ],
      code: `import { Tooltip } from "akanjs/ui";

interface SyncedAtProps {
  at: string;
  detail: string;
}
export const SyncedAt = ({ at, detail }: SyncedAtProps) => {
  return (
    <Tooltip content={detail} side="right" variant="info">
      <span className="text-foreground/60 text-sm">{at}</span>
    </Tooltip>
  );
};`,
    },
    {
      name: "Menu",
      desc: l.trans({
        en: "A navigation menu built from data rather than markup: you pass an `items` tree and it draws the rows, the submenus and the active state. `mode` picks a sidebar or a top bar.",
        ko: "마크업이 아니라 데이터로 만드는 내비게이션 메뉴입니다. `items` 트리를 넘기면 행, 하위 메뉴, 활성 상태를 컴포넌트가 그립니다. 사이드바인지 상단 바인지는 `mode`로 고릅니다.",
      }),
      props: [
        {
          name: "items",
          type: "{ key, label, icon?, children?, type? }[]",
          desc: l.trans({
            en: "The tree of `MenuItem`s. A `children` array turns the row into a submenu.",
            ko: "`MenuItem` 트리입니다. `children` 배열이 있으면 그 행이 하위 메뉴가 됩니다.",
          }),
        },
        {
          name: "mode",
          type: `"horizontal" | "inline" = "inline"`,
          desc: l.trans({
            en: "`inline` for a sidebar. `horizontal` for a top bar, folding what does not fit into a `…` menu.",
            ko: "사이드바는 `inline`입니다. 상단 바는 `horizontal`이며, 넘치는 항목을 `…` 메뉴로 접습니다.",
          }),
        },
        {
          name: "selectedKeys / defaultSelectedKeys",
          type: "string[]",
          desc: l.trans({
            en: "Selected keys. `selectedKeys` is controlled; `defaultSelectedKeys` sets the start, first key only.",
            ko: "선택된 항목의 key입니다. `selectedKeys`는 controlled 값이고, `defaultSelectedKeys`는 시작값이며 첫 key만 씁니다.",
          }),
        },
        {
          name: "onClick",
          type: "(item: MenuItem) => void",
          desc: l.trans({
            en: "Receives the clicked item. In `inline` mode a row with children only expands.",
            ko: "클릭된 항목을 받습니다. `inline`에서 하위 메뉴가 있는 행은 펼쳐지기만 합니다.",
          }),
        },
        {
          name: "inlineCollapsed",
          type: "boolean",
          desc: l.trans({ en: "Hides the labels, leaving only the icons.", ko: "라벨을 숨기고 아이콘만 남깁니다." }),
        },
        {
          name: "activeStyle",
          type: `"bordered" | "active" = "bordered"`,
          desc: l.trans({
            en: "How the active row is marked: a bottom border, or a `bg-border` fill.",
            ko: "활성 행을 표시하는 방식입니다. 아래 테두리 또는 `bg-border` 배경입니다.",
          }),
        },
        {
          name: "renderItem",
          type: "(item, active) => ReactNode",
          desc: l.trans({
            en: "Draws one item's body. The row, its click and any submenu stay the framework's.",
            ko: "항목 하나의 본문을 직접 그립니다. 행, 클릭, 하위 메뉴는 프레임워크가 계속 맡습니다.",
          }),
        },
        {
          name: "ulClassName / liClassName / labelClassName",
          type: "string / string / (isActive) => string",
          desc: l.trans({
            en: "The list, each row and each label. `className` reaches the outer wrapper.",
            ko: "목록, 각 행, 각 라벨에 적용할 class입니다. `className`은 바깥 래퍼에 적용됩니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>
                <code>Menu</code> is not a <code>Dropdown</code>.
              </strong>{" "}
              <code>Menu</code> is a navigation structure and <code>Dropdown</code> a short-lived action list. They look
              alike but are not interchangeable: row actions on a list go in a <code>Dropdown</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>
                <code>Menu</code>와 <code>Dropdown</code>은 다릅니다.
              </strong>{" "}
              <code>Menu</code>는 내비게이션 구조이고 <code>Dropdown</code>은 잠깐 열리는 동작 목록입니다. 겉모습은
              비슷해도 서로 대신할 수 없으며, 목록의 행 동작은 <code>Dropdown</code>에 넣습니다.
            </span>
          ),
        }),
      ],
      code: `"use client";
import { usePage } from "@apps/koyo/client";
import { Menu } from "akanjs/ui";

interface AdminSiderProps {
  selected: string;
  onSelect: (key: string) => void;
}
export const AdminSider = ({ selected, onSelect }: AdminSiderProps) => {
  const { l } = usePage();
  return (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      onClick={(item) => onSelect(item.key)}
      items={[
        { key: "product", label: l.trans({ en: "Products", ko: "상품" }) },
        {
          key: "order",
          label: l.trans({ en: "Orders", ko: "주문" }),
          children: [
            {
              key: "order.open",
              label: l.trans({ en: "Open", ko: "진행 중" }),
            },
          ],
        },
      ]}
    />
  );
};`,
    },
    {
      name: "Portal",
      desc: l.trans({
        en: "Renders `children` into an element the page already has, named by `id`. In a CSR build it is the wiring behind `Layout.Navbar`: a component deep in a route fills the top bar without either one knowing about the other.",
        ko: "`children`을 페이지에 이미 있는 요소 안에 그리며, 그 요소는 `id`로 지정합니다. CSR 빌드에서는 `Layout.Navbar`가 이것으로 동작합니다. 라우트 깊숙한 컴포넌트가 서로를 모른 채 상단 바를 채웁니다.",
      }),
      props: [
        {
          name: "id",
          type: "string",
          desc: l.trans({
            en: "The host element's `id`, looked up after the first render: nothing renders before then, on the server included.",
            ko: "호스트 요소의 `id`이며 첫 렌더링 뒤에 찾습니다. 그 전에는 서버에서도 아무것도 그리지 않습니다.",
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "What is rendered into the host.", ko: "호스트 안에 그릴 내용입니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Fill the frame's slots through their Layout component.</strong> <code>Layout.Navbar</code>,{" "}
              <code>Layout.TopInset</code>, <code>Layout.TopLeftAction</code> and <code>Layout.BottomInset</code> pick
              the right host in a CSR build, and all but <code>TopLeftAction</code> reserve the slot's height.
            </span>
          ),
          ko: (
            <span>
              <strong>프레임 슬롯은 Layout 컴포넌트로 채우세요.</strong> <code>Layout.Navbar</code>,{" "}
              <code>Layout.TopInset</code>, <code>Layout.TopLeftAction</code>, <code>Layout.BottomInset</code>이 CSR
              빌드에서도 맞는 호스트를 고르고, <code>TopLeftAction</code>을 뺀 나머지는 슬롯 높이까지 잡아 줍니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>Frame slots are in the first HTML.</strong> On an SSR page the Layout components draw their chrome
              into the server HTML without a portal, and after hydration that same DOM moves into the slot, so text
              typed into it before hydration survives. A host of your own is filled only after hydration.
            </span>
          ),
          ko: (
            <span>
              <strong>프레임 슬롯은 첫 HTML에 들어 있습니다.</strong> SSR 페이지에서는 Layout 컴포넌트가 portal 없이
              chrome을 서버 HTML에 그리고, hydration 뒤에 그 DOM을 그대로 슬롯으로 옮기므로 hydration 전에 입력한 글자도
              남습니다. 직접 만든 호스트는 hydration 뒤에야 채워집니다.
            </span>
          ),
        }),
        l.trans({
          en: (
            <span>
              <strong>It is not a way out of a clipping parent.</strong> <code>Modal</code> already portals to{" "}
              <code>document.body</code>, and <code>Dropdown</code>, <code>Popconfirm</code> and <code>Select</code>{" "}
              also place themselves against their trigger.
            </span>
          ),
          ko: (
            <span>
              <strong>잘리는 부모에서 빠져나오는 수단이 아닙니다.</strong> <code>Modal</code>은 이미{" "}
              <code>document.body</code>에 portal로 그려지고, <code>Dropdown</code>, <code>Popconfirm</code>,{" "}
              <code>Select</code>는 여기에 더해 트리거 기준으로 자리를 잡습니다.
            </span>
          ),
        }),
      ],
      code: `import { Portal } from "akanjs/ui";
import type { ReactNode } from "react";

export const OrderToolbarHost = () => {
  return <div id="orderToolbar" className="flex gap-2" />;
};

interface OrderToolbarProps {
  children: ReactNode;
}
export const OrderToolbar = ({ children }: OrderToolbarProps) => {
  return <Portal id="orderToolbar">{children}</Portal>;
};`,
    },
    {
      name: "Copy",
      desc: l.trans({
        en: "Wraps a trigger so that clicking it copies `text` to the clipboard and shows a success toast.",
        ko: "트리거를 감싸서, 누르면 `text`를 클립보드에 복사하고 성공 토스트를 띄웁니다.",
      }),
      props: [
        {
          name: "text",
          type: `string = ""`,
          desc: l.trans({ en: "Text written to the clipboard.", ko: "클립보드에 복사할 텍스트입니다." }),
        },
        {
          name: "copyMessage",
          type: "string",
          desc: l.trans({
            en: 'The success toast. Defaults to "Copied" in the reader\'s language.',
            ko: '성공 토스트 문구입니다. 기본값은 언어에 맞춘 "복사되었습니다"입니다.',
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({
            en: "The trigger. An element keeps its own `onClick`, which runs before the copy.",
            ko: "트리거입니다. 요소라면 원래 `onClick`이 유지되고, 복사보다 먼저 실행됩니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <span>
              <strong>Works without the Clipboard API.</strong> Where <code>navigator.clipboard</code> is missing it
              falls back to a hidden text area. The toast goes through the store's <code>showMessage</code>.
            </span>
          ),
          ko: (
            <span>
              <strong>Clipboard API가 없어도 동작합니다.</strong> <code>navigator.clipboard</code>가 없으면 숨긴{" "}
              <code>textarea</code>로 복사합니다. 토스트는 store의 <code>showMessage</code>로 띄웁니다.
            </span>
          ),
        }),
      ],
      code: `import { usePage } from "@apps/koyo/client";
import { buttonRecipe, Copy } from "akanjs/ui";

interface ShareLinkProps {
  url: string;
}
export const ShareLink = ({ url }: ShareLinkProps) => {
  const { l } = usePage();
  return (
    <Copy
      text={url}
      copyMessage={l.trans({ en: "Link copied", ko: "링크를 복사했습니다" })}
    >
      <button type="button" className={buttonRecipe({ size: "sm" })}>
        {l.trans({ en: "Copy link", ko: "링크 복사" })}
      </button>
    </Copy>
  );
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overlays-ui" title={l.trans({ en: "Overlays UI", ko: "오버레이 UI" })}>
        <Docs.Title>{l.trans({ en: "Overlays UI", ko: "오버레이 UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The overlay components in <code>akanjs/ui</code>: modal windows, confirmations, bottom sheets, menus,
                  hints and a copy action. Start with <code>Modal</code>, and compose the headless <code>Dialog</code>{" "}
                  only when you need your own layout.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code>의 오버레이 컴포넌트입니다. 모달 창, 확인 팝오버, 바텀 시트, 메뉴, 힌트, 복사
                  동작을 다룹니다. 먼저 <code>Modal</code>을 쓰고, 배치를 직접 짜야 할 때만 headless <code>Dialog</code>
                  를 조합하세요.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Pick a component", ko: "컴포넌트 고르기" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Component", ko: "컴포넌트" })}
            columns={overlayColumns}
            groups={overlayGroups}
            markLabel={l.trans({ en: "Does it", ko: "해당" })}
            emptyLabel={l.trans({ en: "Does not", ko: "해당 없음" })}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A portalled overlay is never clipped.</strong> <code>Modal</code>, <code>BottomSheet</code>,{" "}
                    <code>Dropdown</code>, <code>Popconfirm</code>, <code>Select</code> and <code>Tooltip</code> render
                    at <code>document.body</code>, so a scrolling modal body or a table's overflow container cannot cut
                    them off.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>portal로 그리는 오버레이는 잘리지 않습니다.</strong> <code>Modal</code>,{" "}
                    <code>BottomSheet</code>, <code>Dropdown</code>, <code>Popconfirm</code>, <code>Select</code>,{" "}
                    <code>Tooltip</code>은 <code>document.body</code>에 그려지므로 스크롤되는 모달 본문이나 테이블의
                    overflow 컨테이너가 잘라내지 못합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Portal</code> is the same idea with a name.
                    </strong>{" "}
                    It renders into a host element you pick by <code>id</code> instead of at the end of the body.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Portal</code>은 같은 장치에 이름을 붙인 것입니다.
                    </strong>{" "}
                    body 끝이 아니라 <code>id</code>로 고른 호스트 요소 안에 그립니다.
                  </span>
                ),
              })}
            </li>
          </ul>
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
