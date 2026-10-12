---
"@akanjs/devkit": patch
---

The refusal a desktop build gives when its server bundle holds an env secret names the bundle file and the env file with `/` on every OS, as the rest of akan's messages do, instead of `apps\demo\env\…` on Windows.
