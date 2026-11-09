---
"akanjs": patch
---

A root layout's fonts now preload one face per family instead of every face. By default that is the regular face: 400 normal, or the weight a browser draws regular text with when the family has no 400 (500, then lighter, then heavier). Every other weight still has its `@font-face` rule, with `font-display: swap`, and loads when text first uses it. A path set to `preload: true` is preloaded as well, and `preload: false` still never is. The app template's home page declares nine Pretendard weights and preloaded all of them, 166 KB; it now preloads one, 18 KB, and fetches the three other weights it shows when it draws them. To keep a weight the first screen shows preloaded, set `preload: true` on its path; the akanjs.com layout now does that for 700 and 900.
