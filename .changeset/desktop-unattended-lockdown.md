---
"akanjs": patch
---

A desktop app built with `native.desktop.recovery: "reload"`, the setting of an app nobody attends (a kiosk, a signage screen), keeps its pages from opening a way out of its windows:

- **No print dialog.** On Windows `window.print()` does nothing in the app's pages, their frames (a frame a script makes included) and external views, and a PDF a page shows has no save or print button. On macOS the shell refuses the print a page asks for with `NOT_ALLOWED`. On Linux a page's print opens no dialog.
- **No file dialog or share sheet.** On Windows and macOS a file input, its `showPicker()` and the File System Access pickers open nothing, and `navigator.share()` is refused. On Linux a file input opens no file chooser.
- **No other program.** A link or `window.open` a page would hand to the OS (`http`, `https`, `mailto`, `tel`, `security.shell.externalSchemes`) is logged and dropped, and on Windows WebView2 hands no scheme to another program. On macOS a page's right-click menu has no Search With Google, Look Up, Translate, Quick Note, Writing Tools or Services, which hand its text to another app.
- **No download** from a page on Windows.

What the app opens through its opener and file-picker plugins is unchanged.

Upgrade note: an app with `desktop.recovery: "reload"` whose pages relied on a print dialog, a file input, a download or a link opening in the system browser no longer gets them; open those through the opener or file-picker plugin instead.
