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

Controlled modal wrapper built on Akan's headless `Dialog` state. Use it for common app overlays where you want title/content/action slots without composing the full dialog namespace. The surface is deliberately plain — no transition, no gesture — so it never animates content the user is reading. `LegacyModal` keeps the previous animated skin.

Controlled open state.

Called when the modal requests closing.

Optional title slot.

Optional footer/action slot.

Ask for confirmation before closing.

Headless compound dialog namespace for custom modal composition. Use it when `Modal` is too opinionated and you need a custom trigger, title, content, or action layout.

Provider/root for dialog state.

Opens the dialog from custom trigger content.

Modal surface and close behavior.

Previous surface: spring open/close and drag-to-dismiss on touch.

Named modal slots.

Inline confirmation popover for destructive or irreversible actions. It wraps a trigger element and shows localized OK/cancel buttons. The popover portals to document.body and is placed against its trigger — above it when there is no room below, with the pointer following — so it is not clipped by a modal, a scrolling container, or the dropdown menu that Model.Remove draws it from. Its scrim swallows the next click, and the overlay that opened it stays open.

Confirmation title.

Optional detailed message.

Called when the user confirms.

Custom button labels.

Compact dropdown menu wrapper. It is commonly used for row actions, comment/story menus, and context actions in list UIs. The menu portals to document.body and is placed against its trigger, so it is not clipped by a modal surface, a scrolling modal body, or a table's scroll container. A menu item may open a Modal: the menu stays mounted while it is closed, so the overlay survives, and clicks inside an overlay this menu opened do not count as outside clicks. An overlay it did not open still dismisses it.

Trigger button content.

Dropdown menu content.

Classes for the trigger button.

Classes for the menu panel.

Trigger edge the menu lines up with, end (right) by default. Position is computed, so a left-0 class cannot do this.

Put it on a menu item that runs its own interaction (a switch, a copy button) so clicking it does not close the menu.

Copy-to-clipboard trigger that also shows a global success message through Akan store messages.

Text copied to the clipboard.

Optional custom success message.

Trigger element.

Overlays UI

Overlay components cover modal flows, custom dialogs, destructive confirmations, dropdown menus, and copy actions. Use `Modal` for common controlled overlays and the headless `Dialog` namespace for custom composition.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

