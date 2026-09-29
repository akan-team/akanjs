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
that showed the dialog over its IPC channel, so it reaches what the user picked and nothing else; behind a dev
build, `akan start` checks the grant's signature instead, in `operationMode` local only. A phone or the web
refuses `forServer`.
