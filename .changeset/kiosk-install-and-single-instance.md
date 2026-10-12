---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

Windows desktop apps:
- An uninstall no longer leaves the app's exe behind when a watchdog starts the app again meanwhile. The stop step kills whatever starts from the folder until nothing runs, and deletes the exe in that same pass.
- A setup run with `/S` shows no "Verifying installer" window over a kiosk. NSIS shows it whatever `/S` says, so the setup no longer CRC-checks itself.
- Two launches from different kinds of session no longer both run as the first instance. Before, a launch from an SSH or service-started session and one from the desktop each started their own server on the same data, because the single-instance pipe name hashed USERDOMAIN, which differs between those sessions. The pipe name now comes from the user's profile folder.
- A gate plugin is waited for up to 30 s, not 3, so a slow single-instance check can no longer let a second launch start its server before it exits.
