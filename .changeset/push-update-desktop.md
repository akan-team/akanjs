---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan push-update <app> --platform desktop` (or `macos`, `windows`, `linux`, with `--arch arm64|x64`) uploads to the Akan Cloud project the desktop release `akan publish-update` last signed for the channel. It sends `<channel>.json`, its `.sig`, the archive and the patches that manifest names, byte for byte, and nothing else in the folder, so the same folder stays valid on your own host. They go up in one uncompressed tar, beside a `release.json` that records the CLI version, the build time and the app's signer: the macOS Team ID or the Windows Authenticode subject, or none for an unsigned or Linux app. The release is checked first against the target's `updates.publicKeys[0]`, the one key installed apps trust. The command prints whether the project published, staged or rejected it, and the manifest URL installed apps read. A rejection exits 2. A desktop release can be up to 1 GiB, while a phone pack stays at 200 MiB. `akan update-keygen --platform desktop` now says where `updates.url` comes from, on Akan Cloud and when self-hosted.
