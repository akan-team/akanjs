---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A desktop app's server reads the files the user picks, with no copy and no path in the page

`filePicker.pickFiles({ forServer: true })` (also `pickDirectory` and `saveFile`; `filePicker` is now exported from
`akanjs/client/native`) copies nothing on the desktop, whatever the file's size: its FileRefs serve the originals,
and each result carries a grant. The server exchanges the grant with `NativeFile.resolve(grant, "read" | "write" |
"folder")` from `akanjs/server`, or `NativeFile.resolveIn(folderGrant, relative)`. The carried server asks the shell
that showed the dialog over its IPC channel, so it reaches what the user picked and nothing else; a debug build
that carries its server does the same. Behind a dev build without one, `akan start` checks the grant's signature
instead, in `operationMode` local only. A phone or the web refuses `forServer`.

`resolveIn` judges a relative path by where it lands once the links on it are resolved — through its nearest existing
folder when the file is about to be written — so a link inside the granted folder cannot take it elsewhere, and a
dangling link is refused. A name that starts with two dots (`..cache/x`) is inside the folder, not above it.
