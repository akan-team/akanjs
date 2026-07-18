import { usePage } from "@apps/akan/client";
import { Docs, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "Modal",
      desc: l.trans({
        en: "Controlled modal wrapper built on Akan's headless `Dialog` state. Use it for common app overlays where you want title/content/action slots without composing the full dialog namespace.",
        ko: "Akan의 headless `Dialog` state 위에 구성된 controlled modal wrapper입니다. full dialog namespace를 직접 조합하지 않고 title/content/action slot만 필요한 일반 app overlay에 사용합니다.",
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
      code: `import { Modal } from "akanjs/ui";

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
          name: "Dialog.Title / Content / Action",
          type: "components",
          desc: l.trans({ en: "Named modal slots.", ko: "이름이 있는 modal slot입니다." }),
        },
      ],
      code: `import { Dialog } from "akanjs/ui";

<Dialog defaultOpen={false}>
  <Dialog.Trigger>
    <button className="btn">Open</button>
  </Dialog.Trigger>
  <Dialog.Modal>
    <Dialog.Title>Custom dialog</Dialog.Title>
    <Dialog.Content>Body content</Dialog.Content>
    <Dialog.Action><button className="btn">Save</button></Dialog.Action>
  </Dialog.Modal>
</Dialog>;`,
    },
    {
      name: "Popconfirm",
      desc: l.trans({
        en: "Inline confirmation popover for destructive or irreversible actions. It wraps a trigger element and shows localized OK/cancel buttons.",
        ko: "파괴적이거나 되돌릴 수 없는 action을 위한 inline confirmation popover입니다. trigger element를 감싸고 localized OK/cancel button을 표시합니다.",
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
  <button className="btn btn-error btn-sm">Remove</button>
</Popconfirm>;`,
    },
    {
      name: "Dropdown",
      desc: l.trans({
        en: "Compact dropdown menu wrapper. It is commonly used for row actions, comment/story menus, and context actions in list UIs.",
        ko: "compact dropdown menu wrapper입니다. list UI의 row action, comment/story menu, context action에 자주 사용됩니다.",
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
      ],
      code: `import { Dropdown } from "akanjs/ui";

<Dropdown
  value="Actions"
  content={
    <>
      <li><button>Edit</button></li>
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
  <button className="btn btn-sm">Copy link</button>
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
      <div className="divider" />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
