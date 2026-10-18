---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
"create-akan-workspace": patch
---

Dependency refresh for the published packages:

- **React 19.3.1** (`react`, `react-dom`, `react-server-dom-webpack`), together with the 19.0.9 / 19.1.10 / 19.2.9 backports of the same day.
- **Majors**: `chalk` 6, `commander` 15, `fontaine` 1, `firebase` 13 (optional peer), `happy-dom` / `@happy-dom/global-registrator` 21 (optional peers; CSS and iframe loading are now off by default).
- **Minors and patches**: `lexical` and every `@lexical/*` 0.52, `typebox` 1.3.37, `@biomejs/biome` 2.5.14, `@inquirer/prompts`, `@tailwindcss/node` / `tailwindcss` 4.3.3, `dayjs`, `immer`, `ignore`, `ora`, `string-width`, `subset-font`, `tailwind-merge`, `tailwind-variants`, `protobufjs`, `react-icons`, `@react-spring/web`, `@playwright/test`, `@types/bun`, and `bullmq` / `ioredis` to their latest 5.x.

Held back on purpose: `typescript` 7 (no compiler API, which devkit's scanners and transforms need), `ink` 7/8 (drop bracketed-paste markers and mouse reports from `useInput`, which `akan code`'s paste and wheel scrolling read), `ioredis` 6 (RESP3 by default) and `bullmq` 6 (backend rewrite), which need the conformance suite against real Redis, and `@biomejs/biome` 2.5.15 (reports `Object.keys(…).sort()` and other string sorts under `useArraySortCompare`).

Upgrade note: a workspace pins `react` / `react-dom` to `19.3.1` to match the `akanjs` peer range.
