---
"@akanjs/vscode": minor
---

The editor extension now publishes from CI to the VS Marketplace and Open VSX, without a stored token.

- A push to `rc` publishes a pre-release numbered `<major>.<next odd minor>.<run number>`.
- A push to `main` publishes the package version as a release, unless both registries already have it.
- A release takes an even minor, so this bumps the extension to 0.2.0.
