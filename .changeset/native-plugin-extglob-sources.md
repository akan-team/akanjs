---
"@akanjs/devkit": patch
---

A native plugin's `ios.sources` and `android.sources` accept the extglob forms Bun 1.4.4's glob added: `!(…)`, `@(…)` and `+(…)` (for example `ios/!(Preview).swift`). They used to be read as one literal file name and failed the build with "source … not found". `?(…)`, `*(…)` and brace ranges such as `{1..3}` already reached the glob.
