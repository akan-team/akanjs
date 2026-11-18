---
"@akanjs/cli": patch
---

fix(cli): `akan verify` says nothing of a comment an earlier run already reported, until a new one appears

After listing a comment added since the last commit, every later `akan verify` printed one `akan.comment.kept`
warning counting it ("1 comment added since the last commit, reported by an earlier run, is still in 1 file") until
the next commit. A comment kept on purpose therefore left a warning on every run, often the only one. The count now
appears only on a run that also lists a new comment, where it says the listing is not the whole set; a run with
nothing new prints no comment warning. `akan verify --comments` lists every one, as before.
