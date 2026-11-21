---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The seven path rules an agent loads for its first files are a fifth shorter (24.0 KB to 18.7 KB as installed; the `app`, `config` and `page` rules go from 14.3 KB to 9.0 KB). The `app` rule no longer repeats the root guide's "Rules That Break The Build" and keeps only what that list leaves out; its sync section keeps the three refusals a hand edit meets, and the root allowlists, module file names, generated barrels and `package.json` ownership move to a new `syncRule` guideline, a reference of the `akan-deps` skill (`akan guideline show syncRule`). The `config` rule leaves the Docker image, the second database mode, log sinks and the desktop app's server to `runtimeRule`, which already carried them; the `page` rule leaves the inline script policy, the root layout in a CSR bundle, lib pages and `devOnly` to `pageRule`, which now carries each. `biome.json` being strict JSON and `akan lint`'s 200-diagnostic cap move to the `akan-validate` skill. The root guide's "Path Rules" now says a rule loads when a file tool reads or edits a match, not when a shell command or a scaffold writes one.
