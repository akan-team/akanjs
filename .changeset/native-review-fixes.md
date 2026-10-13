---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

Native app fixes:

- **Desktop updates keep the installed app's signer.**
  - On macOS, an app signed with a Developer ID team refuses a downloaded release that the same team did not sign.
  - On Windows, an app whose exe has a valid Authenticode signature refuses a release whose exe isn't signed by the same subject.
  - An ad hoc or unsigned installed app takes releases as before.
  - A refused release is recorded as failed (`NOT_ALLOWED`) and is not offered again.
- **iOS:** a pending web bundle becomes the trial when the first window asks for its page, not at launch. A silent push that launches the app in the background no longer starts a trial that the next launch rolls back as `relaunch`.
- **Android:**
  - A destroyed activity's ready timer no longer fires after `recreate()` and rolls back the trial its new activity runs.
  - A downloaded web bundle can no longer be pruned between its move into place and its staging.

Upgrade note: build every desktop release the way the installed app was signed, with `--sign` and the same `AKAN_NATIVE_MACOS_*` / `AKAN_NATIVE_WINDOWS_*` identity. A signed installed app now refuses an unsigned or differently signed release, so republish that release signed.
