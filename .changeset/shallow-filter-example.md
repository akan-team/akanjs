---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The `akan-page` skill shows a URL-kept filter as code: read it from `usePageLocation().searchParams`, change it with a shallow `router.replace`, and never keep it in `useState`, since a shallow back draws no page and leaves the copy on the old value. Run `akan agent install` in a workspace to pick up the new files.
