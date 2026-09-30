# Overlays

- Source: /references/ui/overlays
- Mirror: /llms/pages/references/ui/overlays.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Overlays UI (#overlays-ui)

## Content

Overlays

Overlays UI

The overlay components in `akanjs/ui`: modal windows, confirmations, bottom sheets, menus, hints and a copy action. Start with `Modal`, and compose the headless `Dialog` only when you need your own layout.

Words used on this page

Term

- portal: Drawing an element elsewhere in the DOM, here at the end of `document.body`, so no parent clips it.

- trigger: The element the user clicks to open the overlay, passed as `trigger` or as `children`.

- controlled: You pass `open` and set it back in `onCancel`. Left out, the component keeps its own open state.

- override slot: A name in `_overrides.tsx` that swaps a component for one route subtree.

- scrim: A see-through layer behind a popover that catches the click outside it.

Pick a component

Component

Portalled — document.body

At trigger

Override slot — _overrides.tsx

- Windows over the page

  - Modal: A centred window with title, body and footer slots. The default for a modal flow.

  - Dialog: The headless parts `Modal` is built from, for a custom layout or an agent-named dialog.

  - BottomSheet: A mobile panel that slides up from the bottom edge. Drawn in place, fixed to the screen.

- Anchored to a trigger

  - Popconfirm: A small OK/cancel popover before a destructive action.

  - Dropdown: A short action menu, such as the actions on a list row.

  - Tooltip: A hover or focus hint in pure CSS. At the screen edge it is clipped, not moved.

- Navigation and helpers

  - Menu: A navigation menu built from an `items` tree, for a sidebar or a top bar.

  - Portal: Renders its children into a host element named by `id`.

  - Copy: Copies text to the clipboard and shows a success toast.

Does it

Does not

**A portalled overlay is never clipped.** `Modal`, `Dropdown`, `Popconfirm` and `Select` render at `document.body`, so a scrolling modal body or a table's overflow container cannot cut them off.

**`Portal` is the same idea with a name.** It renders into a host element you pick by `id` instead of at the end of the body.

**`Tooltip` does none of this on purpose.** It is pure CSS, so it costs almost nothing, and near the screen edge it is clipped rather than moved.

Related pages

- Forms UI — `Select`, the fourth control that portals its list and anchors it to the field.

- Override Slots — Swap `Modal`, `Popconfirm`, `Dropdown`, `Tooltip` or `Menu` for one route subtree.

- Core UI — `Layout.Navbar` and the other frame slots that `Portal` fills.

- In-Page Agent — How the tools a component publishes let the agent drive the screen.

- Modal: A centred window with title, body and footer slots, built on the headless `Dialog`. Reach for it first; compose `Dialog` only when you need a layout of your own.

  - open (boolean): Controlled open state. May be left out when `trigger` is given.

  - onCancel (() => void): Called when the modal closes itself: the close button, a backdrop click or Escape.

  - trigger (ReactNode): Element that opens the modal. With it, the modal keeps its own open state.

  - title (string | ReactNode): The header row. Left out, no header is drawn.

  - action (ReactNode): The footer row, right-aligned. Usually buttons.

  - closeButton (ReactNode | false): The corner close control, wired by its slot, so a replacement needs no handler. `false` draws none.

  - confirmClose (boolean = false): Asks with the browser's confirm dialog before closing.

  - className / bodyClassName (string): Classes for the window and for its scrolling body.

  - **Nothing moves.** The window has no transition and no gesture, so content the user is reading never animates. `LegacyModal` keeps the previous spring skin, with `open` and `onCancel` required and no `trigger` or `closeButton`.

  - **Focus and scroll are handled.** Opening moves focus into the window and locks the page scroll; closing returns focus to where it was.

  - **It is the Modal override slot.** A replacement bound in `_overrides.tsx` reaches every `<Modal>`, including the ones `Model.*` draws. `LegacyModal` is not overridable.

- Dialog: The headless compound parts that `Modal` is built from. Compose them when `Modal`'s fixed layout does not fit, or when the in-page agent should be able to open and close the dialog.

  - Dialog ({ open?, defaultOpen? = false, namespace?, className? }): The root that holds the open state. `open` is followed whenever it changes.

  - namespace (string): Names the dialog for the in-page agent. Without it, the dialog publishes no tool.

  - Dialog.Trigger ({ className?, children }): Opens the dialog when anything inside it is clicked.

  - Dialog.Modal ({ onCancel?, confirmClose?, closeButton?, className?, bodyClassName? }): The plain window `Modal` draws. Escape, a backdrop click and the corner button close it.

  - Dialog.LegacyModal ({ onCancel?, confirmClose?, className?, bodyClassName? }): The previous window: spring open/close and drag-to-dismiss on touch.

  - Dialog.Title / Dialog.Action ({ children }): Draw nothing where written; they hand their children to the header and footer rows.

  - Dialog.Content ({ className?, children }): The body, a full-width block.

  - **A namespace publishes three names.** `namespace="share"` gives the agent `openDialogInShare`, `closeDialogInShare` and the `dialogInShare` state. Two dialogs on one screen need different names.

  - **The agent closes it the way a person does.** Its close goes through the window's own dismissal, so `confirmClose` and `onCancel` still run. `Modal` takes no `namespace`, so it publishes nothing.

- Popconfirm: A small OK/cancel popover that stands in front of a destructive or irreversible action. Wrap the trigger in it and pass the action as `onConfirm`.

  - title (ReactNode): The question, in bold.

  - description (ReactNode): Optional detail under the title.

  - onConfirm (() => void): Called when the user presses OK. The popover closes first.

  - okText / cancelText (ReactNode): Button labels. The defaults are the `base.ok` and `base.cancel` dictionary entries.

  - okButtonProps / cancelButtonProps (ButtonHTMLAttributes & { loading? }): Attributes spread onto the two default buttons.

  - icon (ReactNode | false): The mark beside the message, a warning icon by default. `false` draws none.

  - actions (ReactNode): Replaces the whole footer. The replacement owns both the confirm and the dismiss.

  - triggerClassName / decoClassName (string): Classes for the trigger wrapper and for the pointer. `decoClassName` also takes over its position.

  - **Never clipped.** The popover portals to `document.body` and sits under the trigger's end edge. With no room below it flips above, and the pointer follows.

  - **The scrim takes the outside click.** Clicking outside, or Escape, only cancels the popover. A `Dropdown` or modal that opened it stays open.

  - **Removing a model record?** `Model.RemoveWrapper` already draws this popover and publishes the removal as an agent tool.

- Dropdown: A compact action menu under a trigger button. It is the usual home for row actions, comment menus and other context actions in a list.

  - value (ReactNode): Content of the default trigger, a ghost button.

  - trigger (ReactNode): Your own trigger instead of the button. It is cloned, so it must forward className, onClick, aria-*.

  - content (ReactNode): The menu rows. They render inside a `<ul>`, so write `<li>` items.

  - align ("start" | "end" = "end"): The trigger edge the menu lines up with. A `left-0` class cannot change it.

  - namespace (string): Names the menu for the in-page agent. Without it, the menu publishes no tool.

  - className / buttonClassName / dropdownClassName (string): Classes for the wrapper, the trigger button and the menu panel.

  - data-dropdown-keep-open (attribute): Put on a row with its own interaction, such as a switch, so clicking it keeps the menu open.

  - **Never clipped.** The menu portals to `document.body` and is placed against its trigger, so a modal, a scrolling modal body or a table's scroll container cannot cut it off.

  - **A row may open a Modal.** A closed menu is hidden, not unmounted, so the modal survives. Clicks inside an overlay this menu opened are not outside clicks; any other overlay still closes it.

  - **Clicking a row closes the menu,** unless the row carries `data-dropdown-keep-open` (also exported as `DROPDOWN_KEEP_OPEN_ATTR`). A custom `trigger`'s own `onClick` runs first; calling `preventDefault()` there keeps the menu from toggling.

- BottomSheet: The mobile overlay: a panel that slides up from the bottom edge. `type` decides almost everything; like `Modal`, it runs controlled or from its own `trigger`.

  - type ("full" | "half"): Required. `half` is 90% tall with a grab handle; `full` covers the screen with a close row.

  - open / onCancel (boolean / () => void): Controlled state. Left out, the sheet keeps its own and opens from `trigger` or the ref.

  - trigger (ReactNode): Element that opens the sheet.

  - header / handle / close (ReactNode): `header` replaces the whole top row; `handle` and `close` replace only the mark inside it.

  - className / bodyClassName (string): Classes for the sheet surface and for its scrolling body.

  - ref (BottomSheetRef): `{ open, close }`, an imperative handle for opening the sheet without a trigger.

  - **Four ways to close it:** drag a `half` sheet's handle down past a third of its height, tap the backdrop, press Escape, or use a `full` sheet's close row. Each one calls `onCancel`.

- Tooltip: A hint that appears on hover or keyboard focus, drawn in pure CSS. It is for hints only: content that must be read does not belong in a tooltip.

  - content (ReactNode): The hint. Empty, `null` or `undefined` renders `children` alone.

  - children (ReactNode): The trigger the bubble is anchored to.

  - side ("top" | "right" | "bottom" | "left" = "top"): Which side of the trigger the bubble sits on.

  - variant ("default" | "primary" | "info" = "default"): The bubble's colour. `Field.Label` uses `info` for the help icon beside a field description.

  - className (string): Classes for the bubble.

  - **Light, but it never moves.** No state, no portal and no position pass, so it works in the server-rendered HTML. The cost: near the viewport edge the bubble is clipped rather than flipped.

  - **A conditional hint needs no wrapper.** Pass an empty `content` and only the trigger renders. The bubble shows after 300 ms of hover, or at once on keyboard focus.

  - **Need one that flips or follows the pointer?** `Tooltip` is an override slot: bind your own in `_overrides.tsx` and every existing call site follows.

- Menu: A navigation menu built from data rather than markup: you pass an `items` tree and it draws the rows, the submenus and the active state. `mode` picks a sidebar or a top bar.

  - items ({ key, label, icon?, children?, type? }[]): The tree of `MenuItem`s. A `children` array turns the row into a submenu.

  - mode ("horizontal" | "inline" = "inline"): `inline` for a sidebar. `horizontal` for a top bar, folding what does not fit into a `…` menu.

  - selectedKeys / defaultSelectedKeys (string[]): Selected keys. `selectedKeys` is controlled; `defaultSelectedKeys` sets the start, first key only.

  - onClick ((item: MenuItem) => void): Receives the clicked item. In `inline` mode a row with children only expands.

  - inlineCollapsed (boolean): Hides the labels, leaving only the icons.

  - activeStyle ("bordered" | "active" = "bordered"): How the active row is marked: a bottom border, or a `bg-border` fill.

  - renderItem ((item, active) => ReactNode): Draws one item's body. The row, its click and any submenu stay the framework's.

  - ulClassName / liClassName / labelClassName (string / string / (isActive) => string): The list, each row and each label. `className` reaches the outer wrapper.

  - **`Menu` is not a `Dropdown`.** `Menu` is a navigation structure and `Dropdown` a short-lived action list. They look alike but are not interchangeable: row actions on a list go in a `Dropdown`.

- Portal: Renders `children` into an element the page already has, named by `id`. It is the wiring behind `Layout.Navbar`: a component deep in a route fills the top bar without either one knowing about the other.

  - id (string): The host element's `id`. Nothing renders until that element is mounted.

  - children (ReactNode): What is rendered into the host.

  - **Fill the frame's slots through their Layout component.** `Layout.Navbar`, `Layout.TopInset`, `Layout.TopLeftAction` and `Layout.BottomInset` pick the right host in a CSR build, and all but `TopLeftAction` reserve the slot's height.

  - **Frame slots are in the first HTML.** During SSR their content is written into the shell instead of appearing after hydration. A host of your own is filled in the browser.

  - **It is not a way out of a clipping parent.** `Modal` already portals to `document.body`, and `Dropdown`, `Popconfirm` and `Select` also place themselves against their trigger.

- Copy: Wraps a trigger so that clicking it copies `text` to the clipboard and shows a success toast.

  - text (string = ""): Text written to the clipboard.

  - copyMessage (string): The success toast. Defaults to "Copied" in the reader's language.

  - children (ReactNode): The trigger. An element keeps its own `onClick`, which runs before the copy.

  - **Works without the Clipboard API.** Where `navigator.clipboard` is missing it falls back to a hidden text area. The toast goes through the store's `showMessage`.

## Code Examples

### Modal

```ts
"use client";
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
};
```

### Dialog

```ts
"use client";
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
};
```

### Popconfirm

```ts
"use client";
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
};
```

### Dropdown

```ts
"use client";
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
};
```

### BottomSheet

```ts
"use client";
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
};
```

### Tooltip

```ts
import { Tooltip } from "akanjs/ui";

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
};
```

### Menu

```ts
"use client";
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
};
```

### Portal

```ts
import { Portal } from "akanjs/ui";
import type { ReactNode } from "react";

export const OrderToolbarHost = () => {
  return <div id="orderToolbar" className="flex gap-2" />;
};

interface OrderToolbarProps {
  children: ReactNode;
}
export const OrderToolbar = ({ children }: OrderToolbarProps) => {
  return <Portal id="orderToolbar">{children}</Portal>;
};
```

### Copy

```ts
import { usePage } from "@apps/koyo/client";
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
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

