---
"akanjs": patch
"@akanjs/devkit": patch
---

`native.ios.hideFormAccessoryBar: true` (or a target's `ios.hideFormAccessoryBar`) leaves out the bar WebKit shows above the keyboard while a page field is focused. The iOS shell already had the switch, but `akan.config.ts` refused the key and the native config never carried it, so every iOS app showed the bar.
