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
