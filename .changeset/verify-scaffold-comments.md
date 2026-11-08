---
"@akanjs/cli": patch
---

`akan verify` no longer reports the comments a scaffold writes as `akan.comment.added`. Every comment in a new, uncommitted file counted as added, so right after `akan create-module` or `akan create-service` it flagged the `// state` and `// action` markers the agent guide says to keep, and in a workspace scaffolded inside another repository it flagged every comment in the sample. The Claude Code Stop hook then sent the agent back to delete them. A comment now counts only when some line of it differs from every line the CLI's own templates emit, so a comment written by hand in a new file is still reported.
