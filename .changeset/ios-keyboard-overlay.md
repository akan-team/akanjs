---
"akanjs": patch
---

A chat screen in an iOS app can now keep the whole screen while the keys are up, as a native chat does, so its tab bar and background stay drawn under the glass keyboard instead of the page ending at the keys. When the focused field sits inside an element marked `data-akan-keyboard-overlay`, `KeyboardRide` leaves the page box whole: the riders (`data-akan-keyboard-ride`) go where the shorter box would have put them and stay there, and a rider marked `data-akan-keyboard-ride="inset"` (a list's content) trades its lift for bottom padding once the keys are up, so the list still scrolls to its top. The root carries `data-akan-keyboard-overlay` meanwhile. Every other field keeps the page box ending at the keys, so a form field elsewhere is never left under them.
