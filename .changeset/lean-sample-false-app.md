---
"@akanjs/cli": patch
"create-akan-workspace": patch
---

`--sample false` now creates a minimal first app. Before, it left out the `task` module but still wrote the demo home page, its jelly theme and button, and nine Pretendard font files, which a coding agent read and then deleted.

- **`--sample false`**, and `akan create-application`, write a `page/_index.tsx` with one heading, a `page/_layout.tsx` with the title and the light theme, and a `page/styles.css` that imports Tailwind and `akanjs/ui/styles.css` and sets the semantic color tokens for dark and light. `public/` holds `favicon.ico` and `apple-touch-icon.png`. There is no `ui/Recipe`, `page/_overrides.tsx`, `public/jelly/`, `logo.png` or font. The app's hand-written text goes from 32.4K to 8.6K characters, and its binary files from 7.4 MB to 25 KB.
- **`--sample true`**, the default, gives the same app as before: the sample now carries the demo home page, the jelly theme, `jellyButtonRecipe` with its `page/_overrides.tsx`, the logo and the Pretendard fonts, along with the `task` module.
