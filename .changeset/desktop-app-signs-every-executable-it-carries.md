---
"akanjs": patch
---

fix: a macOS desktop app signs every executable its server carries, whatever the file is named

The build picked the files to sign in the carried server by extension (`.node`, `.dylib`, `.so`), so an executable
with no extension, like one a package ships, went into the app without its signature, which Developer ID signing and
notarization refuse. It now reads each file's header and signs every Mach-O file, and nothing else.
