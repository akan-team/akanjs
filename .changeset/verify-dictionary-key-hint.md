---
"@akanjs/cli": patch
---

`akan verify` now says which dictionary to edit when an `Err`, `l()` or `msg` key does not exist. TypeScript reported the miss as the expected key union cut short (`"base.error.documentNotFound" | … 47 more …`), so the line showed neither the missing key's module nor what to change. The line now reads, for example, `"memo.error.imageTooLarge" is not an error key of the memo dictionary fix: add imageTooLarge: [en, ko] to .error({}) in memo.dictionary.ts`. Other type errors print as before.
