---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A Windows desktop release is signed with Authenticode

With `AKAN_NATIVE_WINDOWS_CERTIFICATE` + `_CERTIFICATE_PASSWORD` (a `.pfx`), `AKAN_NATIVE_WINDOWS_THUMBPRINT` (a
certificate in the store) or `AKAN_NATIVE_WINDOWS_SIGN_COMMAND` (a JSON array run once per file with `{file}`, for Azure
Trusted Signing or a cloud HSM), `akan build-desktop` signs every PE file of the app — the executable, its DLL, the
server's addons and `bin` — SHA-256 with an RFC 3161 timestamp (`AKAN_NATIVE_WINDOWS_TIMESTAMP_URL`), and verifies them.
`--installer` signs the setup program and, through makensis's `!uninstfinalize`, the uninstaller it writes; the
settings reach the signer through the environment only. `publish-update` signs a Windows release the same way, and an
unsigned release build warns that SmartScreen flags a downloaded copy.
