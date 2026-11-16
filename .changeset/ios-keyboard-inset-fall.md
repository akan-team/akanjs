---
"akanjs": patch
---

A chat list under an iOS overlay (`data-akan-keyboard-ride="inset"`) now slides down with the keys instead of dropping at once when they go down. Once the keys were up the list held its rise as bottom padding, so its box reached past what it showed by that padding; on the way down `KeyboardRide` read the box's bottom as where the list was drawn, found no distance to travel, and the list fell into place in one frame. The rise each inset rider took is now remembered and subtracted, so the list starts from where it was drawn.
