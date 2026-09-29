---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`trustedDependencies` in `akan.config.ts` names the packages whose install scripts run where the app is installed

`bun install --production` skips every dependency's install and postinstall scripts unless the package is trusted, so
a native addon that builds itself at install time (one that ships no prebuilds) reached the image unbuilt and failed
at its first call. An app or a lib now lists those packages in `trustedDependencies`; the built `package.json`
carries the list, and both the image and a desktop app's server run their scripts. A lib's list reaches every app.
