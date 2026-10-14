---
"akanjs": patch
---

A stack transition keeps this navigation's direction, and the page slides as one sheet.

React concatenates transition types it kept from an entangled navigation, and the later CSS rule wins, so a push that still carried a pop type played backwards. The direction is now a document attribute set for the current navigation. The page content is one element, so the snapshot is the whole page rather than each top-level box sliding on its own and flashing through the gaps.
