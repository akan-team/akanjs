import { usePage } from "@apps/akan/client";
import { Divider, Docs, DocsToc, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "Modal",
      desc: l.trans({
        en: "Controlled modal wrapper built on Akan's headless `Dialog` state. Use it for common app overlays where you want title/content/action slots without composing the full dialog namespace. The surface is deliberately plain — no transition, no gesture — so it never animates content the user is reading. `LegacyModal` keeps the previous animated skin.",
        ko: "Akan의 headless `Dialog` state 위에 구성된 controlled modal wrapper입니다. full dialog namespace를 직접 조합하지 않고 title/content/action slot만 필요한 일반 app overlay에 사용합니다. transition과 gesture가 없는 단순한 surface라서 읽고 있는 내용이 움직이지 않습니다. 이전 애니메이션 skin은 `LegacyModal`에 남아 있습니다.",
      }),
      props: [
        {
          name: "open",
          type: "boolean",
          desc: l.trans({ en: "Controlled open state.", ko: "controlled open state입니다." }),
        },
        {
          name: "onCancel",
          type: "() => void",
          desc: l.trans({
            en: "Called when the modal requests closing.",
            ko: "modal이 닫힘을 요청할 때 호출됩니다.",
          }),
        },
        {
          name: "title",
          type: "string | ReactNode",
          desc: l.trans({ en: "Optional title slot.", ko: "optional title slot입니다." }),
        },
        {
          name: "action",
          type: "ReactNode",
          desc: l.trans({ en: "Optional footer/action slot.", ko: "optional footer/action slot입니다." }),
        },
        {
          name: "confirmClose",
          type: "boolean",
          desc: l.trans({ en: "Ask for confirmation before closing.", ko: "닫기 전에 confirmation을 요청합니다." }),
        },
      ],
      code: `import { Modal, buttonRecipe } from "akanjs/ui";

export const ProductModal = ({ open, close, product }) => (
  <Modal open={open} onCancel={close} title="Product">
    <ProductView product={product} />
  </Modal>
);`,
    },
    {
      name: "Dialog",
      desc: l.trans({
        en: "Headless compound dialog namespace for custom modal composition. Use it when `Modal` is too opinionated and you need a custom trigger, title, content, or action layout.",
        ko: "custom modal composition을 위한 headless compound dialog namespace입니다. `Modal`보다 custom trigger, title, content, action layout이 필요할 때 사용합니다.",
      }),
      props: [
        {
          name: "Dialog",
          type: "{ open?, defaultOpen?, className? }",
          desc: l.trans({ en: "Provider/root for dialog state.", ko: "dialog state를 위한 provider/root입니다." }),
        },
        {
          name: "Dialog.Trigger",
          type: "component",
          desc: l.trans({
            en: "Opens the dialog from custom trigger content.",
            ko: "custom trigger content로 dialog를 엽니다.",
          }),
        },
        {
          name: "Dialog.Modal",
          type: "component",
          desc: l.trans({
            en: "Modal surface and close behavior.",
            ko: "modal surface와 close behavior를 제공합니다.",
          }),
        },
        {
          name: "Dialog.LegacyModal",
          type: "component",
          desc: l.trans({
            en: "Previous surface: spring open/close and drag-to-dismiss on touch.",
            ko: "이전 surface입니다. spring 전환과 touch drag-to-dismiss가 있습니다.",
          }),
        },
        {
          name: "Dialog.Title / Content / Action",
          type: "components",
          desc: l.trans({ en: "Named modal slots.", ko: "이름이 있는 modal slot입니다." }),
        },
      ],
      code: `import { Dialog } from "akanjs/ui";

<Dialog defaultOpen={false}>
  <Dialog.Trigger>
    <button className={buttonRecipe()}>Open</button>
  </Dialog.Trigger>
  <Dialog.Modal>
    <Dialog.Title>Custom dialog</Dialog.Title>
    <Dialog.Content>Body content</Dialog.Content>
    <Dialog.Action><button className={buttonRecipe()}>Save</button></Dialog.Action>
  </Dialog.Modal>
</Dialog>;`,
    },
    {
      name: "Popconfirm",
      desc: l.trans({
        en: "Inline confirmation popover for destructive or irreversible actions. It wraps a trigger element and shows localized OK/cancel buttons. The popover portals to document.body and is placed against its trigger — above it when there is no room below, with the pointer following — so it is not clipped by a modal, a scrolling container, or the dropdown menu that Model.Remove draws it from. Its scrim swallows the next click, and the overlay that opened it stays open.",
        ko: "파괴적이거나 되돌릴 수 없는 action을 위한 inline confirmation popover입니다. trigger element를 감싸고 localized OK/cancel button을 표시합니다. popover는 document.body로 portal되어 trigger 기준으로 배치되며, 아래 공간이 없으면 위로 뒤집히고 화살표도 따라갑니다. 따라서 modal, 스크롤 컨테이너, Model.Remove가 이것을 그리는 dropdown menu에 잘리지 않습니다. scrim이 다음 클릭을 흡수하고, 이것을 연 overlay는 열린 채로 남습니다.",
      }),
      props: [
        {
          name: "title",
          type: "string",
          desc: l.trans({ en: "Confirmation title.", ko: "confirmation title입니다." }),
        },
        {
          name: "description",
          type: "ReactNode",
          desc: l.trans({ en: "Optional detailed message.", ko: "optional detailed message입니다." }),
        },
        {
          name: "onConfirm",
          type: "() => void",
          desc: l.trans({ en: "Called when the user confirms.", ko: "사용자가 confirm할 때 호출됩니다." }),
        },
        {
          name: "okText / cancelText",
          type: "string",
          desc: l.trans({ en: "Custom button labels.", ko: "custom button label입니다." }),
        },
      ],
      code: `import { Popconfirm } from "akanjs/ui";

<Popconfirm title="Remove product?" onConfirm={() => remove(product.id)}>
  <button className={buttonRecipe({ variant: "destructive", size: "sm" })}>Remove</button>
</Popconfirm>;`,
    },
    {
      name: "Dropdown",
      desc: l.trans({
        en: "Compact dropdown menu wrapper. It is commonly used for row actions, comment/story menus, and context actions in list UIs. The menu portals to document.body and is placed against its trigger, so it is not clipped by a modal surface, a scrolling modal body, or a table's scroll container. A menu item may open a Modal: the menu stays mounted while it is closed, so the overlay survives, and clicks inside an overlay this menu opened do not count as outside clicks. An overlay it did not open still dismisses it.",
        ko: "compact dropdown menu wrapper입니다. list UI의 row action, comment/story menu, context action에 자주 사용됩니다. menu는 document.body로 portal되어 trigger 기준으로 배치되므로 modal surface, 스크롤되는 modal body, table scroll container에 잘리지 않습니다. menu item이 Modal을 열어도 됩니다. 메뉴는 닫힐 때 unmount되지 않고 숨겨지므로 overlay가 그대로 유지되며, 이 메뉴가 연 overlay 내부 클릭은 외부 클릭으로 처리되지 않습니다. 이 메뉴가 열지 않은 overlay는 평소대로 메뉴를 닫습니다.",
      }),
      props: [
        {
          name: "value",
          type: "ReactNode",
          desc: l.trans({ en: "Trigger button content.", ko: "trigger button content입니다." }),
        },
        {
          name: "content",
          type: "ReactNode",
          desc: l.trans({ en: "Dropdown menu content.", ko: "dropdown menu content입니다." }),
        },
        {
          name: "buttonClassName",
          type: "string",
          desc: l.trans({ en: "Classes for the trigger button.", ko: "trigger button에 적용할 class입니다." }),
        },
        {
          name: "dropdownClassName",
          type: "string",
          desc: l.trans({ en: "Classes for the menu panel.", ko: "menu panel에 적용할 class입니다." }),
        },
        {
          name: "align",
          type: `"start" | "end"`,
          desc: l.trans({
            en: "Trigger edge the menu lines up with, end (right) by default. Position is computed, so a left-0 class cannot do this.",
            ko: "menu를 trigger의 어느 쪽 끝에 맞출지 정합니다. 기본값은 end(오른쪽)입니다. 위치를 계산해서 넣기 때문에 left-0 class로는 바꿀 수 없습니다.",
          }),
        },
        {
          name: "data-dropdown-keep-open",
          type: "attribute",
          desc: l.trans({
            en: "Put it on a menu item that runs its own interaction (a switch, a copy button) so clicking it does not close the menu.",
            ko: "자체 상호작용을 가진 menu item(switch, copy button 등)에 붙이면 클릭해도 메뉴가 닫히지 않습니다.",
          }),
        },
      ],
      code: `import { Dropdown } from "akanjs/ui";

<Dropdown
  value="Actions"
  content={
    <>
      <li><button>Edit</button></li>
      <li data-dropdown-keep-open="">
        <Switch checked={notify} onChange={setNotify} />
      </li>
      <li><button>Remove</button></li>
    </>
  }
/>;`,
    },
    {
      name: "Copy",
      desc: l.trans({
        en: "Copy-to-clipboard trigger that also shows a global success message through Akan store messages.",
        ko: "clipboard에 복사하고 Akan store message로 global success message를 보여주는 trigger입니다.",
      }),
      props: [
        {
          name: "text",
          type: "string",
          desc: l.trans({ en: "Text copied to the clipboard.", ko: "clipboard에 복사할 text입니다." }),
        },
        {
          name: "copyMessage",
          type: "string",
          desc: l.trans({ en: "Optional custom success message.", ko: "optional custom success message입니다." }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "Trigger element.", ko: "trigger element입니다." }),
        },
      ],
      code: `import { Copy } from "akanjs/ui";

<Copy text={shareUrl}>
  <button className={buttonRecipe({ size: "sm" })}>Copy link</button>
</Copy>;`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overlays-ui" title={l.trans({ en: "Overlays UI", ko: "Overlays UI" })}>
        <Docs.Title>{l.trans({ en: "Overlays UI", ko: "Overlays UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Overlay components cover modal flows, custom dialogs, destructive confirmations, dropdown menus, and copy actions. Use `Modal` for common controlled overlays and the headless `Dialog` namespace for custom composition.",
              ko: "Overlay component는 modal flow, custom dialog, destructive confirmation, dropdown menu, copy action을 다룹니다. 일반 controlled overlay에는 `Modal`, custom composition에는 headless `Dialog` namespace를 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <DocsToc />
    </Scroll>
  );
}
