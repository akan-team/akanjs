---
"akanjs": patch
---

feat: `RecentTime` accepts a `relative` prop for customizing relative labels

Default `fromNow` is unchanged (`하루 전`). `"auto"` / `"always"` switch to `Intl.RelativeTimeFormat` (`어제` vs `1일 전`), and a function replaces the relative label entirely — `breakUnit` still decides when the absolute date takes over.
