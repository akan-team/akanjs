---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

An external view shows `native.backgroundColor` until its page's first frame instead of white, and a Windows app's executable names the app as its company when `desktop.publisher` is unset instead of keeping Bun's own ("Oven"), which Explorer and Windows Firewall's prompt showed.
