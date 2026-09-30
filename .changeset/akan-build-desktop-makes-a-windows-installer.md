---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build-desktop --installer` makes a Windows setup program

On Windows the build adds `<file>-<version>-<arch>-setup.exe`, made with NSIS (`winget install NSIS.NSIS`). It installs
for the current user under `%LOCALAPPDATA%\Programs\<app name>`, where the updates plugin swaps the app without an
administrator, with a Start menu shortcut and an uninstall entry. `/S` installs silently and `/RUN` starts the app
afterwards, and a PC without the WebView2 Runtime gets it. A copy of the app running from the folder is stopped first,
found by its path. The program is not code-signed yet.

- The uninstaller lives beside the app folder (`<folder>.uninstall.exe`), not in the folder an update replaces, so
  Settings › Apps can still remove an updated app. It finds the folder from the uninstall entry and removes it with
  whatever updates left beside it (`.previous`, unpacked or failed releases) and itself. An uninstaller that cannot be
  written there (a `/D=` right under a drive root) fails the install.
- The Start menu shortcut and the app `/RUN` or the last page starts work in `%LOCALAPPDATA%`: Windows cannot rename a
  folder some process works in, which is what applying an update does.
- `/RUN` starts the app after a silent install only; an interactive one offers it on its last page.
- A silent install that cannot finish exits with 2: files it could not write (the script is long-path aware, and the
  build warns when the deepest file nears 260 characters under `%LOCALAPPDATA%\Programs`), a WebView2 Runtime still
  missing after its setup ran (an interactive install asks), or a `/D=` folder holding someone else's files.
- An update the app confirms sets the version Settings › Apps shows.
