---
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

The generated Dockerfile names its format and its sections, and `@akanjs/devkit/akanConfig` exports its generator.

- The file `akan build` writes opens with `# akan:dockerfile 1`, and each section starts at a comment:
  `# akan:install-stage` (only with `crossBuild`), `# akan:base`, `# akan:pre-runs`, `# akan:install`,
  `# akan:post-runs` and `# akan:app`, a section with no instruction left out. A tool that edits the file finds a
  section by its marker instead of matching an instruction, which broke without a word each time an instruction
  changed (the pinned `FROM`, `tini`, the frozen-lockfile install, the `install` stage). The number rises when the
  sections are added, dropped, renamed or reordered. The instructions are the ones written before; only comments are
  added. A `docker` written as a string is still used verbatim and carries no marker.
- `@akanjs/devkit/akanConfig` now exports what `akanConfig/dockerImage.ts` holds: `dockerfileOf`,
  `dockerfileLayoutOf` (the format and each section's lines, or `null` for a file the generator did not write),
  `DOCKERFILE_FORMAT`, `dockerfileSections`, `DEFAULT_DOCKER_IMAGE`, `BUN_IMAGE_PIN`, `DOCKER_INIT`,
  `DOCKER_RUN_USER`, `DOCKER_WRITE_DIRS`, `DOCKER_IGNORED`, `dockerRunScripts` and `dockerImageScript`. Import them
  from there, not from the file's path under `node_modules`.

Upgrading: a tool that compared the generated Dockerfile's first line with `FROM …`, or the whole text with a
fixture, now meets `# akan:dockerfile 1` first and a marker line before each section.
