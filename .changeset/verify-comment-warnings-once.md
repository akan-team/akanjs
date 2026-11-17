---
"@akanjs/cli": patch
---

`akan verify` lists a comment added since the last commit once, and counts it on one line from the next run on.

Each run used to print every added comment again until it was committed, so comments kept on purpose stood between the reader and what had changed: 27 `akan.comment.added` lines on every run in one app. A comment an earlier run reported is now counted on a single line, `akan.comment.kept 27 comments added since the last commit, reported by an earlier run, are still in 9 files; akan verify --comments lists them`, and only a new or reworded comment gets its own line. `akan verify --comments` prints them all, as before.

What was reported is kept in `.akan/verify/comments.json` at the workspace root, by file and comment text, so moving a comment does not report it again; a commit empties it, and what the commit left out is listed once more. The Stop hook of `akan agent install` is unchanged: it still sends back every comment added in the files a session edited.
