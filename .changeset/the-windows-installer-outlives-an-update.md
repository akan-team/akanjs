---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

An app `build-desktop --installer` installed takes updates and uninstalls cleanly after them

- The uninstaller lives beside the app folder (`<folder>.uninstall.exe`), not in the folder an update replaces, so
  Settings › Apps can still remove an updated app. It finds the folder from the uninstall entry and removes it with
  whatever updates left beside it (`.previous`, unpacked or failed releases) and itself.
- The Start menu shortcut and the app `/RUN` or the last page starts work in `%LOCALAPPDATA%`: Windows cannot rename a
  folder some process works in, which is what applying an update does.
- `/RUN` starts the app after a silent install only; an interactive one offers it on its last page, and used to start
  it twice.
- A silent install that cannot finish exits with 2 instead of 0: files it could not write (the script is long-path
  aware, and the build warns when the deepest file nears 260 characters under `%LOCALAPPDATA%\Programs`), a WebView2
  Runtime still missing after its setup ran (an interactive install asks), or a `/D=` folder holding someone else's
  files.
- The WebView2 setup's signature check works under a user folder with `'` in its name.
- An uninstaller that cannot be written beside the folder (a `/D=` right under a drive root) fails the install
  instead of leaving an app nothing can remove.
- An applied update sets `DisplayVersion` under any profile folder name: `reg.exe` output is no longer parsed.
