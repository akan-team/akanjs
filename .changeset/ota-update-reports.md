---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`updates.report: { url }` has a phone post what became of each web bundle release, so whoever publishes sees rollback rates.

- **Events:** downloaded, applied, confirmed, rolled back (timeout, relaunch, hang, failed check at start) and failed (download, file hash, disk, signature, manifest).
- **When:** at the next launch or return to the foreground, 20 to a request. Events wait until the server takes them, at most 100.
- **Identity:** a random install id that lasts as long as the install, not a device identifier, and nothing about the user.
- **Store builds:** `bundle.json` names the address, so a server registering the binary can check it is its own.
