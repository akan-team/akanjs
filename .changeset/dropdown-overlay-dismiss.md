---
"akanjs": patch
---

fix(ui): keep a Modal opened from a Dropdown menu alive

`Dropdown` dismissed on any `mousedown` outside its own DOM subtree, but `Dialog/Modal` leaves that subtree
through `createPortal(document.body)`. A `Model.Edit` (or any Modal) rendered as a menu item therefore read
every click inside itself as an outside click: the menu closed, its content unmounted, and the modal it had
opened went with it — without an animation, and without running `onCancel`. Because `EditModal` derives its
openness from the store rather than local state, the `<model>Modal === "edit"` left behind then re-opened
the editor by itself the next time the menu mounted its content.

React context reaches through a portal where the DOM does not, so ownership is now explicit rather than
inferred from the DOM: `Dropdown` hands its content a scope, and a `Modal` stamps whichever scope rendered
it onto the roots it portals out (`data-akan-overlay`). A dismiss check then recognises the overlays it
owns — including ones opened by a nested scope — and ignores clicks inside them, while an overlay it does
not own dismisses it as any other outside click would.

Four changes:

- Dismiss checks ignore clicks inside an overlay the dismissing scope owns. A dropdown rendered *inside* a
  modal is unaffected, since that modal is not its own — it still dismisses on an ordinary click in it.
- The menu is hidden rather than unmounted once it has been opened, so an overlay a menu item opened
  survives the menu closing.
- `EditModal` resets the modal it owns when it unmounts while open, whatever tore it down. The reset is
  deferred one microtask so a remount in the same commit (a re-keyed list row) claims the modal back instead.
- A menu item marked `data-dropdown-keep-open` no longer closes the menu, so a switch or copy button inside
  a menu stays usable.

Both `Data.ListContainer` and `Data.Item` put action lists straight into a `Dropdown`, so list and item
toolbars were affected the same way. An app-authored overlay that portals itself can join the same
bookkeeping by spreading `useOverlayLayerProps()` onto its portal roots.
