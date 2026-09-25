---
"akanjs": patch
---

fix(ui): give Escape to the topmost overlay, and size the Select panel to its options

`Modal` was the only overlay that closed on Escape, and it listened on `window` per instance — so two
stacked dialogs both heard the same key and went down together. Escape now runs through one shared stack
(`useEscapeKey`) that hands the key to the surface opened last, and `BottomSheet` and `Popconfirm` are on
it too. A confirm popover inside a modal closes itself and leaves the modal standing.

`Select`'s open panel was a fixed `h-[270px]`, because `height` cannot ease to `auto` and the open/close
transition needed something to animate. A three-option list therefore rendered with ~100px of dead space
below it. The transition moves to `max-height`, which animates just as well and lets the panel end where
its options do, and the always-on scrollbar becomes `overflow-y-auto`.

Also: the dialog surface takes `outline-none`. Focus moves onto it when the dialog opens so the tab order
starts inside, but Chrome treats that programmatic focus as keyboard focus whenever the last interaction
was a key — or a click on a non-button trigger — and drew a ring around the whole surface. Controls inside
keep their own focus rings.

And `Tooltip`'s wrapper takes `w-fit`: `inline-flex` alone still stretches when the trigger is an item of a
column flex container, and the bubble's `left-1/2` then centred on that full width, far from the trigger.

`Dropdown`'s panel loses the `gap-2` between rows and the stray `pr-3`, which together padded a three-item
menu out to 132px of mostly empty space; rows now sit `gap-0.5` apart inside symmetric padding.
