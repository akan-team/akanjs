---
"akanjs": patch
---

Under an iOS shell that leaves the keyboard to the page, the page box now starts moving with the keys on their first frame. It followed a store update and React's render of the frame, which on a phone started the move about 100 ms after the keys, then jumped to catch up. `Device` now sets `--akan-keyboard-cover`, `--akan-keyboard-duration`, `--akan-keyboard-easing` and `data-akan-keyboard` on the root in the shell's keyboard event itself, and the page box's height and bottom padding follow `--akan-keyboard-cover` in CSS, so the transition starts before any render. `isPageKeyboardAvoidance` and `IOS_KEYBOARD_ANIMATION_EASING` now come from `akanjs/client` too.
