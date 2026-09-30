---
"akanjs": patch
---

fix: `NativeFile.resolveIn` judges a path by where it lands

A link already in the folder the user granted used to take `resolveIn(grant, "link/…")` to wherever it pointed, and
the page names the relative path. The path is now checked again after the links on it are resolved — through its
nearest existing folder when the file is about to be written — and a dangling link is refused. A name that starts
with two dots (`..cache/x`) is inside the folder, not above it.
