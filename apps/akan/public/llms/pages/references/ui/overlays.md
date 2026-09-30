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

- You pass `open` and set it back in `onCancel`. Left out, the component keeps its own open state.

- A name in `_overrides.tsx` that swaps a component for one route subtree.

- scrim: A see-through layer behind a popover that catches the click outside it.

Pick a component

Component

- Portalled — document.body

- At trigger

- Override slot — _overrides.tsx

- Windows over the page

- Anchored to a trigger

- Navigation and helpers

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

- Dialog: The headless compound parts that `Modal` is built from. Compose them when `Modal`'s fixed layout does not fit, or when the in-page agent should be able to open and close the dialog.

- Popconfirm: A small OK/cancel popover that stands in front of a destructive or irreversible action. Wrap the trigger in it and pass the action as `onConfirm`.

- Dropdown: A compact action menu under a trigger button. It is the usual home for row actions, comment menus and other context actions in a list.

- BottomSheet: The mobile overlay: a panel that slides up from the bottom edge. `type` decides almost everything; like `Modal`, it runs controlled or from its own `trigger`.

- Tooltip: A hint that appears on hover or keyboard focus, drawn in pure CSS. It is for hints only: content that must be read does not belong in a tooltip.

- Menu: A navigation menu built from data rather than markup: you pass an `items` tree and it draws the rows, the submenus and the active state. `mode` picks a sidebar or a top bar.

- Portal: Renders `children` into an element the page already has, named by `id`. It is the wiring behind `Layout.Navbar`: a component deep in a route fills the top bar without either one knowing about the other.

- Copy: Wraps a trigger so that clicking it copies `text` to the clipboard and shows a success toast.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

