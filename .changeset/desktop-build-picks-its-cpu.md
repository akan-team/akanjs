---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build-desktop --arch arm64|x64` picks the CPU a Windows or Linux desktop app runs on

A desktop app is still built on its own OS, now for either of its CPUs: the Rust library is built for that target,
the executable with `bun build --compile --target=bun-<os>-<arch>`, the carried server installs with
`bun install --cpu=<arch>` so its addons' prebuilt binaries are that CPU's, and each `bin` entry is that platform's.
The setup program and the AppImage name the CPU they hold. A macOS app is Apple silicon only: Intel Macs are not a
target, so `--arch x64` on macOS is refused.
