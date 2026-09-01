# akan — Claude Code Guide

@AGENTS.md

## Comments — Overrides Your Default

Write **no comments** unless the comment passes the test below. This is the rule agents break most often here, so it
is repeated outside the guide: a diff that adds a comment the test rejects is a diff to redo.

Before typing `//`, `/*`, or a doc block, ask — **does this sentence carry a fact that is nowhere in the code?**

- Restates the identifier, the signature, or the line under it → delete it.
- Labels a section (`// helpers`, `// state`) or narrates a step (`// fetch the user`, `// then save`) → delete it.
- JSDoc on an ordinary function, or a why/how preamble on ordinary logic → delete it.
- Explains the edit you just made, for whoever reads the diff → say it in your reply, not in the file.
- Names a vendor or protocol quirk, an infrastructure constraint, a library gotcha, security reasoning, a math
  derivation, a domain field's business meaning, a state transition, or why an obvious alternative was rejected →
  keep it, one line.

That keep-list is exact — `Comments` in the guide is the full version. "It aids readability" and "this logic is
subtle" are not on it: rename or split the code instead. When you edit an existing file, match its density; if the
surrounding code carries none, your diff carries none.
