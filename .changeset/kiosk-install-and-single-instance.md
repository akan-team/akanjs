---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

Windows desktop apps:
- An uninstall no longer leaves the app's exe behind when a watchdog starts the app again meanwhile. The stop step kills whatever starts from the folder until nothing runs, and deletes the exe in that same pass.
- A setup no longer fails when a watchdog starts the app again between the stop and the folder swap. The stop step moves the install folder to `<folder>.setup-old` in the pass that finds nothing running; the setup then checks the unpacked files and moves the folder back when they are incomplete, before the second rename puts the new files in place.
- A setup run with `/S` shows no "Verifying installer" window over a kiosk. NSIS shows it whatever `/S` says, so the setup no longer CRC-checks itself.
- Two launches from different kinds of session no longer both run as the first instance. Before, a launch from an SSH or service-started session and one from the desktop each started their own server on the same data, because the single-instance pipe name hashed USERDOMAIN, which differs between those sessions. The pipe name now comes from the account SID in the process token, read through `bun:ffi`, and from the profile folder only where the token cannot be read. A running instance of the older build is not found across the upgrade, but the setup stops it first anyway.
- A gate plugin is waited for up to 30 s, not 3, so a slow single-instance check can no longer let a second launch start its server before it exits.
- The launch phase's own deadline, on every desktop OS, is 45 s, the gate, setup and ready waits added up, where it was 18 s, so a launch whose gate is still deciding is no longer ended early.
- A setup's or uninstall's stop step that hangs is ended after a minute and counts as a failed stop. A setup then reports the app in use, where before it waited as long as the stop did.
- The running instance logs one line when another launch hands over to it, with the argument count only, so a launch with no console of its own still leaves a trace.
