---
"@akanjs/cli": patch
"create-akan-workspace": patch
---

A new app's default style is now Pretendard with -3% letter spacing, even font sizes from 12px, 150% line height for text that may wrap and the font's own line height (`leading-auto`) for a single line.

- **`akan create-application`** and **`--sample false`** write Pretendard Regular, Medium, SemiBold and Bold under `public/fonts` and declare them as the root layout's default font. The app's binary files go from 25 KB to 3.1 MB. The sample adds Thin, ExtraLight, Light, ExtraBold and Black, as before. Both layouts subset the font to `latin` and `ks-x-1001`, so Korean text renders in Pretendard, not the system font.
- **`page/styles.css`** gives every `text-*` step, `text-xs` (12px) to `text-9xl` (128px), `-0.03em` letter spacing and a `1.5` line height, sets the root's letter spacing to `-0.03em`, and adds `leading-auto` (`line-height: normal`) for one line of text.
- **The sample** follows the same rules. The 11px chips are `text-xs`. The `h1, h2` letter-spacing rule, `tracking-tight`, `tracking-[-0.06em]`, `leading-6` and `leading-8` are gone. The hero name steps from `text-6xl` to `text-9xl` instead of a fluid `clamp()`. Buttons, chips and badges take `leading-auto`.
